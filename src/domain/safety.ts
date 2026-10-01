/**
 * Hard safety limits. These cannot be switched off by the user.
 * Wording and thresholds must be reviewed by a dietitian and a psychologist before release.
 */

import { urgentSignal } from './assistant';
export const MIN_AGE = 18;
export const MIN_TARGET_BMI = 18.5;
export const MAX_SUGGESTED_LOSS_KG_PER_WEEK = 1;
/** Loss faster than this, sustained for two weeks, pauses nudges. */
export const RAPID_LOSS_KG_PER_WEEK = 1.5;

export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

export function canRegister(birthDate: string, today: string): boolean {
  return isValidDate(birthDate) && birthDate <= today && ageOn(birthDate, today) >= MIN_AGE;
}

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export function minSafeTargetKg(heightCm: number): number {
  const m = heightCm / 100;
  return Math.ceil(MIN_TARGET_BMI * m * m * 10) / 10;
}

export type TargetCheck =
  | { ok: true }
  | { ok: false; reason: 'pregnant_or_breastfeeding' | 'below_safe_bmi'; suggestion: string };

export function checkWeightTarget(
  targetKg: number,
  heightCm: number,
  pregnantOrBreastfeeding: boolean,
): TargetCheck {
  if (pregnantOrBreastfeeding) {
    return {
      ok: false,
      reason: 'pregnant_or_breastfeeding',
      suggestion: 'Selama hamil atau menyusui, kita fokus ke energi, tidur, dan makan yang cukup dulu.',
    };
  }
  if (targetKg < minSafeTargetKg(heightCm)) {
    return {
      ok: false,
      reason: 'below_safe_bmi',
      suggestion: 'Target ini di bawah batas aman. Bagaimana kalau tujuannya lebih bertenaga atau lebih rutin bergerak?',
    };
  }
  return { ok: true };
}

export interface WeightEntry {
  date: string; // YYYY-MM-DD
  kg: number;
}

/** True when weight fell faster than RAPID_LOSS_KG_PER_WEEK in each of the last two weeks. */
export function hasRapidLoss(entries: WeightEntry[], today: string): boolean {
  const byDate = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const at = (daysAgo: number) => {
    const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - daysAgo * 86_400_000).toISOString().slice(0, 10);
    const before = byDate.filter((e) => e.date <= cutoff);
    return before.length ? before[before.length - 1].kg : undefined;
  };
  const now = at(0);
  const week1 = at(7);
  const week2 = at(14);
  if (now === undefined || week1 === undefined || week2 === undefined) return false;
  return week2 - week1 > RAPID_LOSS_KG_PER_WEEK && week1 - now > RAPID_LOSS_KG_PER_WEEK;
}

/**
 * Phrases that signal possible disordered eating or acute distress.
 * A first pass only: the AI companion must also classify, and a clinician must review this list.
 */
const SIGNAL_PATTERNS: RegExp[] = [
  /\bmuntah(kan)?\b.*\b(habis|setelah)\s+makan\b/i,
  /\b(habis|setelah)\s+makan\b.*\bmuntah(kan)?\b/i,
  /\b(sengaja|harus)\s+muntah\b/i,
  /\bmakan\s+(banyak|berlebihan).*\b(gak|nggak|tidak)\s+bisa\s+berhenti\b/i,
  /\btakut\s+makan\b/i,
  /\b(gak|nggak|tidak)\s+makan\s+(seharian|berhari-hari)\b/i,
  /\bbenci\s+(badan|tubuh)(ku)?\b/i,
  /\bpencahar\b/i,
];

export function hasDistressSignal(text: string): boolean {
  return urgentSignal(text) || SIGNAL_PATTERNS.some((re) => re.test(text));
}

export interface SafetyState {
  pauseNudges: boolean;
  offerProfessionalHelp: boolean;
}

export function evaluateSafety(input: {
  recentTexts: string[];
  weights: WeightEntry[];
  today: string;
  verySmallPortionsInLast7Days: number;
}): SafetyState {
  const textSignal = input.recentTexts.some(hasDistressSignal);
  const rapid = hasRapidLoss(input.weights, input.today);
  const smallPortions = input.verySmallPortionsInLast7Days >= 4;
  const flagged = textSignal || rapid || smallPortions;
  return { pauseNudges: flagged, offerProfessionalHelp: flagged };
}
