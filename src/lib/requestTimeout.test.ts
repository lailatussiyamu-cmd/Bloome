import { afterEach, expect, it, vi } from 'vitest';
import { timedFetch, withDeadline } from './requestTimeout';
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('releases a stalled operation and clears its timer', async () => {
  vi.useFakeTimers();
  const result = expect(withDeadline(new Promise(() => {}), 25)).rejects.toThrow('request_timeout');
  await vi.advanceTimersByTimeAsync(25); await result;
  expect(vi.getTimerCount()).toBe(0);
});
it('returns successful results without leaving a timer', async () => {
  vi.useFakeTimers(); expect(await withDeadline(Promise.resolve('ok'))).toBe('ok');
  expect(vi.getTimerCount()).toBe(0);
});
it('aborts the underlying stalled fetch', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn((_input, init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('aborted')));
  })));
  const result = expect(timedFetch('https://example.test')).rejects.toThrow('aborted');
  await vi.advanceTimersByTimeAsync(20000); await result;
  expect(vi.getTimerCount()).toBe(0);
});
