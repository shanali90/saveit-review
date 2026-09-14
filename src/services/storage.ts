import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { createId } from '@/services/id';
import { SavedItem, UserSettings } from '@/types';

const ITEMS_KEY = 'demo:saveit:saved_items:v1';
const SETTINGS_KEY = 'demo:saveit:user_settings:v1';
const ONBOARDED_KEY = 'saveit:onboarded:v2';
const LEGACY_ONBOARDED_KEY = 'saveit:onboarded:v1';
const LEGACY_HAS_COMPLETED_ONBOARDED_KEY = 'hasCompletedOnboarding';
const USER_ID_KEY = 'demo:saveit:local_user_id:v1';
const IOS_APP_GROUP = 'group.app.saveit.mobile';
const IOS_QUEUE_KEY = 'saveit.share.queue';
const SHARED_QUEUE_KEY = 'saveit:shared_queue:v1';

type DefaultPreferenceBridge = {
  setName: (name: string) => Promise<void>;
  get: (key: string) => Promise<unknown>;
  clear: (key: string) => Promise<void>;
};

export const defaultSettings: UserSettings = {
  reminder_time: '09:00',
  reminder_frequency: 'daily',
  notification_style: 'summary',
  max_items_warning: 50,
  notifications_enabled: true,
  notification_permission_banner_last_seen: null,
  seen_platforms: []
};

export async function readItems(): Promise<SavedItem[]> {
  const raw = await AsyncStorage.getItem(ITEMS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as SavedItem[];
  } catch {
    return [];
  }
}

export async function writeItems(items: SavedItem[]): Promise<void> {
  await AsyncStorage.setItem(ITEMS_KEY, JSON.stringify(items));
}

export async function readSettings(): Promise<UserSettings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!raw) return defaultSettings;
  try {
    return { ...defaultSettings, ...(JSON.parse(raw) as Partial<UserSettings>) };
  } catch {
    return defaultSettings;
  }
}

export async function writeSettings(settings: UserSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function readOnboarded(): Promise<boolean> {
  const current = await AsyncStorage.getItem(ONBOARDED_KEY);
  if (current !== null) return current === 'true';

  const legacy = await AsyncStorage.getItem(LEGACY_ONBOARDED_KEY);
  if (legacy === 'true') {
    await AsyncStorage.setItem(ONBOARDED_KEY, 'true');
    return true;
  }

  const legacyHasCompleted = await AsyncStorage.getItem(LEGACY_HAS_COMPLETED_ONBOARDED_KEY);
  if (legacyHasCompleted === 'true') {
    await AsyncStorage.setItem(ONBOARDED_KEY, 'true');
    return true;
  }

  return false;
}

export async function writeOnboarded(value: boolean): Promise<void> {
  const stored = value ? 'true' : 'false';
  await AsyncStorage.multiSet([
    [ONBOARDED_KEY, stored],
    [LEGACY_ONBOARDED_KEY, stored],
    [LEGACY_HAS_COMPLETED_ONBOARDED_KEY, stored]
  ]);
}

export async function getDemoUserId(): Promise<string> {
  const existing = await getSecret(USER_ID_KEY);
  if (existing) return existing;
  const created = createId('demo_user');
  await setSecret(USER_ID_KEY, created);
  return created;
}

export async function clearDemoData(): Promise<void> {
  await AsyncStorage.multiRemove([ITEMS_KEY, SETTINGS_KEY]);
  await deleteSecret(USER_ID_KEY);
}

/**
 * Read demo items for migration to an authenticated account.
 * Returns the items without clearing them — call clearDemoItemsAfterMigration()
 * only after a successful upload to Supabase.
 */
export async function readDemoItemsForMigration(): Promise<SavedItem[]> {
  const raw = await AsyncStorage.getItem(ITEMS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as SavedItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Read demo settings for migration to an authenticated account.
 */
export async function readDemoSettingsForMigration(): Promise<UserSettings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!raw) return defaultSettings;
  try {
    return { ...defaultSettings, ...(JSON.parse(raw) as Partial<UserSettings>) };
  } catch {
    return defaultSettings;
  }
}

/**
 * Clear demo data after a successful migration. Safe to call even if
 * migration was partial — only removes items and settings, not onboarding state.
 */
export async function clearDemoItemsAfterMigration(): Promise<void> {
  await AsyncStorage.multiRemove([ITEMS_KEY, SETTINGS_KEY]);
  await deleteSecret(USER_ID_KEY);
}

export async function resetLocalData(): Promise<void> {
  await clearDemoData();
  await AsyncStorage.multiRemove([ONBOARDED_KEY, LEGACY_ONBOARDED_KEY, LEGACY_HAS_COMPLETED_ONBOARDED_KEY]);
  const defaultPreference = getDefaultPreference();
  if (defaultPreference) {
    await defaultPreference.setName(IOS_APP_GROUP);
    await defaultPreference.clear(IOS_QUEUE_KEY);
  }
}

export type SharedSaveQueueItem = {
  url: string;
  created_at: string;
  saveReason?: string;
  saveReasonChip?: string | null;
  isImportant?: boolean;
};

export async function readSharedQueue(): Promise<SharedSaveQueueItem[]> {
  if (Platform.OS === 'android') {
    try {
      const raw = await AsyncStorage.getItem(SHARED_QUEUE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  const defaultPreference = getDefaultPreference();
  if (!defaultPreference) return [];
  try {
    await defaultPreference.setName(IOS_APP_GROUP);
    const raw = await defaultPreference.get(IOS_QUEUE_KEY);
    if (!raw) return [];
    // react-native-default-preference returns JSON string or object depending on version/platform logic
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function clearSharedQueue(): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      await AsyncStorage.removeItem(SHARED_QUEUE_KEY);
    } catch {
      // Silent fail
    }
    return;
  }

  const defaultPreference = getDefaultPreference();
  if (!defaultPreference) return;
  try {
    await defaultPreference.setName(IOS_APP_GROUP);
    await defaultPreference.clear(IOS_QUEUE_KEY);
  } catch {
    // Silent fail
  }
}

function getDefaultPreference(): DefaultPreferenceBridge | null {
  if (Platform.OS !== 'ios') return null;
  try {
    const optionalRequire = eval('require') as (name: string) => unknown;
    const mod = optionalRequire('react-native-default-preference') as {
      default?: DefaultPreferenceBridge;
    } & DefaultPreferenceBridge;
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

async function getSecret(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return AsyncStorage.getItem(key);
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return AsyncStorage.getItem(key);
  }
}

async function setSecret(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(key, value);
    return;
  }
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    await AsyncStorage.setItem(key, value);
  }
}

async function deleteSecret(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(key);
    return;
  }
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    await AsyncStorage.removeItem(key);
  }
}
