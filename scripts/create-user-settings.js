require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const sql = [
  "create table if not exists public.user_settings (",
  "  user_id uuid primary key,",
  "  reminder_time text not null default '09:00',",
  "  reminder_frequency text not null default 'daily',",
  "  notification_style text not null default 'summary',",
  "  max_items_warning jsonb not null default '50'::jsonb,",
  "  notifications_enabled boolean not null default true,",
  "  notification_permission_banner_last_seen timestamptz,",
  "  seen_platforms text[] not null default '{}',",
  "  updated_at timestamptz not null default now()",
  ");",
  "alter table public.user_settings enable row level security;",
  'drop policy if exists "user_settings_all_own" on public.user_settings;',
  'create policy "user_settings_all_own"',
  "on public.user_settings for all",
  "using (auth.uid() = user_id)",
  "with check (auth.uid() = user_id);"
].join("\n");

async function run() {
  const rpcs = ['exec_sql', 'execute_sql', 'run_sql'];
  for (const rpc of rpcs) {
    const { error } = await sb.rpc(rpc, { sql });
    if (!error) {
      console.log('SUCCESS via', rpc);
      // Verify
      const { data, error: checkErr } = await sb.from('user_settings').select('*').limit(1);
      console.log('Verify:', checkErr ? checkErr.message : 'Table accessible, rows:', data?.length ?? 0);
      return;
    }
    console.log('Failed', rpc + ':', error.message);
  }
  console.log('All RPCs failed. The SQL must be pasted into the Supabase SQL Editor manually.');
}

run();
