import { SavedItem } from '@/types';

export function daysBetween(fromIso: string, to = new Date()): number {
  const from = new Date(fromIso).getTime();
  const diff = to.getTime() - from;
  return Math.max(0, Math.floor(diff / 86_400_000));
}

export function formatRelativeTime(iso: string): string {
  const days = daysBetween(iso);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return '1 week ago';
  if (weeks < 5) return `${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  return months <= 1 ? '1 month ago' : `${months} months ago`;
}

export function reminderAgeText(item: SavedItem): string {
  const days = daysBetween(item.saved_at);
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

export function parseReminderTime(time: string): { hour: number; minute: number } {
  const [hourRaw, minuteRaw] = time.split(':');
  const hour = clamp(Number(hourRaw), 0, 23);
  const minute = clamp(Number(minuteRaw), 0, 59);
  return { hour, minute };
}

export function nextReminderDate(time: string, everyDays: number): Date {
  const { hour, minute } = parseReminderTime(time);
  const next = new Date();
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= Date.now()) {
    next.setDate(next.getDate() + everyDays);
  }
  return next;
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}
