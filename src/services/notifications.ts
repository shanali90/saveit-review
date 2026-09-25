import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { getReminderCandidate, reminderIntervalDays } from '@/services/reminders';
import { nextReminderDate, reminderAgeText } from '@/services/time';
import { platformDisplayName } from '@/services/url';
import { SavedItem, UserSettings } from '@/types';

const REMINDER_ID_KEY = 'saveit-daily-reminder';
const ITEM_REMINDER_ID_PREFIX = 'saveit-item-reminder-';
const CATEGORY_ID = 'saved-item-reminders-v2';

// ── Quick Reminder (one-time ~15-minute nudge after save) ──────────
const QUICK_REMINDER_ID_PREFIX = 'saveit-quick-reminder-';
const QUICK_REMINDER_CHANNEL_ID = 'quick-save-reminders';
const QUICK_REMINDER_CATEGORY_ID = 'quick-reminder-actions';
const QUICK_REMINDER_TRACKING_PREFIX = 'quick_reminder:scheduled:';
const QUICK_REMINDER_DELAY_SECONDS = 20 * 60; // 20 minutes

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

      // Quick-reminder channel: DEFAULT importance = no heads-up interrupt.
      // Shows in the status bar and notification drawer only, even while
      // another app (e.g. YouTube, Instagram) is actively in the foreground.
      await Notifications.setNotificationChannelAsync(QUICK_REMINDER_CHANNEL_ID, {
        name: 'Quick save reminders',
        description: 'Gentle reminder ~20 min after you save something',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: 'default',
        enableVibrate: true,
        showBadge: false,
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

    // Quick-reminder category: Watch now + Later (dismiss, no re-nag).
    await Notifications.setNotificationCategoryAsync(QUICK_REMINDER_CATEGORY_ID, [
      {
        identifier: 'WATCH_NOW',
        buttonTitle: 'Watch now',
        options: { opensAppToForeground: true }
      },
      {
        identifier: 'QUICK_LATER',
        buttonTitle: 'Later',
        options: { opensAppToForeground: false }
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

export async function scheduleReminderNotification(items: SavedItem[], settings: UserSettings): Promise<string | null> {
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

  return identifier;
}

export async function scheduleItemReminder(item: SavedItem, reminderAt: Date): Promise<string> {
  await cancelItemReminder(item.id);
  if (reminderAt.getTime() <= Date.now()) {
    throw new Error('Reminder time must be in the future. Pick a later time.');
  }

  await configureNotificationActions();
  await ensureNotificationAccess();

  const expectedIdentifier = itemReminderIdentifier(item.id);
  const itemTrigger = { date: reminderAt };
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

function dailyReminderTrigger(nextDate: Date, intervalDays: number): Notifications.NotificationTriggerInput {
  if (intervalDays === 1) {
    return {
      hour: nextDate.getHours(),
      minute: nextDate.getMinutes(),
      repeats: true
    } as any;
  }
  
  if (intervalDays === 7) {
    return {
      weekday: nextDate.getDay() + 1,
      hour: nextDate.getHours(),
      minute: nextDate.getMinutes(),
      repeats: true
    } as any;
  }

  return {
    date: nextDate
  } as any;
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
          // Clean up quick-reminder tracking if this was a quick reminder
          cleanupQuickReminderTracking(itemId).catch(() => undefined);
          break;
        case 'MARK_DONE':
          await handlers.markDone(itemId);
          break;
        case 'SNOOZE_1_DAY':
          await handlers.snooze(itemId);
          break;
        case 'QUICK_LATER':
          // "Later" on quick reminder — just dismiss (already handled above).
          // Does NOT affect the item's daily-reminder eligibility.
          cleanupQuickReminderTracking(itemId).catch(() => undefined);
          break;
        default:
          // Default tap (no specific action button) — open the item
          handlers.focusItem(itemId);
          cleanupQuickReminderTracking(itemId).catch(() => undefined);
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

// ── Quick Reminder: schedule / cancel / cleanup ─────────────────────

/**
 * Schedule a one-time quick-reminder notification for a newly saved item.
 * Fires ~15 minutes after save as a standard-priority notification
 * (status bar + drawer only, never heads-up / full-screen).
 *
 * Idempotent: if already scheduled for this item, the old one is replaced.
 * Uses a DISTINCT tracking key (quick_reminder:scheduled:<id>) that does
 * NOT interfere with the daily-reminder dedup key or the "still unwatched"
 * banner's once-per-day key.
 */
export async function scheduleQuickReminder(item: SavedItem): Promise<void> {
  try {
    // Don't schedule if already tracked (prevents re-scheduling on re-hydration)
    const trackingKey = `${QUICK_REMINDER_TRACKING_PREFIX}${item.id}`;
    const alreadyScheduled = await AsyncStorage.getItem(trackingKey);
    if (alreadyScheduled) return;

    await configureNotificationActions();

    // Best-effort permission check — skip silently if denied.
    // Quick reminders are a nice-to-have; never block the save flow.
    try {
      const { granted } = await Notifications.getPermissionsAsync();
      if (!granted) return;
    } catch {
      return;
    }

    const identifier = `${QUICK_REMINDER_ID_PREFIX}${item.id}`;
    const headline = item.save_reason?.trim() || item.clean_title || item.raw_title;
    const platformLabel = platformDisplayName(item.platform);

    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: `📌 Don't forget: ${headline}`,
        body: `You saved this ${platformLabel} link ~20 min ago. Tap to watch now!`,
        sound: true,
        // DEFAULT priority = standard notification, NOT heads-up.
        // This ensures it appears in the status bar / notification drawer
        // without interrupting whatever app is in the foreground.
        priority: Notifications.AndroidNotificationPriority.DEFAULT,
        data: {
          itemId: String(item.id),
          url: String(item.url || ''),
          platform: item.platform,
          isQuickReminder: true
        },
        categoryIdentifier: QUICK_REMINDER_CATEGORY_ID,
        ...(Platform.OS === 'android' ? { channelId: QUICK_REMINDER_CHANNEL_ID } : {})
      },
      trigger: {
        seconds: QUICK_REMINDER_DELAY_SECONDS,
        channelId: QUICK_REMINDER_CHANNEL_ID
      } as any
    });

    // Mark as scheduled so we never re-schedule for this item
    await AsyncStorage.setItem(trackingKey, new Date().toISOString());
  } catch {
    // Quick reminders are best-effort — never block the save flow.
  }
}

/**
 * Cancel a pending quick-reminder notification for a specific item.
 * Called when the item is marked done, deleted, or removed before the
 * 15-minute mark. Also cleans up the tracking key.
 */
export async function cancelQuickReminder(itemId: string): Promise<void> {
  try {
    const identifier = `${QUICK_REMINDER_ID_PREFIX}${itemId}`;
    await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => undefined);
    // Also dismiss from tray if it already fired
    await Notifications.dismissNotificationAsync(identifier).catch(() => undefined);
    await cleanupQuickReminderTracking(itemId);
  } catch {
    // Non-critical cleanup.
  }
}

/**
 * Remove the AsyncStorage tracking key for a quick reminder.
 * Called after the notification fires and is interacted with, or when cancelled.
 */
async function cleanupQuickReminderTracking(itemId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${QUICK_REMINDER_TRACKING_PREFIX}${itemId}`);
  } catch {
    // Best-effort cleanup.
  }
}
