import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { SavedItem, UserSettings } from '@/types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('your-project') &&
    !supabaseAnonKey.includes('your-public')
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce'
      }
    })
  : null;

const schemaCapabilities = {
  saveReason: true
};

const savedItemsMigrationSql = `
create table if not exists public.saved_items (
  id uuid default gen_random_uuid() primary key,
  user_id uuid,
  url text not null,
  platform text,
  raw_title text,
  clean_title text,
  category text,
  summary text,
  thumbnail_url text,
  save_reason text,
  save_reason_chip text,
  urgency_score integer default 3,
  is_done boolean default false,
  is_important boolean default false,
  snooze_count integer default 0,
  creator_handle text,
  saved_at timestamp with time zone default now(),
  done_at timestamp with time zone,
  last_reminded_at timestamp with time zone
);
alter table public.saved_items
  add column if not exists custom_reminder_at timestamp with time zone;
alter table public.saved_items
  add column if not exists snoozed_until timestamp with time zone;
alter table public.saved_items
  add column if not exists is_enriched boolean default false;
alter table public.saved_items
  add column if not exists sync_status text default 'synced';
alter table public.saved_items
  add column if not exists save_reason text;
alter table public.saved_items
  add column if not exists save_reason_chip text;
alter table public.saved_items
  alter column user_id set not null;
alter table public.saved_items enable row level security;
drop policy if exists "saved_items_select_own" on public.saved_items;
create policy "saved_items_select_own"
on public.saved_items for select
using (auth.uid() = user_id);
drop policy if exists "saved_items_insert_own" on public.saved_items;
create policy "saved_items_insert_own"
on public.saved_items for insert
with check (auth.uid() = user_id);
drop policy if exists "saved_items_update_own" on public.saved_items;
create policy "saved_items_update_own"
on public.saved_items for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
drop policy if exists "saved_items_delete_own" on public.saved_items;
create policy "saved_items_delete_own"
on public.saved_items for delete
using (auth.uid() = user_id);
create table if not exists public.user_settings (
  user_id uuid primary key,
  reminder_time text default '20:00',
  reminder_frequency text default 'daily',
  notification_style text default 'summary',
  max_items_warning text default '50',
  notifications_enabled boolean default false,
  notification_permission_banner_last_seen text,
  seen_platforms text[] default '{}',
  updated_at timestamp with time zone default now()
);
alter table public.user_settings enable row level security;
drop policy if exists "user_settings_all_own" on public.user_settings;
create policy "user_settings_all_own"
on public.user_settings for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
`;

const rawSqlRpcCandidates = ['exec_sql', 'execute_sql', 'run_sql'];

export async function runMigrations(): Promise<void> {
  if (!supabase) return;

  for (const functionName of rawSqlRpcCandidates) {
    const { error } = await supabase.rpc(functionName, { sql: savedItemsMigrationSql });
    if (!error) return;
  }

  const { error } = await supabase.from('saved_items').select('id, creator_handle, is_important, save_reason').limit(1);
  if (error) {
    if (isMissingMigrationColumnError(error)) {
      schemaCapabilities.saveReason = false;
    } else {
      throw error;
    }
  }
}

export async function getAuthenticatedUserId(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    // PRIORITY 2 FIX: If getSession() fails (e.g. token refresh while offline),
    // attempt to read the cached session directly from AsyncStorage.
    // This ensures offline reads can still find the user_id for cached data.
    try {
      const storageKey = `sb-${supabaseUrl?.replace(/^https?:\/\//, '').split('.')[0]}-auth-token`;
      const raw = await AsyncStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed?.user?.id ?? parsed?.currentSession?.user?.id ?? null;
      }
    } catch {
      // Fallback also failed
    }
    return null;
  }
}

