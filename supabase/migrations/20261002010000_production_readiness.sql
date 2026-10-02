-- Bloome v0.4 — production readiness (2 Oct 2026).
--   * Consent is recorded in the database and changed only through RPCs.
--   * Check-in and rest are single atomic calls (no half-saved check-ins on retry).
--   * Users can export their data (UU PDP right of access). Account deletion runs
--     in the delete-account Edge Function; every table cascades from auth.users.
--   * set_day_mode no longer wipes plan items when only the mode changes.

-- ---------- Consent ----------
drop policy if exists own_consents on public.consents;
create policy own_consents_read on public.consents for select using (user_id = auth.uid());
revoke insert, update, delete on public.consents from anon, authenticated;

create function public._has_consent(uid uuid, p_kind text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from consents where user_id = uid and data_kind = p_kind and revoked_at is null)
$$;

create function public._set_consent(uid uuid, p_kind text, p_granted boolean, at timestamptz) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  if p_granted then
    if not _has_consent(uid, p_kind) then
      insert into consents (user_id, data_kind, granted_at) values (uid, p_kind, at);
    end if;
  else
    update consents set revoked_at = at where user_id = uid and data_kind = p_kind and revoked_at is null;
  end if;
  return _has_consent(uid, p_kind);
end $$;

create function public.has_consent(p_kind text) returns boolean
language sql stable security definer set search_path = public as $$
  select public._has_consent(auth.uid(), p_kind)
$$;

create function public.set_consent(p_kind text, p_granted boolean) returns boolean
language sql security definer set search_path = public as $$
  select public._set_consent(auth.uid(), p_kind, p_granted, now())
$$;

-- ---------- Check-in: one atomic call ----------
alter table public.check_ins alter column user_id set default auth.uid();

