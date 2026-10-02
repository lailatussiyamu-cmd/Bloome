/** Consent, atomic check-in, rest, day mode, export and deletion cascade (migration 20261002010000). */
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
const U = '44444444-4444-4444-4444-444444444444';
const OTHER = '55555555-5555-5555-5555-555555555555';
let db: PGlite;
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const at = (day: number, hourLocal = 9) => new Date(Date.UTC(2026, 9, 1, hourLocal - 7) + day * 86_400_000).toISOString();
const checkIn = async (p: Record<string, unknown>, iso: string, uid = U) =>
  (await q<{ r: Record<string, unknown> }>(`select public._submit_check_in($1, $2::jsonb, $3) as r`, [uid, JSON.stringify(p), iso]))[0].r;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(AUTH_STUB);
  const dir = join(__dirname, '../migrations');
  for (const f of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) await db.exec(readFileSync(join(dir, f), 'utf8'));
  for (const id of [U, OTHER]) {
    await q(`insert into auth.users values ($1)`, [id]);
    await q(`select public._complete_onboarding($1, $2::jsonb, $3)`, [id, JSON.stringify({
      nickname: 'R', birth_date: '1990-01-01', goal: 'energy', activity: 'none', frequency: 'rarely', time_zone: 'Asia/Jakarta' }), at(0)]);
  }
}, 30000);

describe('consent', () => {
  it('is off until granted, can be revoked, and keeps history', async () => {
    const has = async () => (await q<{ v: boolean }>(`select public._has_consent($1, 'ai') as v`, [U]))[0].v;
    expect(await has()).toBe(false);
    await q(`select public._set_consent($1, 'ai', true, $2)`, [U, at(0)]);
    await q(`select public._set_consent($1, 'ai', true, $2)`, [U, at(0, 10)]); // granting twice keeps one active row
    expect(await has()).toBe(true);
    await q(`select public._set_consent($1, 'ai', false, $2)`, [U, at(0, 11)]);
    expect(await has()).toBe(false);
    const rows = await q<{ revoked: boolean }>(`select revoked_at is not null as revoked from consents where user_id = $1`, [U]);
    expect(rows).toEqual([{ revoked: true }]);
  });

  it('cannot be written directly by app users, only through the RPC', async () => {
    const [g] = await q<{ ins: boolean; upd: boolean; rpc: boolean; anon: boolean }>(`
      select has_table_privilege('authenticated', 'public.consents', 'insert') as ins,
             has_table_privilege('authenticated', 'public.consents', 'update') as upd,
             has_function_privilege('authenticated', 'public.set_consent(text, boolean)', 'execute') as rpc,
             has_function_privilege('anon', 'public.set_consent(text, boolean)', 'execute') as anon`);
    expect(g).toEqual({ ins: false, upd: false, rpc: true, anon: false });
  });

  it('rejects unknown consent kinds', async () => {
    await expect(q(`select public._set_consent($1, 'everything', true, $2)`, [U, at(0)])).rejects.toThrow();
  });
});

