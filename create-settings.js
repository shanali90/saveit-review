require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const sql = `
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

-- ensure save reason columns exist
alter table public.saved_items add column if not exists save_reason text;
alter table public.saved_items add column if not exists save_reason_chip text;
`;

async function run() {
  const rpcs = ['exec_sql', 'execute_sql', 'run_sql'];
  let success = false;
  for (const rpc of rpcs) {
    const { error } = await supabase.rpc(rpc, { sql });
    if (!error) {
      console.log('Successfully ran SQL via', rpc);
      success = true;
      break;
    } else {
      console.log('Failed', rpc, error.message);
    }
  }
  
  if (!success) {
    console.log('Could not run SQL via RPC. DDL not applied.');
  } else {
    // Reload schema cache maybe?
    console.log('Done creating table.');
  }
}

run();
