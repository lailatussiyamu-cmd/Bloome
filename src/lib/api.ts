import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  applyCareMoment,
  initialBloomState,
  rebaseForTimeZone,
  toPublicBloom,
  type BloomStage,
  type BloomState,
  type PublicBloom,
} from '../domain/bloom';
import { isDuplicate, localDateIn, type CareMoment, type CareSource, type Pillar } from '../domain/careMoment';
import { isComeback, type DayMode } from '../domain/dayMode';
import { canRegister, type WeightEntry } from '../domain/safety';
import { effectiveGoal, type OnboardingAnswers } from '../domain/onboarding';
import { getSupabase } from './supabase';
import { DELETE_CONFIRMATION } from '../../supabase/functions/_shared/accountPolicy.ts';

export interface Profile extends OnboardingAnswers {
  nickname: string;
  timeZone: string;
}

export interface AppOpen {
  onboarded: boolean;
  today?: string;
  stage?: BloomStage;
  milestone?: BloomStage | null;
  comeback?: boolean;
  needsDayMode?: boolean;
  dayMode?: DayMode;
  night?: boolean;
}

export interface CareResult {
  recorded: boolean;
  duplicate: boolean;
  stage: BloomStage;
  stageAdvanced: boolean;
  milestone: BloomStage | null;
}

export interface CheckInInput {
  portion?: 'very_small' | 'small' | 'medium' | 'large';
  mood?: 'tired' | 'stressed' | 'okay' | 'calm' | 'happy';
  eatingReason?: 'hungry' | 'tired' | 'stressed' | 'bored' | 'event';
  waterGlasses?: number;
  hardDay: boolean;
  note?: string;
}

/** Raw inputs for evaluateSafety(); the rules themselves live in src/domain/safety.ts. */
export interface SafetyInputs {
  recentNotes: string[];
  verySmallPortionsInLast7Days: number;
  weights: WeightEntry[];
}

export interface CheckInResult {
  recordedPillars: Pillar[];
  stageAdvanced: boolean;
  milestone: BloomStage | null;
}

export type ConsentKind = 'ai' | 'health' | 'cycle' | 'location';

const DAY_MS = 86_400_000;

/** Everything the screens need. Two implementations: Supabase, and a local demo store. */
export interface BloomeApi {
  kind: 'supabase' | 'local';
  appOpen(): Promise<AppOpen>;
  completeOnboarding(p: Profile): Promise<void>;
  getProfile(): Promise<Profile | null>;
  getBloom(): Promise<PublicBloom | null>;
  recordCareMoment(pillar: Pillar, source?: CareSource): Promise<CareResult>;
  setDayMode(mode: DayMode): Promise<void>;
  ackMilestone(): Promise<void>;
  /** Saves the check-in, lightens a hard day, and records its Care Moments in one step. */
  submitCheckIn(c: CheckInInput, opts: { recordMoments: boolean }): Promise<CheckInResult>;
  safetyInputs(): Promise<SafetyInputs>;
  todayCare(): Promise<{ pillars: Pillar[]; resting: boolean }>;
  /** Marks today as rest and records the Recover moment in one step. */
  chooseRest(): Promise<CareResult>;
  hasConsent(kind: ConsentKind): Promise<boolean>;
  setConsent(kind: ConsentKind, granted: boolean): Promise<boolean>;
  /** Everything stored about the user, as pretty JSON. */
  exportData(): Promise<string>;
  /** Permanently deletes the account and all data. */
  deleteAccount(confirm: string): Promise<void>;
  signOut(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Local demo store: same rules (src/domain), kept on the phone. For trying the
// app before Supabase is set up. Not for real users' health data.
// ---------------------------------------------------------------------------
interface LocalDb {
  profile: Profile | null;
  bloom: BloomState | null;
  moments: CareMoment[];
  dayModes: Record<string, DayMode>;
  restDays?: Record<string, boolean>;
  checkIns: (CheckInInput & { at: string })[];
  weights?: WeightEntry[];
  consents?: Partial<Record<ConsentKind, boolean>>;
}

const KEY = 'bloome.local.v1';

async function load(): Promise<LocalDb> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as LocalDb) : { profile: null, bloom: null, moments: [], dayModes: {}, checkIns: [] };
}
async function save(db: LocalDb) {
  await AsyncStorage.setItem(KEY, JSON.stringify(db));
}

