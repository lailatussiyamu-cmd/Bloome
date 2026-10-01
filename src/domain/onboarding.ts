import type { PlanItem } from './dayMode';

export type Goal = 'energy' | 'eating' | 'weight' | 'routine';
export type Activity = 'none' | 'light' | 'intense' | 'other';
export type Frequency = 'rarely' | 'sometimes' | 'often';

export interface OnboardingAnswers {
  birthDate: string; // YYYY-MM-DD
  goal: Goal;
  pregnantOrBreastfeeding: boolean | null; // null = prefer not to say
  activity: Activity;
  frequency: Frequency;
  wakeTime: string; // HH:MM
  shiftWork: boolean;
}

export interface TrainingProfile {
  key: 'start' | 'strong-inconsistent' | 'returning' | 'building' | 'regular';
  title: string;
  sessionMinutes: number;
  sessionsPerWeek: number;
  intensity: 'gentle' | 'moderate' | 'challenging';
}

/** Captures "strong but not consistent": short sessions, intensity kept. */
export function trainingProfile(a: Pick<OnboardingAnswers, 'activity' | 'frequency'>): TrainingProfile {
  const level = a.activity === 'other' ? 'light' : a.activity;
  if (level === 'none') {
    return { key: 'start', title: 'Mulai dari nol, dan itu indah', sessionMinutes: 5, sessionsPerWeek: 3, intensity: 'gentle' };
  }
  if (a.frequency === 'rarely' && level === 'intense') {
    return { key: 'strong-inconsistent', title: 'Kuat, belum konsisten', sessionMinutes: 15, sessionsPerWeek: 3, intensity: 'challenging' };
  }
  if (a.frequency === 'rarely') {
    return { key: 'returning', title: 'Pernah aktif, siap mekar lagi', sessionMinutes: 10, sessionsPerWeek: 3, intensity: 'gentle' };
  }
  if (a.frequency === 'sometimes') {
    return { key: 'building', title: 'Sedang membangun ritme', sessionMinutes: 15, sessionsPerWeek: 3, intensity: 'moderate' };
  }
  return { key: 'regular', title: 'Sudah rutin', sessionMinutes: 25, sessionsPerWeek: 4, intensity: level === 'intense' ? 'challenging' : 'moderate' };
}

/** Weight-loss goals are switched off during pregnancy or breastfeeding. */
export function effectiveGoal(a: Pick<OnboardingAnswers, 'goal' | 'pregnantOrBreastfeeding'>): Goal {
  return a.goal === 'weight' && a.pregnantOrBreastfeeding === true ? 'energy' : a.goal;
}

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** The full standard-day plan; `planForMode` trims it for smaller days. */
export function standardPlan(a: OnboardingAnswers): PlanItem[] {
  const t = trainingProfile(a);
  const goal = effectiveGoal(a);
  const items: PlanItem[] = [
    { id: 'water-morning', title: 'Minum segelas air', pillar: 'hydrate', time: addMinutes(a.wakeTime, 15), weight: 1 },
    { id: 'breath', title: 'Tarik napas 1 menit', pillar: 'recover', time: addMinutes(a.wakeTime, 30), weight: 1 },
    { id: 'lunch', title: 'Makan siang dengan piring seimbang', pillar: 'nourish', time: '12:30', weight: 2 },
    { id: 'move', title: `Gerak ${t.sessionMinutes} menit`, pillar: 'move', time: '17:30', weight: 3 },
    { id: 'checkin', title: 'Check-in perasaan', pillar: 'mind', time: '21:00', weight: 1 },
  ];
  // Goal decides what comes first.
  const first: Record<Goal, string> = { energy: 'breath', eating: 'lunch', weight: 'lunch', routine: 'move' };
  const lead = items.find((i) => i.id === first[goal]);
  return lead ? [lead, ...items.filter((i) => i !== lead)] : items;
}
