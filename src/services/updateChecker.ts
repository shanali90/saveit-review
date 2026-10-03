import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';

import { isSupabaseConfigured, supabase } from '@/services/supabase';

export type AppRelease = {
  latest_version_code: number;
  latest_version_name: string;
  download_url: string;
  release_notes: string | null;
  update_type?: 'ota' | 'native';
};

/**
 * Check if an update is available by comparing the installed versionCode
 * with the latest_version_code in the app_releases table.
 */
export async function checkForUpdate(): Promise<AppRelease | null> {
  try {
    if (!isSupabaseConfigured || !supabase) return null;

    const installedVersionCode = getInstalledVersionCode();
    if (installedVersionCode === null) return null;

    const { data, error } = await supabase
      .from('app_releases')
      .select('latest_version_code, latest_version_name, download_url, release_notes, update_type')
      .eq('platform', 'android')
      .maybeSingle();

    if (error || !data) return null;

    const release = data as AppRelease;
    const latestVersion = Number(release.latest_version_code);

    // RULE 1: ABSOLUTE GATE. Runs first, before any other logic.
    // If installed is >= latest, or if latest is somehow not a number, never show.
    if (isNaN(latestVersion) || latestVersion <= installedVersionCode) {
      return null;
    }

    // RULE 3: Explicitly dismissed
    const dismissedRaw = await AsyncStorage.getItem('update:dismissed_version_code');
    if (dismissedRaw && Number(dismissedRaw) === latestVersion) {
      return null;
    }

    // RULE 2 & 4: Up to 2 times a day
    const shownDate = await AsyncStorage.getItem('update:shown_date');
    const shownCountRaw = await AsyncStorage.getItem('update:shown_count_today');
    const today = new Date().toISOString().split('T')[0];

    if (shownDate === today && shownCountRaw) {
      const count = parseInt(shownCountRaw, 10);
      if (!isNaN(count) && count >= 2) {
        return null;
      }
    }

    const rawType = String(release.update_type ?? '').trim().toLowerCase();
    const update_type: 'ota' | 'native' = rawType === 'ota' ? 'ota' : 'native';

    return {
      ...release,
      update_type,
    };
  } catch {
    // Fail silently — never block app usage
    return null;
  }
}

/**
 * Fetch the release info for the currently installed Android native version,
 * to display "What's new" release notes after an OTA update.
 */
export async function fetchCurrentRelease(): Promise<AppRelease | null> {
  try {
    if (!isSupabaseConfigured || !supabase) return null;

    const { data, error } = await supabase
      .from('app_releases')
      .select('latest_version_code, latest_version_name, download_url, release_notes, update_type')
      .eq('platform', 'android')
      .order('latest_version_code', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return data as AppRelease;
  } catch {
    return null;
  }
}

/**
 * Record that the update prompt was shown to the user.
 * Increments the daily count for the current date.
 */
export async function recordUpdatePromptShown(): Promise<void> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const shownDate = await AsyncStorage.getItem('update:shown_date');
    const shownCountRaw = await AsyncStorage.getItem('update:shown_count_today');
    
    let count = 0;
    if (shownDate === today && shownCountRaw) {
      count = parseInt(shownCountRaw, 10);
      if (isNaN(count)) count = 0;
    }
    
    await AsyncStorage.setItem('update:shown_date', today);
    await AsyncStorage.setItem('update:shown_count_today', String(count + 1));
  } catch {
    // Ignore
  }
}

/**
 * Permanently dismiss the update prompt for a specific version.
 */
export async function dismissUpdatePrompt(versionCode: number | string): Promise<void> {
  try {
    await AsyncStorage.setItem('update:dismissed_version_code', String(versionCode));
  } catch {
    // Ignore
  }
}

/**
 * Read the installed Android versionCode as a number.
 * Returns null if unavailable (e.g. running in Expo Go / web).
 */
function getInstalledVersionCode(): number | null {
  const raw = Application.nativeBuildVersion;
  if (!raw) return null;
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Read the installed versionName shown to users (e.g. "1.0.0").
 */
export function getInstalledVersionName(): string {
  return Application.nativeApplicationVersion ?? '1.0.0';
}
