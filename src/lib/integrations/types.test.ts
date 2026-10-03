import { expect, it } from 'vitest';
import { todayRange, validSteps } from './types';
it('does not turn missing, invalid, or negative health data into zero', () => {
  for (const value of [null, undefined, NaN, Infinity, -1, '12']) expect(validSteps(value)).toBeNull();
  expect(validSteps(0)).toBe(0);
  expect(validSteps(1234)).toBe(1234);
});
it('queries from local midnight to the current instant', () => {
  const now = new Date(2026, 9, 2, 14, 30);
  const range = todayRange(now);
  expect(range.start.getHours()).toBe(0);
  expect(range.start.getDate()).toBe(now.getDate());
  expect(range.end).toEqual(now);
  expect(now.getHours()).toBe(14);
});
