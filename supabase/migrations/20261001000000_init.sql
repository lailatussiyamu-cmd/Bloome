-- Bloome v0.1 — core schema
-- Rules this file enforces (see "Bloome v0.1 — Logika & Aturan Produk"):
--   * Bloom grows from care days, never from weight.
--   * Stage and care-day count can only go up (trigger guard).
--   * care_days_total is never readable by the app: clients read the `my_bloom` view only.
--   * Care Moments are written only through record_care_moment(), which handles dedupe and growth atomically.

-- ---------- Types ----------
create type public.bloom_stage as enum ('seed', 'sprout', 'leaves', 'bud', 'bloom', 'flourish');
create type public.day_mode    as enum ('standard', 'minimum', 'recovery', 'lifeHappens');
create type public.pillar      as enum ('nourish', 'hydrate', 'move', 'recover', 'mind');
create type public.care_source as enum ('manual', 'health', 'gps', 'ai');

-- ---------- Tables ----------
create table public.profiles (
  user_id                    uuid primary key references auth.users (id) on delete cascade,
  nickname                   text not null check (char_length(nickname) between 1 and 40),
  birth_date                 date not null,
  time_zone                  text not null default 'Asia/Jakarta',
  goal                       text not null check (goal in ('energy', 'eating', 'weight', 'routine')),
  pregnant_or_breastfeeding  boolean,             -- null = prefer not to say
  activity                   text not null check (activity in ('none', 'light', 'intense', 'other')),
  frequency                  text not null check (frequency in ('rarely', 'sometimes', 'often')),
  wake_time                  time not null default '06:00',
  shift_work                 boolean not null default false,
  created_at                 timestamptz not null default now()
);

create table public.bloom_state (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  stage              public.bloom_stage not null default 'seed',
  care_days_total    integer not null default 0 check (care_days_total >= 0),
  last_care_day      date,
  stage_reached_at   jsonb not null default '{}'::jsonb,
  pending_milestone  public.bloom_stage,
  variant            text not null default 'signature' check (variant in ('signature', 'earth', 'rose', 'champagne')),
  updated_at         timestamptz not null default now()
);

create table public.care_moments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  local_date  date not null,
  pillar      public.pillar not null,
  source      public.care_source not null default 'manual',
  created_at  timestamptz not null default now()
);
create index care_moments_user_time on public.care_moments (user_id, created_at desc);

create table public.day_plans (
  user_id     uuid not null references auth.users (id) on delete cascade,
  local_date  date not null,
  mode        public.day_mode not null default 'standard',
  items       jsonb not null default '[]'::jsonb,
  primary key (user_id, local_date)
);

create table public.check_ins (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  portion       text check (portion in ('small', 'medium', 'large', 'very_small')),
  mood          text check (mood in ('tired', 'stressed', 'okay', 'calm', 'happy')),
  eating_reason text check (eating_reason in ('hungry', 'tired', 'stressed', 'bored', 'event')),
  water_glasses smallint check (water_glasses between 0 and 20),
  hard_day      boolean not null default false,
  note          text check (char_length(note) <= 1000)
);

create table public.weight_entries (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users (id) on delete cascade,
  date      date not null,
  kg        numeric(5, 1) not null check (kg between 25 and 350),
  unique (user_id, date)
);

create table public.cycle_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  start_date  date not null,
  end_date    date,
  check (end_date is null or end_date >= start_date)
);

create table public.reminders (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users (id) on delete cascade,
  kind      text not null check (kind in ('hydrate', 'move', 'nourish', 'recover', 'mind', 'location')),
  at_time   time,
  -- Geofence coordinates stay on the device; only a label is stored here.
  place_label text,
  active    boolean not null default true
);

create table public.consents (
  user_id     uuid not null references auth.users (id) on delete cascade,
  data_kind   text not null check (data_kind in ('health', 'cycle', 'location', 'ai')),
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  primary key (user_id, data_kind, granted_at)
);

-- ---------- Guard: the Bloom never goes backwards ----------
create function public.bloom_never_backwards() returns trigger
language plpgsql as $$
begin
  if new.care_days_total < old.care_days_total then
    raise exception 'bloom_state.care_days_total cannot decrease';
  end if;
  if new.stage < old.stage then
    raise exception 'bloom_state.stage cannot go backwards';
  end if;
  return new;
end $$;

