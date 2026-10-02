-- Bloome v0.3.1 — fixes from the architecture review (2 Oct 2026).
--
-- 1. Time-zone switch could add an extra care day.
--    Switching from a far-west zone (e.g. Pacific/Pago_Pago, UTC-11) to a far-east one
--    (Pacific/Kiritimati, UTC+14) moved "today" forward by a calendar day, so a second
--    care day could be counted within minutes. Now, when the time zone changes, the last
--    care day is re-read in the new zone: last_care_day = max(old, date of the latest
--    Care Moment in the new zone). Nothing ever goes down; at most the next day waits
--    until it is really a new day in the new zone.
--
-- 2. Duplicate window drifted from src/domain/careMoment.ts.
--    TS treats |Δt| < 30 min as a duplicate; SQL used (-30, +30]. A late-synced moment
--    exactly 30 min before an existing one was a duplicate in SQL but not in demo mode.
--    Both are now strictly < 30 min on each side (see supabase/tests/parity.test.ts).

create or replace function public._complete_onboarding(uid uuid, p jsonb, at timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  tz     text := coalesce(p->>'time_zone', 'Asia/Jakarta');
  today  date;
  birth  date := (p->>'birth_date')::date;
  old_tz text;
begin
  -- Rejects unknown zone names before anything is written.
  today := (at at time zone tz)::date;

  if birth > (today - interval '18 years')::date then
    raise exception 'under_18' using errcode = 'P0001';
  end if;

  select time_zone into old_tz from profiles where user_id = uid for update;

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

  -- Time zone changed: re-read the last care day in the new zone (forward only).
  if old_tz is not null and old_tz <> tz then
    update bloom_state b set
      last_care_day = greatest(b.last_care_day, (
        select (max(m.created_at) at time zone tz)::date from care_moments m where m.user_id = uid)),
      updated_at = at
    where b.user_id = uid and b.last_care_day is not null;
  end if;

  return jsonb_build_object('stage', (select stage from bloom_state where user_id = uid));
end $$;

create or replace function public._record_care_moment(uid uuid, p_pillar public.pillar, p_source public.care_source, at timestamptz)
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

  -- Same pillar strictly within 30 minutes either side = duplicate. Mirrors isDuplicate() in TS.
  if exists (select 1 from care_moments
             where user_id = uid and pillar = p_pillar
               and created_at > at - interval '30 minutes' and created_at < at + interval '30 minutes') then
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

-- `create or replace` keeps existing grants, but restate them so this file is safe on its own.
revoke execute on function public._complete_onboarding(uuid, jsonb, timestamptz) from public, anon, authenticated;
revoke execute on function public._record_care_moment(uuid, public.pillar, public.care_source, timestamptz) from public, anon, authenticated;

-- Indexes for the reads the app makes on every Today screen.
create index if not exists care_moments_user_date on public.care_moments (user_id, local_date);
create index if not exists check_ins_user_time    on public.check_ins (user_id, created_at desc);
create index if not exists weight_entries_user_date on public.weight_entries (user_id, date desc);
