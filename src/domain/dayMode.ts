export const DAY_MODES = ['standard', 'minimum', 'recovery', 'lifeHappens'] as const;
export type DayMode = (typeof DAY_MODES)[number];

export interface DayModeRules {
  label: string;
  sub: string;
  maxPlanItems: number;
  maxReminders: number;
  movementTargets: boolean;
  timedReminders: boolean;
  bloomTitle: string;
  bloomText: string;
}

export const DAY_MODE_RULES: Record<DayMode, DayModeRules> = {
  standard: {
    label: 'Hari biasa',
    sub: 'Ritme seimbang',
    maxPlanItems: 4,
    maxReminders: 4,
    movementTargets: true,
    timedReminders: true,
    bloomTitle: 'Tenang dan membumi.',
    bloomText: 'Bloom-mu bernapas pelan bersamamu.',
  },
  minimum: {
    label: 'Seadanya dulu',
    sub: 'Yang paling penting saja',
    maxPlanItems: 2,
    maxReminders: 1,
    movementTargets: false,
    timedReminders: true,
    bloomTitle: 'Lebih lembut, lebih pelan.',
    bloomText: 'Hari minimum tetap hari merawat diri. Bloom-mu tidak berkurang sedikit pun.',
  },
  recovery: {
    label: 'Sedang pulih',
    sub: 'Habis sakit atau shift',
    maxPlanItems: 2,
    maxReminders: 1,
    movementTargets: false,
    timedReminders: true,
    bloomTitle: 'Hangat dan beristirahat.',
    bloomText: 'Pulih juga cara merawat diri. Tidak ada target gerak hari ini.',
  },
  lifeHappens: {
    label: 'Hidup lagi ramai',
    sub: 'Acara, perjalanan, keluarga',
    maxPlanItems: 1,
    maxReminders: 0,
    movementTargets: false,
    timedReminders: false,
    bloomTitle: 'Hidup sedang penuh.',
    bloomText: 'Bloom-mu menunggu dengan sabar. Satu momen kecil sudah cukup.',
  },
};

export interface PlanItem {
  id: string;
  title: string;
  pillar: 'nourish' | 'hydrate' | 'move' | 'recover' | 'mind';
  time?: string; // HH:MM, only when timed reminders are allowed
  weight: number; // lower = lighter; used to pick items on small days
}

/** Trim a full plan to what the day mode allows, lightest items first on small days. */
export function planForMode(full: PlanItem[], mode: DayMode): PlanItem[] {
  const rules = DAY_MODE_RULES[mode];
  let items = full.filter((i) => rules.movementTargets || i.pillar !== 'move');
  if (mode !== 'standard') items = [...items].sort((a, b) => a.weight - b.weight);
  items = items.slice(0, rules.maxPlanItems);
  return rules.timedReminders ? items : items.map(({ time: _drop, ...rest }) => rest);
}

/** Days without any Care Moment before Comeback mode is shown. */
export const COMEBACK_AFTER_DAYS = 4;

export function daysBetween(fromLocalDate: string, toLocalDate: string): number {
  const a = Date.parse(`${fromLocalDate}T00:00:00Z`);
  const b = Date.parse(`${toLocalDate}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function isComeback(lastCareDay: string | null, today: string): boolean {
  if (lastCareDay === null) return false;
  return daysBetween(lastCareDay, today) > COMEBACK_AFTER_DAYS;
}

/** Training intensity after a comeback: 70% of the last level, +10% per week, capped at 100%. */
export function comebackIntensity(weeksSinceReturn: number): number {
  const weeks = Math.max(0, Math.floor(weeksSinceReturn));
  return Math.min(1, 0.7 + 0.1 * weeks);
}

/** Bloom shows the resting state when the user chose rest, or at night (22:00–05:00). */
export function isRestingTime(localHour: number, choseRestToday: boolean): boolean {
  return choseRestToday || localHour >= 22 || localHour < 5;
}
