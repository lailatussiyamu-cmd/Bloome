import { describe, expect, it } from 'vitest';
import { applyCareMoment, initialBloomState, rebaseForTimeZone, stageForCareDays, toPublicBloom, STAGES, stageRank } from '../bloom';
import { autoCareMoments, isDuplicate, localDateIn } from '../careMoment';
import { comebackIntensity, isComeback, isRestingTime, planForMode } from '../dayMode';
import { canRegister, checkWeightTarget, evaluateSafety, hasDistressSignal, hasRapidLoss, minSafeTargetKg } from '../safety';
import { effectiveGoal, standardPlan, trainingProfile, type OnboardingAnswers } from '../onboarding';

const day = (n: number) => new Date(Date.UTC(2026, 9, 1) + n * 86_400_000).toISOString().slice(0, 10);

describe('bloom growth', () => {
  it('maps care days to stages at 1/5/12/25/45', () => {
    expect(stageForCareDays(0)).toBe('seed');
    expect(stageForCareDays(1)).toBe('sprout');
    expect(stageForCareDays(4)).toBe('sprout');
    expect(stageForCareDays(5)).toBe('leaves');
    expect(stageForCareDays(12)).toBe('bud');
    expect(stageForCareDays(25)).toBe('bloom');
    expect(stageForCareDays(45)).toBe('flourish');
    expect(stageForCareDays(500)).toBe('flourish');
    expect(stageForCareDays(-3)).toBe('seed');
  });

  it('counts only the first Care Moment of a local day', () => {
    let s = initialBloomState(day(0));
    s = applyCareMoment(s, day(0)).state;
    const again = applyCareMoment(s, day(0));
    expect(again.countedAsNewCareDay).toBe(false);
    expect(again.state.careDaysTotal).toBe(1);
  });

  it('never goes backwards, whatever order days arrive in', () => {
    let s = initialBloomState(day(0));
    for (let i = 0; i < 30; i++) s = applyCareMoment(s, day(i * 3)).state; // gaps of 2 days
    const before = { stage: s.stage, total: s.careDaysTotal };
    const late = applyCareMoment(s, day(1)); // an older day synced late
    expect(late.state.careDaysTotal).toBe(before.total);
    expect(stageRank(late.state.stage)).toBeGreaterThanOrEqual(stageRank(before.stage as typeof s.stage));
  });

  it('missed days change nothing and there is no streak', () => {
    let s = initialBloomState(day(0));
    for (let i = 0; i < 5; i++) s = applyCareMoment(s, day(i)).state;
    expect(s.stage).toBe('leaves');
    const afterGap = applyCareMoment(s, day(60)).state;
    expect(afterGap.stage).toBe('leaves');
    expect(afterGap.careDaysTotal).toBe(6);
  });

  it('raises a milestone exactly when a stage is reached', () => {
    let s = initialBloomState(day(0));
    const milestones: string[] = [];
    for (let i = 0; i < 45; i++) {
      const r = applyCareMoment(s, day(i));
      if (r.stageAdvanced) milestones.push(r.state.stage);
      s = { ...r.state, pendingMilestone: null };
    }
    expect(milestones).toEqual(STAGES.slice(1));
  });

  it('public view never exposes the care-day count', () => {
    let s = initialBloomState(day(0));
    s = applyCareMoment(s, day(0)).state;
    const pub = toPublicBloom(s) as unknown as Record<string, unknown>;
    expect(Object.keys(pub)).not.toContain('careDaysTotal');
    expect(JSON.stringify(pub)).not.toMatch(/careDays/);
  });
});

describe('care moments', () => {
  it('treats the same pillar within 30 minutes as a duplicate', () => {
    const a = { pillar: 'hydrate' as const, source: 'manual' as const, createdAt: '2026-10-01T01:00:00Z', localDate: day(0) };
    expect(isDuplicate({ ...a, createdAt: '2026-10-01T01:20:00Z' }, [a])).toBe(true);
    expect(isDuplicate({ ...a, createdAt: '2026-10-01T01:40:00Z' }, [a])).toBe(false);
    expect(isDuplicate({ ...a, pillar: 'move', createdAt: '2026-10-01T01:05:00Z' }, [a])).toBe(false);
  });

  it('turns health data into moments only past gentle thresholds', () => {
    expect(autoCareMoments({ steps: 1999, sleepHours: 5.9 })).toEqual([]);
    expect(autoCareMoments({ steps: 2000, sleepHours: 6 })).toEqual(['move', 'recover']);
    expect(autoCareMoments({ activeMinutes: 5 })).toEqual(['move']);
  });

  it('uses the user local date, not UTC', () => {
    // 23:30 UTC on Sep 30 is already Oct 1 in Jakarta.
    expect(localDateIn('Asia/Jakarta', new Date('2026-09-30T23:30:00Z'))).toBe('2026-10-01');
    expect(localDateIn('UTC', new Date('2026-09-30T23:30:00Z'))).toBe('2026-09-30');
  });
});

