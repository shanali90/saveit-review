import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// expo-notifications 0.28.19 (SDK 51): parseTrigger infers trigger type from shape
// (exact key-count matching after stripping channelId). Do NOT add a `type` field to
// user-facing triggers — the extra key breaks isDailyTriggerInput / isWeeklyTriggerInput.
//
// RACE FIX: scheduleReminderNotification is called from commitItems on every item
// state change. Rapid-fire calls (e.g. save → enrich, or sync → action) race:
// call B's cancelReminderNotifications() can cancel what call A just scheduled.
// We serialize calls with a promise-chain lock so each completes before the next starts.

import { getReminderCandidate, reminderIntervalDays } from '@/services/reminders';
import { nextReminderDate, reminderAgeText } from '@/services/time';
import { platformDisplayName } from '@/services/url';
import { SavedItem, UserSettings } from '@/types';

const REMINDER_ID_KEY = 'saveit-daily-reminder';
const ITEM_REMINDER_ID_PREFIX = 'saveit-item-reminder-';
const CATEGORY_ID = 'saved-item-reminders-v2';

// ── Notifications ──────────


/**
 * Tracks the last-processed notification response to prevent re-firing.
 *
 * CRITICAL: This key is set BEFORE any action logic runs (atomically),
 * so that concurrent calls from both the live listener AND the cold-start
 * getLastNotificationResponseAsync() path are blocked. The previous fix
 * set this AFTER the action ran, leaving a race window where both paths
 * could pass the guard before either one wrote the key.
 */
let lastProcessedResponseKey: string | null = null;

export class NotificationPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotificationPermissionError';
  }
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    priority: Notifications.AndroidNotificationPriority.DEFAULT
  })
});

export async function configureNotificationActions(): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CATEGORY_ID, {
        name: 'Saved item reminders',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        enableVibrate: true,
        vibrationPattern: [0, 180, 120, 180],
        showBadge: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC
      });
    }

    await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
      {
        identifier: 'WATCH_NOW',
        buttonTitle: 'Watch now',
        options: { opensAppToForeground: true }
      },
      {
        identifier: 'MARK_DONE',
        buttonTitle: 'Mark done',
        options: { opensAppToForeground: true }
      },
      {
        identifier: 'SNOOZE_1_DAY',
        buttonTitle: 'Snooze',
        options: { opensAppToForeground: true }
      }
    ]);
  } catch {
    // Notification actions are best-effort.
  }
}

export async function requestNotificationAccess(): Promise<boolean> {
  try {
    await ensureNotificationAccess();
    return true;
  } catch {
    return false;
  }
}

export async function ensureNotificationAccess(): Promise<void> {
  let existing: Notifications.NotificationPermissionsStatus;
  try {
    existing = await Notifications.getPermissionsAsync();
  } catch (error) {
    throw new Error(`Could not read notification permission status: ${errorMessage(error)}`);
  }

  if (existing.granted) return;

  let requested: Notifications.NotificationPermissionsStatus;
  try {
    requested = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true
      }
    });
  } catch (error) {
    throw new Error(`Could not request notification permission: ${errorMessage(error)}`);
  }

  if (!requested.granted) {
    const status = requested.status ? ` Status: ${requested.status}.` : '';
    const osName = Platform.OS === 'ios' ? 'iOS' : 'Android';
    throw new NotificationPermissionError(
      `Notifications permission is not granted.${status} Enable notifications for SaveIt in ${osName} settings and try again.`
    );
  }
}

/**
 * Serialization lock for scheduleReminderNotification.
 * Each call chains onto the previous, so cancel-then-schedule in call A
 * finishes before call B begins its own cancel-then-schedule.
 */
let scheduleLock: Promise<string | null> = Promise.resolve(null);

export function scheduleReminderNotification(items: SavedItem[], settings: UserSettings): Promise<string | null> {
  scheduleLock = scheduleLock
    .catch(() => null)
    .then(() => scheduleReminderNotificationImpl(items, settings));
  return scheduleLock;
}

