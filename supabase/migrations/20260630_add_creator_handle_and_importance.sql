alter table public.saved_items
  add column if not exists creator_handle text;

alter table public.saved_items
  add column if not exists is_important boolean not null default false;