describe('day modes and comeback', () => {
  const answers: OnboardingAnswers = {
    birthDate: '1990-05-01', goal: 'energy', pregnantOrBreastfeeding: false,
    activity: 'intense', frequency: 'rarely', wakeTime: '05:30', shiftWork: true,
  };
  const full = standardPlan(answers);

  it('minimum day keeps at most two of the lightest items, no movement', () => {
    const p = planForMode(full, 'minimum');
    expect(p).toHaveLength(2);
    expect(p.every((i) => i.pillar !== 'move')).toBe(true);
    expect(p.every((i) => i.weight === 1)).toBe(true);
  });

  it('life-happens day has one item and no fixed times', () => {
    const p = planForMode(full, 'lifeHappens');
    expect(p).toHaveLength(1);
    expect(p[0].time).toBeUndefined();
  });

  it('standard day keeps movement', () => {
    expect(planForMode(full, 'standard').some((i) => i.pillar === 'move')).toBe(true);
  });

  it('comeback starts after four full days without care', () => {
    expect(isComeback('2026-09-27', '2026-10-01')).toBe(false); // 3 empty days
    expect(isComeback('2026-09-26', '2026-10-01')).toBe(true); // 4 empty days
    expect(isComeback(null, '2026-10-01')).toBe(false);
  });

  it('comeback intensity starts at 70% and rises 10% a week', () => {
    expect(comebackIntensity(0)).toBeCloseTo(0.7);
    expect(comebackIntensity(2)).toBeCloseTo(0.9);
    expect(comebackIntensity(9)).toBe(1);
  });

  it('resting at night or when rest was chosen', () => {
    expect(isRestingTime(23, false)).toBe(true);
    expect(isRestingTime(4, false)).toBe(true);
    expect(isRestingTime(14, false)).toBe(false);
    expect(isRestingTime(14, true)).toBe(true);
  });
});

describe('onboarding', () => {
  it('recognises strong but inconsistent users', () => {
    expect(trainingProfile({ activity: 'intense', frequency: 'rarely' }).key).toBe('strong-inconsistent');
    expect(trainingProfile({ activity: 'none', frequency: 'often' }).key).toBe('start');
  });

  it('switches off weight goals during pregnancy or breastfeeding', () => {
    expect(effectiveGoal({ goal: 'weight', pregnantOrBreastfeeding: true })).toBe('energy');
    expect(effectiveGoal({ goal: 'weight', pregnantOrBreastfeeding: null })).toBe('weight');
  });
});

describe('safety', () => {
  it('blocks under-18 sign-up', () => {
    expect(canRegister('2008-10-02', '2026-10-01')).toBe(false);
    expect(canRegister('2008-10-01', '2026-10-01')).toBe(true);
  });

  it('refuses targets below BMI 18.5 and during pregnancy', () => {
    expect(minSafeTargetKg(160)).toBe(47.4);
    expect(checkWeightTarget(45, 160, false)).toMatchObject({ ok: false, reason: 'below_safe_bmi' });
    expect(checkWeightTarget(55, 160, false)).toEqual({ ok: true });
    expect(checkWeightTarget(55, 160, true)).toMatchObject({ ok: false, reason: 'pregnant_or_breastfeeding' });
  });

  it('detects rapid loss over two weeks', () => {
    const w = [
      { date: '2026-09-17', kg: 70 },
      { date: '2026-09-24', kg: 68 },
      { date: '2026-10-01', kg: 66.2 },
    ];
    expect(hasRapidLoss(w, '2026-10-01')).toBe(true);
    expect(hasRapidLoss([{ date: '2026-09-17', kg: 70 }, { date: '2026-09-24', kg: 69.4 }, { date: '2026-10-01', kg: 68.9 }], '2026-10-01')).toBe(false);
  });

  it('flags distress phrases and pauses nudges', () => {
    expect(hasDistressSignal('habis makan aku muntahkan lagi')).toBe(true);
    expect(hasDistressSignal('aku takut makan')).toBe(true);
    expect(hasDistressSignal('makan siang enak banget')).toBe(false);
    const s = evaluateSafety({ recentTexts: ['aku benci badanku'], weights: [], today: '2026-10-01', verySmallPortionsInLast7Days: 0 });
    expect(s).toEqual({ pauseNudges: true, offerProfessionalHelp: true });
  });
});

describe('time zone rebase', () => {
  it('moves the last care day forward only, never back', () => {
    const s = { ...initialBloomState('2026-09-30'), careDaysTotal: 1, lastCareDay: '2026-09-30', stage: 'sprout' as const };
    const east = rebaseForTimeZone(s, '2026-10-01T02:00:00Z', (at) => localDateIn('Pacific/Kiritimati', at));
    expect(east).toMatchObject({ lastCareDay: '2026-10-01', careDaysTotal: 1, stage: 'sprout' });
    const west = rebaseForTimeZone(east, '2026-10-01T02:00:00Z', (at) => localDateIn('Pacific/Pago_Pago', at));
    expect(west.lastCareDay).toBe('2026-10-01');
    expect(rebaseForTimeZone(initialBloomState('2026-10-01'), null, () => '2030-01-01').lastCareDay).toBeNull();
  });
});
