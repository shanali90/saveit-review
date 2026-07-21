import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';

import { isSupabaseConfigured, supabase } from '@/services/supabase';

const PROMPT_STATS_KEY = 'saveit:update_prompt_stats';

export type AppRelease = {
  latest_version_code: number;
  latest_version_name: string;
  download_url: string;
  release_notes: string | null;
};

/**
 * Check if an update is available by comparing the installed versionCode
 * with the latest_version_code in the app_releases table.
 *
 * Returns the release info if an update is available and hasn't been dismissed,
 * or null if no update is needed / check fails / Supabase isn't configured.
 */
export async function checkForUpdate(): Promise<AppRelease | null> {
  try {
    if (!isSupabaseConfigured || !supabase) return null;

    const installedVersionCode = getInstalledVersionCode();
    if (installedVersionCode === null) return null;

    const { data, error } = await supabase
      .from('app_releases')
      .select('latest_version_code, latest_version_name, download_url, release_notes')
      .eq('platform', 'android')
      .maybeSingle();

    if (error || !data) return null;

    const release = data as AppRelease;
    if (release.latest_version_code <= installedVersionCode) return null;

    // Check if user has already seen this prompt 2 times today
    const statsRaw = await AsyncStorage.getItem(PROMPT_STATS_KEY);
    if (statsRaw !== null) {
      try {
        const stats = JSON.parse(statsRaw);
        const today = new Date().toISOString().split('T')[0];
        if (stats.date === today && stats.versionCode === release.latest_version_code && stats.count >= 2) {
          return null;
        }
      } catch {
        // Ignore parse errors
      }
    }

    return release;
  } catch {
    // Fail silently — never block app usage
    return null;
  }
}

/**
 * Record that the update prompt was shown to the user.
 * Limits the popup to a max of 2 times per day per version.
 */
export async function recordUpdatePromptShown(versionCode: number): Promise<void> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const statsRaw = await AsyncStorage.getItem(PROMPT_STATS_KEY);
    let count = 1;
    if (statsRaw !== null) {
      try {
        const stats = JSON.parse(statsRaw);
        if (stats.date === today && stats.versionCode === versionCode) {
          count = stats.count + 1;
        }
      } catch {
        // Ignore
      }
    }
    await AsyncStorage.setItem(PROMPT_STATS_KEY, JSON.stringify({ date: today, count, versionCode }));
  } catch {
    // Non-critical preference
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
