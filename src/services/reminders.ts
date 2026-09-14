import { SavedItem, UserSettings } from '@/types';
import { daysBetween } from '@/services/time';

export function getUnwatchedItems(items: SavedItem[]): SavedItem[] {
  return items.filter((item) => !item.is_done);
}

export function isItemSnoozed(item: SavedItem, now = new Date()): boolean {
  return Boolean(item.snoozed_until && new Date(item.snoozed_until).getTime() > now.getTime());
}

export function rankReminderQueue(items: SavedItem[], now = new Date()): SavedItem[] {
  return getUnwatchedItems(items)
    .filter((item) => !isItemSnoozed(item, now))
    .sort((a, b) => reminderWeight(b, now) - reminderWeight(a, now));
}

export function getReminderCandidate(items: SavedItem[], now = new Date()): SavedItem | null {
  return rankReminderQueue(items, now)[0] ?? null;
}

export function getOldestOverdueItem(items: SavedItem[], minDaysOld = 2): SavedItem | null {
  return getUnwatchedItems(items)
    .filter((item) => daysBetween(item.saved_at) > minDaysOld)
    .sort((a, b) => new Date(a.saved_at).getTime() - new Date(b.saved_at).getTime())[0] ?? null;
}

export function shouldShowCapacityWarning(items: SavedItem[], settings: UserSettings): boolean {
  if (settings.max_items_warning === 'unlimited') return false;
  return getUnwatchedItems(items).length > settings.max_items_warning;
}

export function reminderIntervalDays(settings: UserSettings): number {
  if (settings.reminder_frequency === 'weekly') return 7;
  if (settings.reminder_frequency === 'every2days') return 2;
  return 1;
}

function reminderWeight(item: SavedItem, now: Date): number {
  const age = Math.max(1, daysBetween(item.saved_at, now));
  const priority = item.urgency_score + (item.is_important ? 2 : 0);
  return priority * age;
}
