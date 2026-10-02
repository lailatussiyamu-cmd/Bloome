/**
 * Living Bloom — growth rules.
 *
 * Growth comes from accumulated "care days" (days with at least one Care Moment),
 * never from weight. Stages only move forward. The count itself is internal:
 * the UI receives a stage, never the number.
 */

export const STAGES = ['seed', 'sprout', 'leaves', 'bud', 'bloom', 'flourish'] as const;
export type BloomStage = (typeof STAGES)[number];

/** Minimum care days to reach each stage. Keep in sync with supabase migration `bloom_stage_for`. */
export const STAGE_THRESHOLDS: Record<BloomStage, number> = {
  seed: 0,
  sprout: 1,
  leaves: 5,
  bud: 12,
  bloom: 25,
  flourish: 45,
};

export const STAGE_COPY: Record<BloomStage, { name: string; line: string }> = {
  seed: { name: 'Benih', line: 'Awal. Kamu di sini, dan itu cukup.' },
  sprout: { name: 'Tunas', line: 'Langkah pertama merawat diri.' },
  leaves: { name: 'Daun', line: 'Merawat diri mulai jadi kebiasaan.' },
  bud: { name: 'Kuncup', line: 'Kamu makin sering hadir untuk dirimu.' },
  bloom: { name: 'Mekar', line: 'Kepedulianmu yang konsisten berdampak.' },
  flourish: { name: 'Rimbun', line: 'Kamu terus memilih dirimu, dan itu terlihat.' },
};

export function stageRank(stage: BloomStage): number {
  return STAGES.indexOf(stage);
}

export function stageForCareDays(careDays: number): BloomStage {
  const days = Number.isFinite(careDays) && careDays > 0 ? Math.floor(careDays) : 0;
  let result: BloomStage = 'seed';
  for (const stage of STAGES) {
    if (days >= STAGE_THRESHOLDS[stage]) result = stage;
  }
  return result;
}

/** Internal state. `careDaysTotal` must never be sent to the UI. */
export interface BloomState {
  stage: BloomStage;
  careDaysTotal: number;
  lastCareDay: string | null; // YYYY-MM-DD in the user's local time zone
  stageReachedAt: Partial<Record<BloomStage, string>>;
  pendingMilestone: BloomStage | null;
}

export function initialBloomState(signupLocalDate: string): BloomState {
  return {
    stage: 'seed',
    careDaysTotal: 0,
    lastCareDay: null,
    stageReachedAt: { seed: signupLocalDate },
    pendingMilestone: null,
  };
}

export interface CareDayResult {
  state: BloomState;
  countedAsNewCareDay: boolean;
  stageAdvanced: boolean;
}

/**
 * Apply a completed Care Moment on `localDate`.
 * - Only the first moment of a local day adds a care day.
 * - The stage can only rise, at most one step per day.
 * - Nothing here can ever lower the stage or the count.
 */
export function applyCareMoment(prev: BloomState, localDate: string): CareDayResult {
  if (prev.lastCareDay !== null && localDate <= prev.lastCareDay) {
    // Same day (or a late-synced older day): no growth, and never a rewind.
    return { state: prev, countedAsNewCareDay: false, stageAdvanced: false };
  }
  const careDaysTotal = prev.careDaysTotal + 1;
  const target = stageForCareDays(careDaysTotal);
  const canAdvance = stageRank(target) > stageRank(prev.stage);
  const nextStage = canAdvance ? STAGES[stageRank(prev.stage) + 1] : prev.stage;
  const state: BloomState = {
    ...prev,
    careDaysTotal,
    lastCareDay: localDate,
    stage: nextStage,
    stageReachedAt: canAdvance ? { ...prev.stageReachedAt, [nextStage]: localDate } : prev.stageReachedAt,
    pendingMilestone: canAdvance ? nextStage : prev.pendingMilestone,
  };
  return { state, countedAsNewCareDay: true, stageAdvanced: canAdvance };
}

/**
 * The user changed time zone. Re-read the last care day in the new zone so that a
 * west-to-east jump cannot turn "the same moment" into a new calendar day.
 * Forward only: `lastCareDay` never moves back and nothing else changes.
 * Mirrors the time-zone branch of `_complete_onboarding` in the migrations.
 */
export function rebaseForTimeZone(
  prev: BloomState,
  latestMomentAt: string | null,
  toLocalDate: (at: Date) => string,
): BloomState {
  if (prev.lastCareDay === null || latestMomentAt === null) return prev;
  const reread = toLocalDate(new Date(latestMomentAt));
  return reread > prev.lastCareDay ? { ...prev, lastCareDay: reread } : prev;
}

/** What the UI is allowed to see. */
export interface PublicBloom {
  stage: BloomStage;
  name: string;
  line: string;
  stageReachedAt: Partial<Record<BloomStage, string>>;
  pendingMilestone: BloomStage | null;
}

export function toPublicBloom(state: BloomState): PublicBloom {
  return {
    stage: state.stage,
    name: STAGE_COPY[state.stage].name,
    line: STAGE_COPY[state.stage].line,
    stageReachedAt: { ...state.stageReachedAt },
    pendingMilestone: state.pendingMilestone,
  };
}