const localImplementation: BloomeApi = {
  kind: 'local',
  async appOpen() {
    const db = await load();
    if (!db.profile || !db.bloom) return { onboarded: false };
    const now = new Date();
    const today = localDateIn(db.profile.timeZone, now);
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: db.profile.timeZone, hour: '2-digit', hour12: false }).format(now));
    return {
      onboarded: true,
      today,
      stage: db.bloom.stage,
      milestone: db.bloom.pendingMilestone,
      comeback: isComeback(db.bloom.lastCareDay, today),
      needsDayMode: !db.dayModes[today],
      dayMode: db.dayModes[today] ?? 'standard',
      night: hour >= 22 || hour < 5,
    };
  },
  async completeOnboarding(p) {
    if (!p.nickname.trim() || p.nickname.trim().length > 40 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.wakeTime)) throw new Error('invalid_profile');
    const today = localDateIn(p.timeZone);
    if (!canRegister(p.birthDate, today)) throw new Error('under_18');
    const db = await load();
    if (db.bloom && db.profile && db.profile.timeZone !== p.timeZone) {
      const latest = db.moments.reduce<string | null>((max, m) => (max === null || m.createdAt > max ? m.createdAt : max), null);
      db.bloom = rebaseForTimeZone(db.bloom, latest, (at) => localDateIn(p.timeZone, at));
    }
    db.profile = { ...p, goal: effectiveGoal(p) };
    db.bloom = db.bloom ?? initialBloomState(today);
    await save(db);
  },
  async getProfile() {
    return (await load()).profile;
  },
  async getBloom() {
    const db = await load();
    return db.bloom ? toPublicBloom(db.bloom) : null;
  },
  async recordCareMoment(pillar, source = 'manual') {
    const db = await load();
    const r = recordInto(db, pillar, source, new Date());
    await save(db);
    return r;
  },
  async setDayMode(mode) {
    const db = await load();
    if (!db.profile) return;
    db.dayModes[localDateIn(db.profile.timeZone)] = mode;
    await save(db);
  },
  async ackMilestone() {
    const db = await load();
    if (db.bloom) db.bloom = { ...db.bloom, pendingMilestone: null };
    await save(db);
  },
  async submitCheckIn(c, { recordMoments }) {
    const db = await load();
    if (!db.profile || !db.bloom) throw new Error('onboarding_required');
    const now = new Date();
    const today = localDateIn(db.profile.timeZone, now);
    db.checkIns.push({ ...c, note: c.note?.trim() || undefined, at: now.toISOString() });
    db.checkIns = db.checkIns.slice(-60);
    if (c.hardDay) db.dayModes[today] = 'minimum';
    const result: CheckInResult = { recordedPillars: [], stageAdvanced: false, milestone: null };
    if (recordMoments) {
      const pillars: Pillar[] = [];
      if (c.portion) pillars.push('nourish');
      if ((c.waterGlasses ?? 0) > 0) pillars.push('hydrate');
      if (c.mood) pillars.push('mind');
      for (const pillar of pillars) {
        const r = recordInto(db, pillar, 'manual', now);
        if (r.recorded) result.recordedPillars.push(pillar);
        if (r.stageAdvanced) { result.stageAdvanced = true; result.milestone = r.milestone; }
      }
    }
    await save(db);
    return result;
  },
  async safetyInputs() {
    const db = await load();
    const week = db.checkIns.filter(c => Date.parse(c.at) >= Date.now() - 7 * DAY_MS);
    return {
      recentNotes: week.slice(-14).map((c) => c.note ?? '').filter(Boolean),
      verySmallPortionsInLast7Days: week.filter(c => c.portion === 'very_small').length,
      weights: db.weights ?? [],
    };
  },
  async todayCare() {
    const db = await load();
    if (!db.profile) return { pillars: [], resting: false };
    const today = localDateIn(db.profile.timeZone);
    return { pillars: [...new Set(db.moments.filter(m => m.localDate === today).map(m => m.pillar))], resting: !!db.restDays?.[today] };
  },
  async chooseRest() {
    const db = await load();
    if (!db.profile) throw new Error('onboarding_required');
    const now = new Date();
    db.restDays = { ...db.restDays, [localDateIn(db.profile.timeZone, now)]: true };
    const r = recordInto(db, 'recover', 'manual', now);
    await save(db);
    return r;
  },
  async hasConsent(kind) {
    return !!(await load()).consents?.[kind];
  },
  async setConsent(kind, granted) {
    const db = await load();
    db.consents = { ...db.consents, [kind]: granted };
    await save(db);
    return granted;
  },
  async exportData() {
    const db = await load();
    const { bloom, ...rest } = db;
    const publicBloom = bloom ? { stage: bloom.stage, stageReachedAt: bloom.stageReachedAt } : null;
    return JSON.stringify({ exportedAt: new Date().toISOString(), mode: 'demo', ...rest, bloom: publicBloom }, null, 2);
  },
  async deleteAccount(confirm) {
    if (confirm !== DELETE_CONFIRMATION) throw new Error('confirmation_required');
    await AsyncStorage.removeItem(KEY);
  },
  async signOut() {
    // Demo mode has no account.
  },
};

