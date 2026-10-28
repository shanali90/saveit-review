create table if not exists public.ai_usage_daily (
  usage_date date not null default (timezone('utc', now())::date),
  caller text not null,
  usage_count integer not null default 0,
  primary key (usage_date, caller)
);

alter table public.ai_usage_daily enable row level security;
revoke all on public.ai_usage_daily from anon, authenticated;

create or replace function public.bump_ai_usage(caller text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
  usage_limit integer;
begin
  usage_limit := case when caller = 'anon' then 300 else 100 end;
  insert into public.ai_usage_daily (usage_date, caller, usage_count)
  values (timezone('utc', now())::date, caller, 1)
  on conflict (usage_date, caller)
  do update set usage_count = public.ai_usage_daily.usage_count + 1
  returning usage_count into current_count;
  return current_count <= usage_limit;
end;
$$;

revoke execute on function public.bump_ai_usage(text) from public, anon, authenticated;
grant execute on function public.bump_ai_usage(text) to service_role;