describe('atomic check-in', () => {
  it('saves the check-in and records one moment per filled part, counting the day once', async () => {
    const r = await checkIn({ portion: 'medium', water_glasses: 2, mood: 'calm', note: '  ' }, at(1));
    expect(r).toMatchObject({ recorded_pillars: ['nourish', 'hydrate', 'mind'], stage: 'sprout', stage_advanced: true, milestone: 'sprout' });
    const [c] = await q<{ n: number; note: string | null }>(`select count(*)::int as n, max(note) as note from check_ins where user_id = $1`, [U]);
    expect(c).toEqual({ n: 1, note: null });
    const [b] = await q<{ n: number }>(`select care_days_total as n from bloom_state where user_id = $1`, [U]);
    expect(b.n).toBe(1);
  });

  it('a retry within 30 minutes adds a check-in row but no duplicate moments', async () => {
    const r = await checkIn({ portion: 'medium', water_glasses: 2, mood: 'calm' }, at(1, 9.25));
    expect(r).toMatchObject({ recorded_pillars: [], stage_advanced: false, milestone: null });
  });

  it('a hard day switches today to Minimum without wiping plan items', async () => {
    await q(`insert into day_plans (user_id, local_date, mode, items) values ($1, '2026-10-03', 'standard', '[{"id":"x"}]')`, [U]);
    await checkIn({ hard_day: true }, at(2));
    const [d] = await q<{ mode: string; items: unknown }>(`select mode::text, items from day_plans where user_id = $1 and local_date = '2026-10-03'`, [U]);
    expect(d).toEqual({ mode: 'minimum', items: [{ id: 'x' }] });
  });

  it('skips moments when the app routes to support first, and rolls back entirely on bad input', async () => {
    expect(await checkIn({ mood: 'tired', record_moments: false }, at(3))).toMatchObject({ recorded_pillars: [] });
    const before = (await q<{ n: number }>(`select count(*)::int as n from check_ins where user_id = $1`, [U]))[0].n;
    await expect(checkIn({ portion: 'huge', mood: 'calm' }, at(4))).rejects.toThrow();
    expect((await q<{ n: number }>(`select count(*)::int as n from check_ins where user_id = $1`, [U]))[0].n).toBe(before);
    expect((await q<{ n: number }>(`select count(*)::int as n from care_moments where user_id = $1 and local_date = '2026-10-05'`, [U]))[0].n).toBe(0);
  });
});

describe('rest and day mode', () => {
  it('choosing rest records the Recover moment in the same call', async () => {
    const r = (await q<{ r: Record<string, unknown> }>(`select public._choose_rest($1, $2) as r`, [U, at(5)]))[0].r;
    expect(r).toMatchObject({ recorded: true });
    const [d] = await q<{ resting: boolean }>(`select resting from day_plans where user_id = $1 and local_date = '2026-10-06'`, [U]);
    expect(d.resting).toBe(true);
  });

  it('set_day_mode keeps existing items when none are given', async () => {
    await q(`select set_config('request.jwt.claim.sub', $1, false)`, [U]);
    await q(`insert into day_plans (user_id, local_date, mode, items) values ($1, local_today($1, now()), 'standard', '[{"id":"keep"}]')
             on conflict (user_id, local_date) do update set items = excluded.items`, [U]);
    await q(`select public.set_day_mode('recovery')`);
    const [d] = await q<{ mode: string; items: unknown }>(`select mode::text, items from day_plans where user_id = $1 and local_date = local_today($1, now())`, [U]);
    expect(d).toEqual({ mode: 'recovery', items: [{ id: 'keep' }] });
    await q(`select set_config('request.jwt.claim.sub', '', false)`);
  });
});

describe('export and deletion', () => {
  it('exports the user’s own data without the internal counter or other users’ rows', async () => {
    await checkIn({ mood: 'happy', note: 'milik orang lain' }, at(1), OTHER);
    const data = (await q<{ d: Record<string, unknown[]> & { bloom: Record<string, unknown> } }>(`select public._export_my_data($1) as d`, [U]))[0].d;
    expect(data.check_ins.length).toBeGreaterThan(0);
    expect(JSON.stringify(data)).not.toContain('milik orang lain');
    expect(JSON.stringify(data)).not.toContain('care_days_total');
    expect(Object.keys(data.bloom).sort()).toEqual(['stage', 'stage_reached_at', 'variant']);
  });

  it('deleting the auth user removes every row about them', async () => {
    await q(`delete from auth.users where id = $1`, [U]);
    const tables = ['profiles', 'bloom_state', 'care_moments', 'day_plans', 'check_ins', 'weight_entries', 'cycle_entries', 'reminders', 'consents', 'ai_request_limits'];
    for (const t of tables) {
      const [r] = await q<{ n: number }>(`select count(*)::int as n from public.${t} where user_id = $1`, [U]);
      expect([t, r.n]).toEqual([t, 0]);
    }
    const [o] = await q<{ n: number }>(`select count(*)::int as n from public.check_ins where user_id = $1`, [OTHER]);
    expect(o.n).toBe(1);
  });
});
