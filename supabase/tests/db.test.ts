/**
 * Runs the real migration in an in-memory Postgres (PGlite) with a minimal stand-in
 * for Supabase's auth schema, then checks the Bloom rules end to end.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const AUTH_STUB = `
  create role anon; create role authenticated;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`;

const U = '11111111-1111-1111-1111-111111111111';
let db: PGlite;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows;

// Wall-clock instants in Jakarta (UTC+7): 09:00 local on day n after 2026-10-01.
const at = (n: number, hourLocal = 9) =>
  new Date(Date.UTC(2026, 9, 1, hourLocal - 7) + n * 86_400_000).toISOString();

const care = async (n: number, pillar = 'hydrate', hour = 9) =>
  (await q<{ r: Record<string, unknown> }>(
    `select public._record_care_moment($1, $2::public.pillar, 'manual', $3) as r`, [U, pillar, at(n, hour)],
  ))[0].r;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(AUTH_STUB);
  for (const file of readdirSync(join(__dirname, '../migrations')).filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(__dirname, '../migrations', file), 'utf8'));
  }
  await q(`insert into auth.users values ($1)`, [U]);
  await q(`select public._complete_onboarding($1, $2::jsonb, $3)`, [
    U,
    JSON.stringify({ nickname: 'Lala', birth_date: '1988-04-12', goal: 'weight', pregnant_or_breastfeeding: true, activity: 'intense', frequency: 'rarely', time_zone: 'Asia/Jakarta' }),
    at(0),
  ]);
}, 30000);

describe('onboarding', () => {
  it('starts as a seed and switches off weight goals in pregnancy', async () => {
    const [b] = await q<{ stage: string }>(`select stage from public.bloom_state where user_id = $1`, [U]);
    expect(b.stage).toBe('seed');
    const [p] = await q<{ goal: string }>(`select goal from public.profiles where user_id = $1`, [U]);
    expect(p.goal).toBe('energy');
  });

  it('refuses under-18 sign-up', async () => {
    const kid = '22222222-2222-2222-2222-222222222222';
    await q(`insert into auth.users values ($1)`, [kid]);
    await expect(
      q(`select public._complete_onboarding($1, $2::jsonb, $3)`, [
        kid, JSON.stringify({ nickname: 'X', birth_date: '2010-01-01', goal: 'energy', activity: 'none', frequency: 'rarely' }), at(0),
      ]),
    ).rejects.toThrow(/under_18/);
  });
});

describe('care moments and growth', () => {
  it('first moment makes a sprout and raises a milestone, without revealing the count', async () => {
    const r = await care(0);
    expect(r).toMatchObject({ recorded: true, stage: 'sprout', stage_advanced: true, milestone: 'sprout' });
    expect(Object.keys(r)).not.toContain('care_days_total');
  });

  it('same pillar within 30 minutes is a duplicate', async () => {
    const r = (await q<{ r: Record<string, unknown> }>(
      `select public._record_care_moment($1, 'hydrate', 'manual', $2::timestamptz + interval '10 minutes') as r`, [U, at(0)],
    ))[0].r;
    expect(r).toMatchObject({ recorded: false, duplicate: true });
  });

  it('more moments on the same day do not add care days', async () => {
    await care(0, 'move', 13);
    await care(0, 'nourish', 19);
    const [b] = await q<{ care_days_total: number }>(`select care_days_total from public.bloom_state where user_id = $1`, [U]);
    expect(b.care_days_total).toBe(1);
  });

  it('uses the Jakarta date: 23:30 local is still the same day', async () => {
    // day 1 at 23:30 local -> counts for day 1, not day 2
    await care(1, 'recover', 23.5);
    const [b] = await q<{ last_care_day: string }>(`select last_care_day::text from public.bloom_state where user_id = $1`, [U]);
    expect(b.last_care_day).toBe('2026-10-02');
  });

  it('reaches leaves on the 5th care day, even with gaps', async () => {
    await care(5);
    await care(9);
    const r = await care(20);
    expect(r).toMatchObject({ stage: 'leaves', stage_advanced: true });
  });

  it('a late-synced older day never rewinds anything', async () => {
    const before = (await q<{ stage: string; care_days_total: number }>(
      `select stage, care_days_total from public.bloom_state where user_id = $1`, [U]))[0];
    await care(3, 'mind');
    const after = (await q<{ stage: string; care_days_total: number }>(
      `select stage, care_days_total from public.bloom_state where user_id = $1`, [U]))[0];
    expect(after).toEqual(before);
  });

  it('the database itself refuses to move the Bloom backwards', async () => {
    await expect(q(`update public.bloom_state set stage = 'seed' where user_id = $1`, [U])).rejects.toThrow(/cannot go backwards/);
    await expect(q(`update public.bloom_state set care_days_total = 0 where user_id = $1`, [U])).rejects.toThrow(/cannot decrease/);
  });
});

describe('app open', () => {
  it('shows comeback after four empty days and asks for a day mode', async () => {
    // last care day is 2026-10-21 (day 20)
    const soon = (await q<{ r: Record<string, unknown> }>(`select public._app_open($1, $2) as r`, [U, at(24)]))[0].r;
    expect(soon).toMatchObject({ comeback: false, needs_day_mode: true, stage: 'leaves' });
    const later = (await q<{ r: Record<string, unknown> }>(`select public._app_open($1, $2) as r`, [U, at(25)]))[0].r;
    expect(later).toMatchObject({ comeback: true });
  });

  it('flags night for the resting Bloom', async () => {
    const r = (await q<{ r: Record<string, unknown> }>(`select public._app_open($1, $2) as r`, [U, at(25, 23)]))[0].r;
    expect(r.night).toBe(true);
  });
});

describe('privacy', () => {
  it('caps AI usage and denies direct access to counters', async () => {
    await q(`select set_config('request.jwt.claim.sub', $1, false)`, [U]);
    for (let i = 0; i < 5; i++) expect((await q<{ allowed: boolean }>('select consume_ai_request() as allowed'))[0].allowed).toBe(true);
    expect((await q<{ allowed: boolean }>('select consume_ai_request() as allowed'))[0].allowed).toBe(false);
    await q(`update ai_request_limits set minute = now() - interval '2 minutes', daily_count=30 where user_id=$1`, [U]);
    expect((await q<{ allowed: boolean }>('select consume_ai_request() as allowed'))[0].allowed).toBe(false);
    const [grants] = await q<{ read: boolean; write: boolean; anon: boolean }>(`select has_table_privilege('authenticated','ai_request_limits','select') as read, has_table_privilege('authenticated','ai_request_limits','update') as write, has_function_privilege('anon','consume_ai_request()','execute') as anon`);
    expect(grants).toEqual({ read: false, write: false, anon: false });
    await q(`select set_config('request.jwt.claim.sub', '', false)`);
    expect((await q<{ allowed: boolean }>('select consume_ai_request() as allowed'))[0].allowed).toBe(false);
  });
  it('persists a rest choice for the authenticated user', async () => {
    await q(`select set_config('request.jwt.claim.sub', $1, false)`, [U]);
    await q('select choose_rest()');
    expect((await q<{ resting: boolean }>('select resting from day_plans where user_id=$1 and local_date=local_today($1,now())', [U]))[0].resting).toBe(true);
    await q(`select set_config('request.jwt.claim.sub', '', false)`);
  });
  it('my_bloom exposes no care-day count', async () => {
    const cols = await q<{ column_name: string }>(
      `select column_name from information_schema.columns where table_name = 'my_bloom'`);
    expect(cols.map((c) => c.column_name).sort()).toEqual(['pending_milestone', 'stage', 'stage_reached_at', 'variant']);
  });

  it('app users cannot read bloom_state or call internal functions', async () => {
    const [grants] = await q<{ can_read: boolean; can_call: boolean }>(`
      select has_table_privilege('authenticated', 'public.bloom_state', 'select') as can_read,
             has_function_privilege('authenticated', 'public._record_care_moment(uuid, public.pillar, public.care_source, timestamptz)', 'execute') as can_call`);
    expect(grants).toEqual({ can_read: false, can_call: false });
  });
});

describe('time zone changes', () => {
  const T = '33333333-3333-3333-3333-333333333333';
  const onboard = (tz: string, iso: string) => q(`select public._complete_onboarding($1, $2::jsonb, $3)`, [
    T, JSON.stringify({ nickname: 'Tz', birth_date: '1990-01-01', goal: 'energy', activity: 'none', frequency: 'rarely', time_zone: tz }), iso]);
  const careAt = async (pillar: string, iso: string) =>
    (await q<{ r: Record<string, unknown> }>(`select public._record_care_moment($1, $2::public.pillar, 'manual', $3) as r`, [T, pillar, iso]))[0].r;
  const days = async () => (await q<{ n: number; d: string }>(
    `select care_days_total as n, last_care_day::text as d from public.bloom_state where user_id = $1`, [T]))[0];

  it('switching west-to-east cannot add a second care day within minutes', async () => {
    await q(`insert into auth.users values ($1)`, [T]);
    await onboard('Pacific/Pago_Pago', '2026-10-01T02:00:00Z');           // 30 Sep, 15:00 local
    await careAt('hydrate', '2026-10-01T02:00:00Z');
    await onboard('Pacific/Kiritimati', '2026-10-01T02:30:00Z');          // now 1 Oct, 16:30 local
    const r = await careAt('mind', '2026-10-01T02:40:00Z');
    expect(r).toMatchObject({ recorded: true, stage_advanced: false });
    expect(await days()).toEqual({ n: 1, d: '2026-10-01' });
  });

  it('still counts the next real day in the new zone, and never lowers anything', async () => {
    const r = await careAt('mind', '2026-10-01T12:00:00Z');                // 2 Oct, 02:00 Kiritimati
    expect(r).toMatchObject({ recorded: true });
    expect(await days()).toEqual({ n: 2, d: '2026-10-02' });
    await onboard('Pacific/Pago_Pago', '2026-10-01T12:30:00Z');           // east-to-west: no rewind
    expect(await days()).toEqual({ n: 2, d: '2026-10-02' });
  });

  it('rejects an unknown time zone without writing anything', async () => {
    await expect(onboard('Mars/Olympus', '2026-10-01T13:00:00Z')).rejects.toThrow();
    const [p] = await q<{ time_zone: string }>(`select time_zone from public.profiles where user_id = $1`, [T]);
    expect(p.time_zone).toBe('Pacific/Pago_Pago');
  });
});
