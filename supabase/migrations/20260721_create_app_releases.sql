-- App update version tracking table
-- Public read, admin-only write (via Supabase dashboard or service role key)

create table if not exists public.app_releases (
  platform text primary key,
  latest_version_code integer not null,
  latest_version_name text not null,
  download_url text not null,
  release_notes text,
  updated_at timestamptz not null default now()
);

alter table public.app_releases enable row level security;

drop policy if exists "app_releases_public_read" on public.app_releases;
create policy "app_releases_public_read"
on public.app_releases for select
using (true);

-- Starter row: current build is versionCode 3 / versionName 1.0.0
-- (most recent EAS preview build: 64a9fe3d, July 16 2026)
insert into public.app_releases (platform, latest_version_code, latest_version_name, download_url, release_notes)
values (
  'android',
  3,
  '1.0.0',
  'https://REPLACE-ME.example.com/download',
  'Bug fixes and performance improvements.'
)
on conflict (platform) do nothing;
