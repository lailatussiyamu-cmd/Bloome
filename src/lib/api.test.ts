import { beforeEach, describe, expect, it, vi } from 'vitest';
import { localApi, resolveApiMode, type Profile } from './api';
import { canRegister, isValidDate } from '../domain/safety';
const memory = vi.hoisted(() => new Map<string, string>());
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async (key: string) => memory.get(key) ?? null, setItem: async (key: string, value: string) => { memory.set(key, value); } } }));
vi.mock('./supabase', () => ({ getSupabase: () => null }));
const profile: Profile = { nickname: 'Demo', birthDate: '1990-01-01', timeZone: 'Asia/Jakarta', goal: 'energy', pregnantOrBreastfeeding: false, activity: 'none', frequency: 'rarely', wakeTime: '06:00', shiftWork: false };
beforeEach(() => { memory.clear(); vi.useRealTimers(); });
describe('persisted care', () => {
  it('serializes concurrent writes and persists care and rest across reads', async () => {
    await localApi.completeOnboarding(profile);
    await Promise.all([localApi.recordCareMoment('hydrate'), localApi.recordCareMoment('mind'), localApi.chooseRest(), localApi.setDayMode('minimum')]);
    expect(await localApi.todayCare()).toEqual({ pillars: ['hydrate', 'mind'], resting: true });
    expect((await localApi.appOpen()).dayMode).toBe('minimum');
    expect((await localApi.getBloom())?.stage).toBe('sprout');
  });
  it('clears daily completion on a new day without reducing Bloom progress', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
    await localApi.completeOnboarding(profile); await localApi.recordCareMoment('hydrate'); await localApi.chooseRest();
    vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));
    expect(await localApi.todayCare()).toEqual({ pillars: [], resting: false });
    expect((await localApi.getBloom())?.stage).toBe('sprout');
  });
  it('rejects invalid dates and clock values', async () => {
    expect(isValidDate('1990-02-31')).toBe(false); expect(isValidDate('2000-02-29')).toBe(true);
    expect(canRegister('1990-02-31', '2026-10-01')).toBe(false);
    await expect(localApi.completeOnboarding({ ...profile, wakeTime: '99:99' })).rejects.toThrow('invalid_profile');
    // A rejected write must not poison the queue.
    await expect(localApi.completeOnboarding(profile)).resolves.toBeUndefined();
  });
});

describe('time zone change in demo mode', () => {
  it('cannot add a second care day by jumping west to east', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-01T02:00:00Z'));
    await localApi.completeOnboarding({ ...profile, timeZone: 'Pacific/Pago_Pago' });
    await localApi.recordCareMoment('hydrate');
    vi.setSystemTime(new Date('2026-10-01T02:40:00Z'));
    await localApi.completeOnboarding({ ...profile, timeZone: 'Pacific/Kiritimati' });
    const r = await localApi.recordCareMoment('mind');
    expect(r).toMatchObject({ recorded: true, stageAdvanced: false });
    vi.setSystemTime(new Date('2026-10-01T12:00:00Z')); // a real new day in Kiritimati
    expect(await localApi.recordCareMoment('nourish')).toMatchObject({ recorded: true });
  });
});

describe('safety inputs', () => {
  it('counts very small portions in the last 7 days and keeps recent notes', async () => {
    await localApi.completeOnboarding(profile);
    for (let i = 0; i < 4; i++) await localApi.saveCheckIn({ portion: 'very_small', hardDay: false });
    await localApi.saveCheckIn({ portion: 'medium', hardDay: false, note: 'capek' });
    expect(await localApi.safetyInputs()).toEqual({ recentNotes: ['capek'], verySmallPortionsInLast7Days: 4, weights: [] });
  });
});

describe('api mode', () => {
  it('never falls back to on-device storage in a release build by accident', () => {
    expect(resolveApiMode({ hasSupabase: true, isDev: false, demoFlag: undefined })).toBe('supabase');
    expect(resolveApiMode({ hasSupabase: false, isDev: true, demoFlag: undefined })).toBe('local');
    expect(resolveApiMode({ hasSupabase: false, isDev: false, demoFlag: '1' })).toBe('local');
    expect(resolveApiMode({ hasSupabase: false, isDev: false, demoFlag: undefined })).toBe('misconfigured');
    expect(resolveApiMode({ hasSupabase: false, isDev: false, demoFlag: 'true' })).toBe('misconfigured');
  });
});