create function public._submit_check_in(uid uuid, p jsonb, at timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  today     date;
  pillars   public.pillar[] := '{}';
  pl        public.pillar;
  r         jsonb;
  recorded  text[] := '{}';
  advanced  boolean := false;
  milestone text;
  stage     text;
begin
  if not exists (select 1 from bloom_state where user_id = uid) then
    raise exception 'onboarding_required' using errcode = 'P0001';
  end if;
  today := local_today(uid, at);

  insert into check_ins (user_id, created_at, portion, mood, eating_reason, water_glasses, hard_day, note)
  values (uid, at, p->>'portion', p->>'mood', p->>'eating_reason',
          (p->>'water_glasses')::smallint, coalesce((p->>'hard_day')::boolean, false), nullif(btrim(p->>'note'), ''));

  -- A hard day lightens today's plan; plan items are kept.
  if coalesce((p->>'hard_day')::boolean, false) then
    insert into day_plans (user_id, local_date, mode) values (uid, today, 'minimum')
    on conflict (user_id, local_date) do update set mode = 'minimum';
  end if;

  -- Each filled part is a Care Moment; the Bloom still counts the day once.
  -- The app skips this when the note needs a support screen first.
  if coalesce((p->>'record_moments')::boolean, true) then
    if p->>'portion' is not null then pillars := pillars || 'nourish'::public.pillar; end if;
    if coalesce((p->>'water_glasses')::int, 0) > 0 then pillars := pillars || 'hydrate'::public.pillar; end if;
    if p->>'mood' is not null then pillars := pillars || 'mind'::public.pillar; end if;
    foreach pl in array pillars loop
      r := _record_care_moment(uid, pl, 'manual', at);
      if (r->>'recorded')::boolean then recorded := recorded || pl::text; end if;
      if (r->>'stage_advanced')::boolean then advanced := true; milestone := r->>'milestone'; end if;
    end loop;
  end if;

  select b.stage::text into stage from bloom_state b where b.user_id = uid;
  return jsonb_build_object('recorded_pillars', to_jsonb(recorded), 'stage', stage,
                            'stage_advanced', advanced, 'milestone', milestone);
end $$;

create function public.submit_check_in(p jsonb) returns jsonb
language sql security definer set search_path = public as $$
  select public._submit_check_in(auth.uid(), p, now())
$$;

-- ---------- Rest: choose rest and record the Recover moment together ----------
drop function public.choose_rest();

create function public._choose_rest(uid uuid, at timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from bloom_state where user_id = uid) then
    raise exception 'onboarding_required' using errcode = 'P0001';
  end if;
  insert into day_plans (user_id, local_date, mode, resting)
  values (uid, local_today(uid, at), 'minimum', true)
  on conflict (user_id, local_date) do update set resting = true;
  return _record_care_moment(uid, 'recover', 'manual', at);
end $$;

create function public.choose_rest() returns jsonb
language sql security definer set search_path = public as $$
  select public._choose_rest(auth.uid(), now())
$$;

-- ---------- Day mode: keep plan items unless new ones are given ----------
drop function public.set_day_mode(public.day_mode, jsonb);
create function public.set_day_mode(p_mode public.day_mode, p_items jsonb default null) returns void
language sql security definer set search_path = public as $$
  insert into public.day_plans (user_id, local_date, mode, items)
  values (auth.uid(), public.local_today(auth.uid(), now()), p_mode, coalesce(p_items, '[]'::jsonb))
  on conflict (user_id, local_date) do update
    set mode = excluded.mode, items = coalesce(p_items, public.day_plans.items)
$$;

-- ---------- Data export ----------
-- Everything stored about the user. The internal care-day counter stays out (product rule);
-- the Care Moments themselves are included.
create function public._export_my_data(uid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id) from auth.users u where u.id = uid),
    'profile', (select to_jsonb(p) from profiles p where p.user_id = uid),
    'bloom', (select jsonb_build_object('stage', b.stage, 'stage_reached_at', b.stage_reached_at, 'variant', b.variant)
              from bloom_state b where b.user_id = uid),
    'care_moments', coalesce((select jsonb_agg(to_jsonb(m) - 'user_id' order by m.created_at) from care_moments m where m.user_id = uid), '[]'),
    'day_plans', coalesce((select jsonb_agg(to_jsonb(d) - 'user_id' order by d.local_date) from day_plans d where d.user_id = uid), '[]'),
    'check_ins', coalesce((select jsonb_agg(to_jsonb(c) - 'user_id' order by c.created_at) from check_ins c where c.user_id = uid), '[]'),
    'weight_entries', coalesce((select jsonb_agg(to_jsonb(w) - 'user_id' order by w.date) from weight_entries w where w.user_id = uid), '[]'),
    'cycle_entries', coalesce((select jsonb_agg(to_jsonb(y) - 'user_id' order by y.start_date) from cycle_entries y where y.user_id = uid), '[]'),
    'reminders', coalesce((select jsonb_agg(to_jsonb(r) - 'user_id') from reminders r where r.user_id = uid), '[]'),
    'consents', coalesce((select jsonb_agg(to_jsonb(k) - 'user_id' order by k.granted_at) from consents k where k.user_id = uid), '[]')
  )
$$;

create function public.export_my_data() returns jsonb
language sql stable security definer set search_path = public as $$
  select public._export_my_data(auth.uid())
$$;

-- ---------- Grants ----------
revoke execute on function public._has_consent(uuid, text), public._set_consent(uuid, text, boolean, timestamptz),
  public._submit_check_in(uuid, jsonb, timestamptz), public._choose_rest(uuid, timestamptz),
  public._export_my_data(uuid) from public, anon, authenticated;
revoke execute on function public.has_consent(text), public.set_consent(text, boolean), public.submit_check_in(jsonb),
  public.choose_rest(), public.set_day_mode(public.day_mode, jsonb), public.export_my_data() from public, anon;
grant execute on function public.has_consent(text), public.set_consent(text, boolean), public.submit_check_in(jsonb),
  public.choose_rest(), public.set_day_mode(public.day_mode, jsonb), public.export_my_data() to authenticated;