async function scheduleReminderNotificationImpl(items: SavedItem[], settings: UserSettings): Promise<string | null> {
  await cancelReminderNotifications();
  if (!settings.notifications_enabled) return null;
  await configureNotificationActions();
  await ensureNotificationAccess();

  const candidate = getReminderCandidate(items);
  const unwatchedCount = items.filter((item) => !item.is_done).length;
  if (!candidate || unwatchedCount === 0) return null;

  const headline = candidate.save_reason?.trim() || candidate.clean_title;
  const platformLabel = platformDisplayName(candidate.platform);
  const ageText = reminderAgeText(candidate);

  // Section 5 fix: Summary mode uses aggregate count as title headline,
  // Individual mode spotlights one specific item — as expected.
  let title: string;
  let body: string;

  if (settings.notification_style === 'summary') {
    title = unwatchedCount === 1
      ? '📺 1 save waiting'
      : `📺 ${unwatchedCount} saves waiting`;
    body = `Next up: ${headline} · ${platformLabel} — saved ${ageText}`;
  } else {
    title = `📌 ${headline}`;
    body = `Ready to watch? ${headline} · ${platformLabel} — saved ${ageText}`;
  }

  const intervalDays = reminderIntervalDays(settings);
  const nextDate = nextReminderDate(settings.reminder_time, intervalDays);
  const trigger = dailyReminderTrigger(nextDate, intervalDays);

  let identifier: string;
  try {
    identifier = await Notifications.scheduleNotificationAsync({
      identifier: REMINDER_ID_KEY,
      content: {
        title,
        body,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        data: {
          itemId: String(candidate.id),
          url: String(candidate.url || ''),
          platform: candidate.platform
        },
        categoryIdentifier: CATEGORY_ID
      },
      trigger
    });
  } catch (scheduleError: unknown) {
    throw scheduleError;
  }

  if (identifier !== REMINDER_ID_KEY) {
    throw new Error(`Native scheduler returned unexpected daily reminder identifier "${identifier}".`);
  }

  await logScheduledTrigger('daily-reminder', identifier);
  return identifier;
}

/**
 * Self-healing check: verify the daily reminder is still scheduled.
 * Android OEMs (Vivo, Xiaomi, Oppo) may silently cancel alarms when
 * the app is swiped from recents or its cache is cleared. This function
 * is called on every app open and foreground to re-create it if missing.
 */
export async function ensureDailyReminderScheduled(
  items: SavedItem[],
  settings: UserSettings
): Promise<void> {
  try {
    if (!settings.notifications_enabled) return;
    const unwatchedCount = items.filter((item) => !item.is_done).length;
    if (unwatchedCount === 0) return;

    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const hasDailyReminder = scheduled.some((n) => n.identifier === REMINDER_ID_KEY);
    if (!hasDailyReminder) {
      console.log('[SaveIt] Daily reminder was missing — re-scheduling');
      await scheduleReminderNotification(items, settings);
    }
  } catch (error) {
    console.warn('[SaveIt] ensureDailyReminderScheduled failed:', error);
    // Self-healing is best-effort; never block the app.
  }
}

export async function scheduleItemReminder(item: SavedItem, reminderAt: Date): Promise<string> {
  await cancelItemReminder(item.id);
  if (reminderAt.getTime() <= Date.now()) {
    throw new Error('Reminder time must be in the future. Pick a later time.');
  }

  await configureNotificationActions();
  await ensureNotificationAccess();

  const expectedIdentifier = itemReminderIdentifier(item.id);
  const itemTrigger: Notifications.NotificationTriggerInput = {
    ...androidChannel(),
    date: reminderAt.getTime()
  };
  const headline = item.save_reason?.trim() || item.clean_title;
  const platformLabel = platformDisplayName(item.platform);
  const ageText = reminderAgeText(item);

  let identifier: string;
  try {
    identifier = await Notifications.scheduleNotificationAsync({
      identifier: expectedIdentifier,
      content: {
        title: `📌 ${headline}`,
        body: `Ready to watch? ${headline} · ${platformLabel} — saved ${ageText}`,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        data: {
          itemId: String(item.id),
          url: String(item.url || ''),
          platform: item.platform
        },
        categoryIdentifier: CATEGORY_ID
      },
      trigger: itemTrigger
    });
  } catch (scheduleError: any) {
    const fullError = {
      message: scheduleError?.message,
      name: scheduleError?.name,
      cause: scheduleError?.cause,
      code: scheduleError?.code,
      stack: scheduleError?.stack,
      stringified: ''
    };
    try {
      fullError.stringified = JSON.stringify(scheduleError);
    } catch (e) {}
    throw new Error(`Failed to schedule the notification. FULL ERROR: ${JSON.stringify(fullError)}`);
  }

  if (identifier !== expectedIdentifier) {
    throw new Error(`Native scheduler returned unexpected item reminder identifier "${identifier}".`);
  }

  await logScheduledTrigger('item-reminder', identifier);
  return identifier;
}