/** Shared by every local write that records a Care Moment. Mutates `db`; the caller saves. */
function recordInto(db: LocalDb, pillar: Pillar, source: CareSource, now: Date): CareResult {
  if (!db.profile || !db.bloom) throw new Error('onboarding_required');
  const moment: CareMoment = { pillar, source, createdAt: now.toISOString(), localDate: localDateIn(db.profile.timeZone, now) };
  // Check every moment, not just the latest few: late-synced moments must match the SQL rule.
  if (isDuplicate(moment, db.moments)) {
    return { recorded: false, duplicate: true, stage: db.bloom.stage, stageAdvanced: false, milestone: db.bloom.pendingMilestone };
  }
  db.moments.push(moment);
  const r = applyCareMoment(db.bloom, moment.localDate);
  db.bloom = r.state;
  return { recorded: true, duplicate: false, stage: r.state.stage, stageAdvanced: r.stageAdvanced, milestone: r.state.pendingMilestone };
}

// Serialize local writes so concurrent acts of care cannot overwrite each other.
let writes: Promise<unknown> = Promise.resolve();
function queued<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  return (...args: A): Promise<R> => {
    const next = writes.then(() => fn(...args));
    writes = next.catch(() => {});
    return next;
  };
}
export const localApi: BloomeApi = {
  ...localImplementation,
  completeOnboarding: queued(localImplementation.completeOnboarding),
  recordCareMoment: queued(localImplementation.recordCareMoment),
  setDayMode: queued(localImplementation.setDayMode),
  ackMilestone: queued(localImplementation.ackMilestone),
  submitCheckIn: queued(localImplementation.submitCheckIn),
  chooseRest: queued(localImplementation.chooseRest),
  setConsent: queued(localImplementation.setConsent),
  deleteAccount: queued(localImplementation.deleteAccount),
};

// ---------------------------------------------------------------------------
// Supabase: the Bloom logic runs in the database (see supabase/migrations).
// ---------------------------------------------------------------------------
function sb() {
  const client = getSupabase();
  if (!client) throw new Error('supabase_not_configured');
  return client;
}

function toCareResult(d: Record<string, unknown>): CareResult {
  return {
    recorded: Boolean(d.recorded),
    duplicate: Boolean(d.duplicate),
    stage: d.stage as BloomStage,
    stageAdvanced: Boolean(d.stage_advanced),
    milestone: (d.milestone as BloomStage | null) ?? null,
  };
}

