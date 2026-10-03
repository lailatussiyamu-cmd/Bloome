export interface StepsSummary { steps: number | null; source: string; checkedAt: string }

export function todayRange(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return { start, end: now };
}

export function validSteps(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}