export async function cancelItemReminder(itemId: string): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((notification) => isItemReminderNotification(notification, itemId))
        .map((notification) => Notifications.cancelScheduledNotificationAsync(notification.identifier))
    );
  } catch {
    // Missing or already-fired notifications are safe to ignore.
  }
}

export async function cancelAllItemReminders(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter(
          (notification) =>
            notification.identifier.startsWith(ITEM_REMINDER_ID_PREFIX) ||
            (notification.identifier !== REMINDER_ID_KEY && Boolean(notification.content.data?.itemId))
        )
        .map((notification) => Notifications.cancelScheduledNotificationAsync(notification.identifier))
    );
  } catch {
    // Non-critical cleanup.
  }
}

export async function cancelReminderNotifications(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((notification) => notification.identifier === REMINDER_ID_KEY)
        .map((notification) => Notifications.cancelScheduledNotificationAsync(notification.identifier))
    );
  } catch {
    // Non-critical cleanup.
  }
}

/**
 * Dismiss any displayed notification associated with a specific item.
 * Covers both the daily reminder (if it featured this item) and per-item reminders.
 * Called from markDone to ensure done items leave no stale notification in the tray.
 */
export async function dismissItemNotification(itemId: string): Promise<void> {
  try {
    // Dismiss the per-item reminder notification if displayed
    await Notifications.dismissNotificationAsync(itemReminderIdentifier(itemId)).catch(() => undefined);

    // Also dismiss the daily reminder — it may have featured this specific item.
    // The daily reminder will be re-scheduled on the next commitItems cycle
    // with the correct next candidate (which won't be this done item).
    await Notifications.dismissNotificationAsync(REMINDER_ID_KEY).catch(() => undefined);
  } catch {
    // Dismiss is best-effort; never block markDone.
  }
}

function itemReminderIdentifier(itemId: string): string {
  return `${ITEM_REMINDER_ID_PREFIX}${itemId}`;
}

function androidChannel(): { channelId?: string } {
  return Platform.OS === 'android' ? { channelId: CATEGORY_ID } : {};
}

function dailyReminderTrigger(nextDate: Date, intervalDays: number): Notifications.NotificationTriggerInput {
  const channel = androidChannel();

  if (intervalDays === 1) {
    const trigger: Notifications.DailyTriggerInput = {
      ...channel,
      hour: nextDate.getHours(),
      minute: nextDate.getMinutes(),
      repeats: true
    };
    return trigger;
  }

  if (intervalDays === 7) {
    const trigger: Notifications.WeeklyTriggerInput = {
      ...channel,
      weekday: nextDate.getDay() + 1,
      hour: nextDate.getHours(),
      minute: nextDate.getMinutes(),
      repeats: true
    };
    return trigger;
  }

  const trigger: Notifications.DateTriggerInput = {
    ...channel,
    date: nextDate.getTime()
  };
  return trigger;
}

async function logScheduledTrigger(label: string, identifier: string): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const match = scheduled.find((notification) => notification.identifier === identifier);
    console.log(
      `[SaveIt] ${label} native trigger`,
      JSON.stringify(
        {
          identifier,
          found: Boolean(match),
          trigger: match?.trigger ?? null,
          scheduledCount: scheduled.length
        },
        null,
        2
      )
    );
  } catch (error) {
    console.log(`[SaveIt] ${label} failed to inspect scheduled notifications`, error);
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}

function isItemReminderNotification(
  notification: Notifications.NotificationRequest,
  itemId: string
): boolean {
  return (
    notification.identifier === itemReminderIdentifier(itemId) ||
    (notification.identifier !== REMINDER_ID_KEY && String(notification.content.data?.itemId ?? '') === itemId)
  );
}