/**
 * Read the persisted Supabase auth user ID directly from AsyncStorage.
 *
 * OFFLINE-SAFE: This never makes a network call — it reads the locally
 * stored auth session that Supabase JS persists via `persistSession: true`.
 * The user ID is stable across token refreshes (it's the user's UUID, not
 * the access token), so it's safe to use even if the access token is expired.
 *
 * Used by App.tsx's auth initialization to avoid falling back to Demo Mode
 * when the device is offline and `getSession()` hangs trying to refresh an
 * expired token.
 */
export async function getPersistedUserId(): Promise<string | null> {
  if (!isSupabaseConfigured || !supabaseUrl) return null;
  try {
    const storageKey = `sb-${supabaseUrl.replace(/^https?:\/\//, '').split('.')[0]}-auth-token`;
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Supabase JS v2 stores the session object directly; v1 stored it under currentSession.
    return parsed?.user?.id ?? parsed?.currentSession?.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function upsertItemsToSupabase(items: SavedItem[]): Promise<void> {
  if (!supabase) return;
  const userId = await getAuthenticatedUserId();
  if (!userId) return;

  const rows = items.map((item) => {
    const row = {
      ...item,
      user_id: userId,
      sync_status: 'synced'
    };
    if (!schemaCapabilities.saveReason) {
      delete (row as any).save_reason;
      delete (row as any).save_reason_chip;
    }
    return row;
  });

  const { error } = await supabase.from('saved_items').upsert(rows, { onConflict: 'id' });
  if (error) throw error;
}

export async function deleteItemFromSupabase(itemId: string): Promise<void> {
  if (!supabase) return;
  const userId = await getAuthenticatedUserId();
  if (!userId) return;

  const { error } = await supabase.from('saved_items').delete().eq('user_id', userId).eq('id', itemId);
  if (error) throw error;
}

export async function deleteDoneItemsFromSupabase(): Promise<void> {
  if (!supabase) return;
  const userId = await getAuthenticatedUserId();
  if (!userId) return;

  const { error } = await supabase.from('saved_items').delete().eq('user_id', userId).eq('is_done', true);
  if (error) throw error;
}

export async function deleteAllUserDataFromSupabase(): Promise<void> {
  if (!supabase) return;
  const userId = await getAuthenticatedUserId();
  if (!userId) return;

  const itemDelete = await supabase.from('saved_items').delete().eq('user_id', userId);
  if (itemDelete.error) throw itemDelete.error;

  const settingsDelete = await supabase.from('user_settings').delete().eq('user_id', userId);
  if (settingsDelete.error) throw settingsDelete.error;
}

export const syncItemsToSupabase = upsertItemsToSupabase;

export async function loadItemsFromSupabase(): Promise<SavedItem[]> {
  if (!supabase) return [];
  const userId = await getAuthenticatedUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from('saved_items')
    .select('*')
    .eq('user_id', userId)
    .order('saved_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as SavedItem[];
}

export async function saveSettingsToSupabase(settings: UserSettings): Promise<void> {
  if (!supabase) return;
  const userId = await getAuthenticatedUserId();
  if (!userId) return;

  const { error } = await supabase.from('user_settings').upsert({
    user_id: userId,
    ...settings,
    updated_at: new Date().toISOString()
  });

  if (error) throw error;
}

export async function loadSettingsFromSupabase(): Promise<Partial<UserSettings> | null> {
  if (!supabase) return null;
  const userId = await getAuthenticatedUserId();
  if (!userId) return null;

  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (error.code === 'PGRST205') {
      return null;
    }
    throw error;
  }
  return data as Partial<UserSettings> | null;
}

export async function hardDeleteAccountData(): Promise<void> {
  if (!supabase) return;
  await deleteAllUserDataFromSupabase();
  await supabase.auth.signOut();
}

function isMissingMigrationColumnError(error: unknown): boolean {
  const message = String((error as { message?: unknown })?.message ?? error).toLowerCase();
  return (
    message.includes('creator_handle') ||
    message.includes('is_important') ||
    (message.includes('column') && message.includes('does not exist')) ||
    (message.includes('schema cache') && message.includes('saved_items'))
  );
}
