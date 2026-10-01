-- No conversation text is stored in this table. Rate limits count requests only.
create table public.ai_request_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  day date not null, daily_count integer not null,
  minute timestamptz not null, minute_count integer not null
);
alter table public.ai_request_limits enable row level security;
revoke all on public.ai_request_limits from public, anon, authenticated;

create function public.consume_ai_request() returns boolean
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  d date := (now() at time zone 'UTC')::date;
  m timestamptz := date_trunc('minute', now());
  allowed boolean;
begin
  if uid is null or not exists (select 1 from profiles where user_id=uid) then return false; end if;
  insert into ai_request_limits as q (user_id,day,daily_count,minute,minute_count)
  values(uid,d,1,m,1)
  on conflict (user_id) do update set
    day=d, daily_count=case when q.day=d then q.daily_count+1 else 1 end,
    minute=m, minute_count=case when q.minute=m then q.minute_count+1 else 1 end
  where (q.day<>d or q.daily_count<30) and (q.minute<>m or q.minute_count<5)
  returning true into allowed;
  return coalesce(allowed,false);
end $$;
revoke execute on function public.consume_ai_request() from public, anon;
grant execute on function public.consume_ai_request() to authenticated;

alter table public.day_plans add column resting boolean not null default false;
create function public.choose_rest() returns void
language sql security definer set search_path=public as $$
  insert into day_plans(user_id,local_date,mode,resting)
  values(auth.uid(),local_today(auth.uid(),now()),'minimum',true)
  on conflict(user_id,local_date) do update set resting=true
$$;
revoke execute on function public.choose_rest() from public, anon;
grant execute on function public.choose_rest() to authenticated;