/**
 * Single consolidated entry point for handling ALL notification responses.
 *
 * Architecture: ONE handler function, called from ONE place, guarded by
 * ONE shared dedup key that is set ATOMICALLY (before any action runs).
 *
 * Both the foreground listener (addNotificationResponseReceivedListener)
 * and the cold-start check (getLastNotificationResponseAsync) call this
 * same function. The dedup key blocks duplicate processing.
 *
 * PREVIOUS BUG: The dedup key was set AFTER the action ran (line 336 in
 * the old code), so two concurrent calls (from both paths) could both
 * pass the guard before either wrote the key. Additionally, `items` was
 * in the useEffect dependency array in App.tsx, causing the effect to
 * re-mount on every state change from an action, which re-called
 * getLastNotificationResponseAsync() with the same stale response.
 */
export function listenForNotificationResponses(handlers: {
  markDone: (itemId: string) => Promise<void>;
  snooze: (itemId: string) => Promise<void>;
  focusItem: (itemId: string) => void;
}): { remove: () => void } {
  const handleResponse = async (response: Notifications.NotificationResponse) => {
    try {
      const notificationId = response.notification.request.identifier;
      const responseKey = `${notificationId}:${response.notification.date}:${response.actionIdentifier}`;

      // ATOMIC DEDUP: Check AND set the key BEFORE any action logic runs.
      // This is the fix for the race condition where both the listener and
      // the cold-start path could process the same response concurrently.
      if (responseKey === lastProcessedResponseKey) return;
      lastProcessedResponseKey = responseKey;

      // DISMISS IMMEDIATELY: Remove the notification from the tray before
      // running action logic. This ensures dismiss happens even if the action
      // throws or the handler is somehow re-entered.
      Notifications.dismissNotificationAsync(notificationId).catch(() => undefined);

      const itemId = String(response.notification.request.content.data?.itemId ?? '');
      const url = String(response.notification.request.content.data?.url ?? '');
      if (!itemId) return;

      switch (response.actionIdentifier) {
        case 'WATCH_NOW':
          if (url) await Linking.openURL(url).catch(() => undefined);
          break;
        case 'MARK_DONE':
          await handlers.markDone(itemId);
          break;
        case 'SNOOZE_1_DAY':
          await handlers.snooze(itemId);
          break;
        default:
          // Default tap (no specific action button) — open the item
          handlers.focusItem(itemId);
      }
    } catch {
      // Notification responses should never bring the app down.
    }
  };

  // Handle cold-start: if the app was opened by tapping a notification action
  // while fully closed, the response is queued and must be fetched manually
  // since the live listener wasn't registered yet when the tap happened.
  Notifications.getLastNotificationResponseAsync()
    .then((lastResponse) => {
      if (lastResponse) handleResponse(lastResponse);
    })
    .catch(() => undefined);

  return Notifications.addNotificationResponseReceivedListener(handleResponse);
}

/**
 * One-time cleanup: cancel any previously-scheduled quick-reminder
 * notifications left over from earlier builds that had the feature.
 * Called once on first launch of the build that removed quick reminders.
 */
export async function cleanupLegacyQuickReminders(): Promise<void> {
  const LEGACY_CLEANUP_KEY = 'saveit:quick_reminders_cleaned';
  try {
    const alreadyCleaned = await AsyncStorage.getItem(LEGACY_CLEANUP_KEY);
    if (alreadyCleaned) return;

    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const quickOnes = scheduled.filter((n) => n.identifier.startsWith('saveit-quick-reminder-'));
    await Promise.all(
      quickOnes.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
    );

    // Also clean up any leftover tracking keys
    const allKeys = await AsyncStorage.getAllKeys();
    const trackingKeys = allKeys.filter((k) => k.startsWith('quick_reminder:scheduled:'));
    if (trackingKeys.length > 0) {
      await AsyncStorage.multiRemove(trackingKeys);
    }

    await AsyncStorage.setItem(LEGACY_CLEANUP_KEY, 'true');
  } catch {
    // Best-effort cleanup.
  }
}