create trigger bloom_state_forward_only
  before update on public.bloom_state
  for each row execute function public.bloom_never_backwards();

-- ---------- Pure helpers ----------
-- Keep in sync with src/domain/bloom.ts STAGE_THRESHOLDS.
create function public.bloom_stage_for(days integer) returns public.bloom_stage
language sql immutable as $$
  select case
    when days >= 45 then 'flourish'
    when days >= 25 then 'bloom'
    when days >= 12 then 'bud'
    when days >= 5  then 'leaves'
    when days >= 1  then 'sprout'
    else 'seed'
  end::public.bloom_stage
$$;

create function public.bloom_next_stage(s public.bloom_stage) returns public.bloom_stage
language sql immutable as $$
  select (enum_range(s, null))[2]
$$;

create function public.local_today(uid uuid, at timestamptz) returns date
language sql stable as $$
  select (at at time zone coalesce((select time_zone from public.profiles where user_id = uid), 'Asia/Jakarta'))::date
$$;

-- ---------- Core logic (internal, takes the time explicitly so it can be tested) ----------
create function public._complete_onboarding(uid uuid, p jsonb, at timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  tz    text := coalesce(p->>'time_zone', 'Asia/Jakarta');
  today date := (at at time zone tz)::date;
  birth date := (p->>'birth_date')::date;
begin
  if birth > (today - interval '18 years')::date then
    raise exception 'under_18' using errcode = 'P0001';
  end if;

  insert into profiles (user_id, nickname, birth_date, time_zone, goal, pregnant_or_breastfeeding,
                        activity, frequency, wake_time, shift_work)
  values (uid, p->>'nickname', birth, tz,
          -- weight goals are switched off during pregnancy or breastfeeding
          case when p->>'goal' = 'weight' and (p->>'pregnant_or_breastfeeding')::boolean is true
               then 'energy' else p->>'goal' end,
          (p->>'pregnant_or_breastfeeding')::boolean,
          p->>'activity', p->>'frequency',
          coalesce((p->>'wake_time')::time, '06:00'), coalesce((p->>'shift_work')::boolean, false))
  on conflict (user_id) do update set
    nickname = excluded.nickname, time_zone = excluded.time_zone, goal = excluded.goal,
    pregnant_or_breastfeeding = excluded.pregnant_or_breastfeeding, activity = excluded.activity,
    frequency = excluded.frequency, wake_time = excluded.wake_time, shift_work = excluded.shift_work;

  insert into bloom_state (user_id, stage_reached_at)
  values (uid, jsonb_build_object('seed', today))
  on conflict (user_id) do nothing;

  return jsonb_build_object('stage', 'seed');
end $$;

create function public._record_care_moment(uid uuid, p_pillar public.pillar, p_source public.care_source, at timestamptz)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  today    date := local_today(uid, at);
  st       bloom_state%rowtype;
  target   bloom_stage;
  advanced boolean := false;
begin
  select * into st from bloom_state where user_id = uid for update;
  if not found then
    raise exception 'onboarding_required' using errcode = 'P0001';
  end if;

  -- Same pillar within 30 minutes = duplicate: no new row, no growth.
  if exists (select 1 from care_moments
             where user_id = uid and pillar = p_pillar
               and created_at > at - interval '30 minutes' and created_at <= at + interval '30 minutes') then
    return jsonb_build_object('recorded', false, 'duplicate', true, 'stage', st.stage,
                              'stage_advanced', false, 'milestone', st.pending_milestone);
  end if;

  insert into care_moments (user_id, local_date, pillar, source, created_at)
  values (uid, today, p_pillar, p_source, at);

  -- Only the first moment of a new local day adds a care day. Older days never rewind anything.
  if st.last_care_day is null or today > st.last_care_day then
    st.care_days_total := st.care_days_total + 1;
    st.last_care_day := today;
    target := bloom_stage_for(st.care_days_total);
    if target > st.stage then
      st.stage := bloom_next_stage(st.stage);   -- at most one step per day
      st.stage_reached_at := st.stage_reached_at || jsonb_build_object(st.stage::text, today);
      st.pending_milestone := st.stage;
      advanced := true;
    end if;
    update bloom_state set
      care_days_total = st.care_days_total, last_care_day = st.last_care_day, stage = st.stage,
      stage_reached_at = st.stage_reached_at, pending_milestone = st.pending_milestone, updated_at = at
    where user_id = uid;
  end if;

  -- Note: care_days_total is deliberately not returned.
  return jsonb_build_object('recorded', true, 'duplicate', false, 'stage', st.stage,
                            'stage_advanced', advanced, 'milestone', st.pending_milestone);
end $$;

create function public._app_open(uid uuid, at timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  today date := local_today(uid, at);
  st    bloom_state%rowtype;
  tz    text;
  hour  integer;
  mode  day_mode;
begin
  select * into st from bloom_state where user_id = uid;
  if not found then
    return jsonb_build_object('onboarded', false);
  end if;
  select time_zone into tz from profiles where user_id = uid;
  hour := extract(hour from (at at time zone tz))::integer;
  select dp.mode into mode from day_plans dp where dp.user_id = uid and dp.local_date = today;

  return jsonb_build_object(
    'onboarded', true,
    'today', today,
    'stage', st.stage,
    'milestone', st.pending_milestone,
    -- Comeback: four or more full days without a Care Moment.
    'comeback', st.last_care_day is not null and (today - st.last_care_day) > 4,
    'needs_day_mode', mode is null,
    'day_mode', coalesce(mode, 'standard'),
    'night', hour >= 22 or hour < 5
  );
end $$;

-- ---------- Public API (what the app calls) ----------
create function public.complete_onboarding(p jsonb) returns jsonb
language sql security definer set search_path = public as $$
  select public._complete_onboarding(auth.uid(), p, now())
$$;

create function public.record_care_moment(p_pillar public.pillar, p_source public.care_source default 'manual')
returns jsonb
language sql security definer set search_path = public as $$
  select public._record_care_moment(auth.uid(), p_pillar, p_source, now())
$$;

create function public.app_open() returns jsonb
language sql security definer set search_path = public as $$
  select public._app_open(auth.uid(), now())
$$;

create function public.set_day_mode(p_mode public.day_mode, p_items jsonb default '[]'::jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.day_plans (user_id, local_date, mode, items)
  values (auth.uid(), public.local_today(auth.uid(), now()), p_mode, p_items)
  on conflict (user_id, local_date) do update set mode = excluded.mode, items = excluded.items
$$;

create function public.ack_milestone() returns void
language sql security definer set search_path = public as $$
  update public.bloom_state set pending_milestone = null where user_id = auth.uid()
$$;

-- What the app may read about the Bloom: no care-day count.
create view public.my_bloom as
  select stage, stage_reached_at, pending_milestone, variant
  from public.bloom_state
  where user_id = auth.uid();

-- ---------- Row Level Security ----------
alter table public.profiles       enable row level security;
alter table public.bloom_state    enable row level security;
alter table public.care_moments   enable row level security;
alter table public.day_plans      enable row level security;
alter table public.check_ins      enable row level security;
alter table public.weight_entries enable row level security;
alter table public.cycle_entries  enable row level security;
alter table public.reminders      enable row level security;
alter table public.consents       enable row level security;

create policy own_profile      on public.profiles       for select using (user_id = auth.uid());
create policy own_moments_read on public.care_moments   for select using (user_id = auth.uid());
create policy own_day_plans    on public.day_plans      for select using (user_id = auth.uid());
create policy own_check_ins    on public.check_ins      for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_weights      on public.weight_entries for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_cycles       on public.cycle_entries  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_reminders    on public.reminders      for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_consents     on public.consents       for all using (user_id = auth.uid()) with check (user_id = auth.uid());
-- bloom_state has RLS on and no policy: clients cannot touch it directly.

-- ---------- Grants ----------
revoke all on public.bloom_state from anon, authenticated;
revoke insert, update, delete on public.care_moments, public.profiles, public.day_plans from anon, authenticated;
grant select on public.my_bloom to authenticated;

revoke execute on function public._complete_onboarding(uuid, jsonb, timestamptz) from public, anon, authenticated;
revoke execute on function public._record_care_moment(uuid, public.pillar, public.care_source, timestamptz) from public, anon, authenticated;
revoke execute on function public._app_open(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.complete_onboarding(jsonb), public.record_care_moment(public.pillar, public.care_source),
  public.app_open(), public.set_day_mode(public.day_mode, jsonb), public.ack_milestone() from public, anon;
grant execute on function public.complete_onboarding(jsonb), public.record_care_moment(public.pillar, public.care_source),
  public.app_open(), public.set_day_mode(public.day_mode, jsonb), public.ack_milestone() to authenticated;
