export const PILLARS = ['nourish', 'hydrate', 'move', 'recover', 'mind'] as const;
export type Pillar = (typeof PILLARS)[number];

export const PILLAR_COPY: Record<Pillar, string> = {
  nourish: 'Nutrisi',
  hydrate: 'Air',
  move: 'Gerak',
  recover: 'Pulih',
  mind: 'Pikiran',
};

export type CareSource = 'manual' | 'health' | 'gps' | 'ai';

export interface CareMoment {
  pillar: Pillar;
  source: CareSource;
  createdAt: string; // ISO timestamp
  localDate: string; // YYYY-MM-DD in the user's zone
}

/** Re-logging the same pillar within this window is treated as a duplicate. */
export const DUPLICATE_WINDOW_MINUTES = 30;

export function isDuplicate(candidate: CareMoment, recent: CareMoment[]): boolean {
  const t = Date.parse(candidate.createdAt);
  return recent.some(
    (m) =>
      m.pillar === candidate.pillar &&
      Math.abs(t - Date.parse(m.createdAt)) < DUPLICATE_WINDOW_MINUTES * 60_000,
  );
}

/** Gentle thresholds for turning health data into a Care Moment. */
export const AUTO_THRESHOLDS = {
  steps: 2000,
  activeMinutes: 5,
  sleepHours: 6,
} as const;

export interface HealthDay {
  steps?: number;
  activeMinutes?: number;
  sleepHours?: number;
}

export function autoCareMoments(day: HealthDay): Pillar[] {
  const out: Pillar[] = [];
  if ((day.steps ?? 0) >= AUTO_THRESHOLDS.steps || (day.activeMinutes ?? 0) >= AUTO_THRESHOLDS.activeMinutes) {
    out.push('move');
  }
  if ((day.sleepHours ?? 0) >= AUTO_THRESHOLDS.sleepHours) out.push('recover');
  return out;
}

/** Local calendar date (YYYY-MM-DD) of an instant in an IANA time zone. */
export function localDateIn(timeZone: string, at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
