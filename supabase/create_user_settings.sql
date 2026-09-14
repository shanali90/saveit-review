-- ═══════════════════════════════════════════════════════════════════
-- SaveIt: Create missing user_settings table
-- Paste this ENTIRE block into the Supabase SQL Editor and click "Run"
-- ═══════════════════════════════════════════════════════════════════

-- 1. Create the table
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reminder_time text not null default '09:00',
  reminder_frequency text not null default 'daily'
    check (reminder_frequency in ('daily', 'every2days', 'weekly')),
  notification_style text not null default 'summary'
    check (notification_style in ('summary', 'individual')),
  max_items_warning jsonb not null default '50'::jsonb,
  notifications_enabled boolean not null default true,
  notification_permission_banner_last_seen timestamptz,
  seen_platforms text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- 2. Auto-update timestamp trigger
drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at
before update on public.user_settings
for each row
execute function public.set_updated_at();

-- 3. Enable Row Level Security
alter table public.user_settings enable row level security;

-- 4. RLS policy: users can only access their own row
drop policy if exists "user_settings_all_own" on public.user_settings;
create policy "user_settings_all_own"
on public.user_settings for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