export const supabaseApi: BloomeApi = {
  kind: 'supabase',
  async appOpen() {
    const { data, error } = await sb().rpc('app_open');
    if (error) throw error;
    const d = data as Record<string, unknown>;
    return {
      onboarded: Boolean(d.onboarded),
      today: d.today as string | undefined,
      stage: d.stage as BloomStage | undefined,
      milestone: (d.milestone as BloomStage | null) ?? null,
      comeback: Boolean(d.comeback),
      needsDayMode: Boolean(d.needs_day_mode),
      dayMode: (d.day_mode as DayMode) ?? 'standard',
      night: Boolean(d.night),
    };
  },
  async completeOnboarding(p) {
    const { error } = await sb().rpc('complete_onboarding', {
      p: {
        nickname: p.nickname,
        birth_date: p.birthDate,
        time_zone: p.timeZone,
        goal: p.goal,
        pregnant_or_breastfeeding: p.pregnantOrBreastfeeding,
        activity: p.activity,
        frequency: p.frequency,
        wake_time: p.wakeTime,
        shift_work: p.shiftWork,
      },
    });
    if (error) throw new Error(error.message.includes('under_18') ? 'under_18' : error.message);
  },
  async getProfile() {
    const { data, error } = await sb().from('profiles').select('*').maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      nickname: data.nickname,
      birthDate: data.birth_date,
      timeZone: data.time_zone,
      goal: data.goal,
      pregnantOrBreastfeeding: data.pregnant_or_breastfeeding,
      activity: data.activity,
      frequency: data.frequency,
      wakeTime: String(data.wake_time).slice(0, 5),
      shiftWork: data.shift_work,
    };
  },
  async getBloom() {
    const { data, error } = await sb().from('my_bloom').select('*').maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const stage = data.stage as BloomStage;
    const pub = toPublicBloom({ stage, careDaysTotal: 0, lastCareDay: null, stageReachedAt: data.stage_reached_at, pendingMilestone: data.pending_milestone });
    return pub;
  },
  async recordCareMoment(pillar, source = 'manual') {
    const { data, error } = await sb().rpc('record_care_moment', { p_pillar: pillar, p_source: source });
    if (error) throw error;
    return toCareResult(data as Record<string, unknown>);
  },
  async setDayMode(mode) {
    const { error } = await sb().rpc('set_day_mode', { p_mode: mode });
    if (error) throw error;
  },
  async ackMilestone() {
    const { error } = await sb().rpc('ack_milestone');
    if (error) throw error;
  },
  async submitCheckIn(c, { recordMoments }) {
    const { data, error } = await sb().rpc('submit_check_in', {
      p: {
        portion: c.portion ?? null,
        mood: c.mood ?? null,
        eating_reason: c.eatingReason ?? null,
        water_glasses: c.waterGlasses ?? null,
        hard_day: c.hardDay,
        note: c.note ?? null,
        record_moments: recordMoments,
      },
    });
    if (error) throw error;
    const d = data as Record<string, unknown>;
    return {
      recordedPillars: (d.recorded_pillars as Pillar[]) ?? [],
      stageAdvanced: Boolean(d.stage_advanced),
      milestone: (d.milestone as BloomStage | null) ?? null,
    };
  },
  async safetyInputs() {
    const weekAgo = new Date(Date.now() - 7 * DAY_MS).toISOString();
    // hasRapidLoss() looks back 14 days and needs the entry at or before that cutoff.
    const weightsSince = new Date(Date.now() - 28 * DAY_MS).toISOString().slice(0, 10);
    const [checks, weights] = await Promise.all([
      sb().from('check_ins').select('note, portion').gte('created_at', weekAgo).order('created_at', { ascending: false }).limit(200),
      sb().from('weight_entries').select('date, kg').gte('date', weightsSince).order('date', { ascending: true }),
    ]);
    if (checks.error) throw checks.error;
    if (weights.error) throw weights.error;
    const rows = checks.data ?? [];
    return {
      recentNotes: rows.slice(0, 14).map((r) => r.note as string | null).filter((n): n is string => Boolean(n)),
      verySmallPortionsInLast7Days: rows.filter((r) => r.portion === 'very_small').length,
      weights: (weights.data ?? []).map((w) => ({ date: String(w.date), kg: Number(w.kg) })),
    };
  },
  async todayCare() {
    const profile = await supabaseApi.getProfile();
    if (!profile) return { pillars: [], resting: false };
    const today = localDateIn(profile.timeZone);
    const [care, plan] = await Promise.all([
      sb().from('care_moments').select('pillar').eq('local_date', today),
      sb().from('day_plans').select('resting').eq('local_date', today).maybeSingle(),
    ]);
    if (care.error) throw care.error;
    if (plan.error) throw plan.error;
    return { pillars: [...new Set((care.data ?? []).map(m => m.pillar as Pillar))], resting: !!plan.data?.resting };
  },
  async chooseRest() {
    const { data, error } = await sb().rpc('choose_rest');
    if (error) throw error;
    return toCareResult(data as Record<string, unknown>);
  },
  async hasConsent(kind) {
    const { data, error } = await sb().rpc('has_consent', { p_kind: kind });
    if (error) throw error;
    return data === true;
  },
  async setConsent(kind, granted) {
    const { data, error } = await sb().rpc('set_consent', { p_kind: kind, p_granted: granted });
    if (error) throw error;
    return data === true;
  },
  async exportData() {
    const { data, error } = await sb().rpc('export_my_data');
    if (error) throw error;
    return JSON.stringify(data, null, 2);
  },
  async deleteAccount(confirm) {
    if (confirm !== DELETE_CONFIRMATION) throw new Error('confirmation_required');
    const { error } = await sb().functions.invoke('delete-account', { body: { confirm } });
    if (error) throw new Error('delete_failed');
    // The account is gone on the server; drop the local session too.
    await sb().auth.signOut({ scope: 'local' });
  },
  async signOut() {
    const { error } = await sb().auth.signOut();
    if (error) throw error;
  },
};

export type ApiMode = 'supabase' | 'local' | 'misconfigured';

/**
 * Demo mode keeps health data unencrypted on the phone, so it must never switch on by
 * accident. Without Supabase settings, a release build refuses to start instead of
 * silently storing real users' data locally. Demo mode is allowed in development, or
 * when EXPO_PUBLIC_DEMO_MODE=1 is set on purpose.
 */
export function resolveApiMode(o: { hasSupabase: boolean; isDev: boolean; demoFlag: string | undefined }): ApiMode {
  if (o.hasSupabase) return 'supabase';
  if (o.isDev || o.demoFlag === '1') return 'local';
  return 'misconfigured';
}

export function pickApi(): BloomeApi | null {
  const mode = resolveApiMode({
    hasSupabase: getSupabase() !== null,
    isDev: typeof __DEV__ !== 'undefined' && __DEV__,
    demoFlag: process.env.EXPO_PUBLIC_DEMO_MODE,
  });
  return mode === 'supabase' ? supabaseApi : mode === 'local' ? localApi : null;
}
