export type Platform = 'youtube' | 'instagram' | 'tiktok' | 'other';

export type Category =
  | 'Cooking'
  | 'Fitness'
  | 'Tech'
  | 'Finance'
  | 'Travel'
  | 'Design'
  | 'Lifestyle'
  | 'Education'
  | 'Entertainment'
  | 'Shopping'
  | 'Other';

export type ReminderFrequency = 'daily' | 'every2days' | 'weekly';
export type NotificationStyle = 'summary' | 'individual';
export type MaxItemsWarning = 10 | 20 | 50 | 'unlimited';

export type SavedItem = {
  id: string;
  user_id: string;
  url: string;
  platform: Platform;
  raw_title: string;
  clean_title: string;
  category: Category;
  summary: string;
  thumbnail_url: string;
  save_reason: string | null;
  save_reason_chip: string | null;
  creator_handle: string | null;
  urgency_score: number;
  is_important: boolean;
  is_done: boolean;
  snooze_count: number;
  snoozed_until: string | null;
  custom_reminder_at: string | null;
  saved_at: string;
  done_at: string | null;
  last_reminded_at: string | null;
  is_enriched: boolean;
  sync_status: 'synced' | 'queued' | 'syncing' | 'error';
};

export type UserSettings = {
  reminder_time: string;
  reminder_frequency: ReminderFrequency;
  notification_style: NotificationStyle;
  max_items_warning: MaxItemsWarning;
  notifications_enabled: boolean;
  notification_permission_banner_last_seen: string | null;
  seen_platforms: Platform[];
};

export type MetadataPreview = {
  url: string;
  normalizedUrl: string;
  platform: Platform;
  rawTitle: string;
  rawDescription: string;
  thumbnailUrl: string;
  creatorHandle: string | null;
};

export type EnrichmentResult = {
  cleanTitle: string;
  category: Category;
  summary: string;
  urgencyScore: number;
  creatorHandle: string | null;
};

export type SaveDraft = {
  url: string;
  saveReason?: string;
  saveReasonChip?: string | null;
  isImportant?: boolean;
  preview?: MetadataPreview;
};

export type DuplicateDecision = 'cancel' | 'save_again';

export type SaveResult =
  | { status: 'saved'; item: SavedItem }
  | { status: 'duplicate'; item: SavedItem }
  | { status: 'error'; message: string };

export type AppError = {
  id: string;
  message: string;
};
