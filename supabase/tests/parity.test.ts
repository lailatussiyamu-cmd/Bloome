/**
 * Parity: the Bloom rules exist twice — in TypeScript (src/domain, used by demo mode)
 * and in SQL (supabase/migrations, used in production). These tests replay the same
 * events through both and fail on any difference, so the two cannot drift apart silently.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyCareMoment, initialBloomState, stageForCareDays, type BloomState } from '../../src/domain/bloom';
import { isDuplicate, localDateIn, PILLARS, type CareMoment, type Pillar } from '../../src/domain/careMoment';
import { isComeback } from '../../src/domain/dayMode';

const AUTH_STUB = `
  create role anon; create role authenticated;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`;
const TZ = 'Asia/Jakarta';
const START = Date.UTC(2026, 9, 1, 0, 0); // 07:00 Jakarta, 1 Oct 2026
let db: PGlite;
let users = 0;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows;

async function newUser(): Promise<string> {
  users += 1;
  const id = `00000000-0000-0000-0000-${String(users).padStart(12, '0')}`;
  await q(`insert into auth.users values ($1)`, [id]);
  await q(`select public._complete_onboarding($1, $2::jsonb, $3)`, [
    id,
    JSON.stringify({ nickname: 'P', birth_date: '1990-01-01', goal: 'energy', activity: 'none', frequency: 'rarely', time_zone: TZ }),
    new Date(START).toISOString(),
  ]);
  return id;
}

/** Small deterministic PRNG so failures are reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(AUTH_STUB);
  const dir = join(__dirname, '../migrations');
  for (const file of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(dir, file), 'utf8'));
  }
}, 30000);

describe('TypeScript and SQL rules agree', () => {
  it('stage thresholds match for 0–80 care days', async () => {
    const rows = await q<{ d: number; s: string }>(`select d, public.bloom_stage_for(d)::text as s from generate_series(0, 80) d`);
    for (const r of rows) expect([r.d, r.s]).toEqual([r.d, stageForCareDays(r.d)]);
  });

  it('comeback threshold matches', async () => {
    const id = await newUser();
    await q(`select public._record_care_moment($1, 'hydrate', 'manual', $2)`, [id, new Date(START).toISOString()]);
    for (let day = 0; day <= 8; day++) {
      const at = new Date(START + day * 86_400_000);
      const [{ r }] = await q<{ r: { comeback: boolean } }>(`select public._app_open($1, $2) as r`, [id, at.toISOString()]);
      expect([day, r.comeback]).toEqual([day, isComeback(localDateIn(TZ, new Date(START)), localDateIn(TZ, at))]);
    }
  });

  // Includes late-synced (out-of-order) events and exact 30-minute boundaries.
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`random care sequence #${seed} gives identical results`, async () => {
      const id = await newUser();
      const rand = rng(seed);
      let state: BloomState = initialBloomState(localDateIn(TZ, new Date(START)));
      const moments: CareMoment[] = [];
      let clock = START;

      for (let i = 0; i < 160; i++) {
        // Mostly move forward on a 5-minute grid; sometimes jump days; sometimes arrive late.
        const r = rand();
        if (r < 0.55) clock += 5 * 60_000 * Math.floor(rand() * 12);
        else if (r < 0.85) clock += 86_400_000 * Math.floor(1 + rand() * 3);
        const at = r >= 0.92 ? clock - 5 * 60_000 * Math.floor(1 + rand() * 300) : clock;
        const pillar: Pillar = PILLARS[Math.floor(rand() * 2)]; // two pillars → many duplicates
        const iso = new Date(at).toISOString();

        const candidate: CareMoment = { pillar, source: 'manual', createdAt: iso, localDate: localDateIn(TZ, new Date(at)) };
        let expected;
        if (isDuplicate(candidate, moments)) {
          expected = { recorded: false, duplicate: true, stage: state.stage, stage_advanced: false, milestone: state.pendingMilestone };
        } else {
          moments.push(candidate);
          const res = applyCareMoment(state, candidate.localDate);
          state = res.state;
          expected = { recorded: true, duplicate: false, stage: state.stage, stage_advanced: res.stageAdvanced, milestone: state.pendingMilestone };
        }

        const [{ r: actual }] = await q<{ r: unknown }>(
          `select public._record_care_moment($1, $2::public.pillar, 'manual', $3) as r`, [id, pillar, iso]);
        expect({ step: i, iso, pillar, ...(actual as object) }).toEqual({ step: i, iso, pillar, ...expected });
      }

      const [b] = await q<{ n: number; d: string }>(
        `select care_days_total as n, last_care_day::text as d from public.bloom_state where user_id = $1`, [id]);
      expect(b).toEqual({ n: state.careDaysTotal, d: state.lastCareDay });
    });
  }
});
