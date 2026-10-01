import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  applyCareMoment,
  initialBloomState,
  toPublicBloom,
  type BloomStage,
  type BloomState,
  type PublicBloom,
} from '../domain/bloom';
import { isDuplicate, localDateIn, type CareMoment, type CareSource, type Pillar } from '../domain/careMoment';
import { isComeback, type DayMode } from '../domain/dayMode';
import { canRegister } from '../domain/safety';
import { effectiveGoal, type OnboardingAnswers } from '../domain/onboarding';
import { getSupabase } from './supabase';

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
  saveCheckIn(c: CheckInInput): Promise<void>;
  recentNotes(): Promise<string[]>;
  todayCare(): Promise<{ pillars: Pillar[]; resting: boolean }>;
  chooseRest(): Promise<void>;
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
    if (!db.profile || !db.bloom) throw new Error('onboarding_required');
    const createdAt = new Date().toISOString();
    const moment: CareMoment = { pillar, source, createdAt, localDate: localDateIn(db.profile.timeZone) };
    if (isDuplicate(moment, db.moments.slice(-20))) {
      return { recorded: false, duplicate: true, stage: db.bloom.stage, stageAdvanced: false, milestone: db.bloom.pendingMilestone };
    }
    db.moments.push(moment);
    const r = applyCareMoment(db.bloom, moment.localDate);
    db.bloom = r.state;
    await save(db);
    return { recorded: true, duplicate: false, stage: r.state.stage, stageAdvanced: r.stageAdvanced, milestone: r.state.pendingMilestone };
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
  async saveCheckIn(c) {
    const db = await load();
    db.checkIns.push({ ...c, at: new Date().toISOString() });
    db.checkIns = db.checkIns.slice(-60);
    await save(db);
  },
  async recentNotes() {
    const db = await load();
    return db.checkIns.filter(c => Date.parse(c.at) >= Date.now() - 7 * 86400000).slice(-14).map((c) => c.note ?? '').filter(Boolean);
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
    db.restDays = { ...db.restDays, [localDateIn(db.profile.timeZone)]: true };
    await save(db);
  },
};

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
  saveCheckIn: queued(localImplementation.saveCheckIn),
  chooseRest: queued(localImplementation.chooseRest),
};

// ---------------------------------------------------------------------------
// Supabase: the Bloom logic runs in the database (see supabase/migrations).
// ---------------------------------------------------------------------------
function sb() {
  const client = getSupabase();
  if (!client) throw new Error('supabase_not_configured');
  return client;
}

async function userId(): Promise<string> {
  const { data } = await sb().auth.getUser();
  if (!data.user) throw new Error('not_signed_in');
  return data.user.id;
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
    const d = data as Record<string, unknown>;
    return {
      recorded: Boolean(d.recorded),
      duplicate: Boolean(d.duplicate),
      stage: d.stage as BloomStage,
      stageAdvanced: Boolean(d.stage_advanced),
      milestone: (d.milestone as BloomStage | null) ?? null,
    };
  },
  async setDayMode(mode) {
    const { error } = await sb().rpc('set_day_mode', { p_mode: mode });
    if (error) throw error;
  },
  async ackMilestone() {
    const { error } = await sb().rpc('ack_milestone');
    if (error) throw error;
  },
  async saveCheckIn(c) {
    const { error } = await sb().from('check_ins').insert({
      user_id: await userId(),
      portion: c.portion,
      mood: c.mood,
      eating_reason: c.eatingReason,
      water_glasses: c.waterGlasses,
      hard_day: c.hardDay,
      note: c.note,
    });
    if (error) throw error;
  },
  async recentNotes() {
    const { data, error } = await sb().from('check_ins').select('note').gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString()).order('created_at', { ascending: false }).limit(14);
    if (error) throw error;
    return (data ?? []).map((r) => r.note as string | null).filter((n): n is string => Boolean(n));
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
    const { error } = await sb().rpc('choose_rest');
    if (error) throw error;
  },
};

export function pickApi(): BloomeApi {
  return getSupabase() ? supabaseApi : localApi;
}
