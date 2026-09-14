create extension if not exists pgcrypto;

create table if not exists public.saved_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  platform text not null check (platform in ('youtube', 'instagram', 'tiktok', 'other')),
  raw_title text not null default '',
  clean_title text not null default '',
  category text not null default 'Other' check (
    category in (
      'Cooking',
      'Fitness',
      'Tech',
      'Finance',
      'Travel',
      'Design',
      'Lifestyle',
      'Education',
      'Entertainment',
      'Shopping',
      'Other'
    )
  ),
  summary text not null default '',
  thumbnail_url text not null default '',
  save_reason text,
  save_reason_chip text,
  creator_handle text,
  urgency_score integer not null default 3 check (urgency_score between 1 and 5),
  is_important boolean not null default false,
  is_done boolean not null default false,
  snooze_count integer not null default 0,
  snoozed_until timestamptz,
  custom_reminder_at timestamptz,
  saved_at timestamptz not null default now(),
  done_at timestamptz,
  last_reminded_at timestamptz,
  is_enriched boolean not null default false,
  sync_status text not null default 'synced',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reminder_time text not null default '09:00',
  reminder_frequency text not null default 'daily' check (reminder_frequency in ('daily', 'every2days', 'weekly')),
  notification_style text not null default 'summary' check (notification_style in ('summary', 'individual')),
  max_items_warning jsonb not null default '50'::jsonb,
  notifications_enabled boolean not null default true,
  notification_permission_banner_last_seen timestamptz,
  seen_platforms text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.category_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  host text not null,
  category text not null check (
    category in (
      'Cooking',
      'Fitness',
      'Tech',
      'Finance',
      'Travel',
      'Design',
      'Lifestyle',
      'Education',
      'Entertainment',
      'Shopping',
      'Other'
    )
  ),
  updated_at timestamptz not null default now(),
  primary key (user_id, host)
);

create index if not exists saved_items_user_saved_at_idx on public.saved_items (user_id, saved_at desc);
create index if not exists saved_items_user_done_idx on public.saved_items (user_id, is_done, saved_at desc);
create index if not exists saved_items_reminder_idx on public.saved_items (user_id, is_done, urgency_score desc, saved_at asc);
create index if not exists saved_items_url_idx on public.saved_items (user_id, url);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists saved_items_set_updated_at on public.saved_items;
create trigger saved_items_set_updated_at
before update on public.saved_items
for each row
execute function public.set_updated_at();

drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at
before update on public.user_settings
for each row
execute function public.set_updated_at();

alter table public.saved_items enable row level security;
alter table public.user_settings enable row level security;
alter table public.category_preferences enable row level security;

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

drop policy if exists "user_settings_all_own" on public.user_settings;
create policy "user_settings_all_own"
on public.user_settings for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "category_preferences_all_own" on public.category_preferences;
create policy "category_preferences_all_own"
on public.category_preferences for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
