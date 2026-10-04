import { expect, it, vi } from 'vitest';
import { LOGIN_RETRY, readLoginSession, validatedEmailLink } from './loginFlow';

const auth = (session: object | null, error: unknown = null) => ({
  initialize: vi.fn(async () => ({ error })),
  getSession: vi.fn(async () => ({ data: { session }, error: null })),
});
it('allows normal signed-out visits but reports callbacks missing a session', async () => {
  expect(await readLoginSession(auth(null))).toBeNull();
  await expect(readLoginSession(auth(null), true)).rejects.toThrow(LOGIN_RETRY);
});
it('does not expose credentials from an initialization failure', async () => {
  await expect(readLoginSession(auth(null, new Error('private-token')))).rejects.toThrow(LOGIN_RETRY);
});
it('keeps a valid session even when a reused email link failed', async () => {
  const session = { user: 'test' };
  expect(await readLoginSession(auth(session, new Error('expired')), true)).toBe(session);
});
it('waits for the callback exchange before checking the session', async () => {
  let finish!: () => void;
  const client = auth({ user: 'test' });
  client.initialize.mockImplementation(() => new Promise(resolve => { finish = () => resolve({ error: null }); }));
  const pending = readLoginSession(client, true);
  expect(client.getSession).not.toHaveBeenCalled();
  finish(); await pending;
  expect(client.getSession).toHaveBeenCalledOnce();
});
const project = 'https://example.supabase.co';
const origin = 'http://localhost:8081';
it('opens only the configured project and forces the local callback', () => {
  const result = new URL(validatedEmailLink(`${project}/auth/v1/verify?token=test&type=magiclink&redirect_to=https://evil.test&extra=secret`, project, origin));
  expect(result.searchParams.get('redirect_to')).toBe(origin + '/');
  expect(result.searchParams.has('extra')).toBe(false);
});
it.each([
  'javascript:alert(1)',
  'https://evil.test/auth/v1/verify?token=test&type=magiclink',
  `${project}/auth/v1/verify?token=test&type=recovery`,
  `${project}/auth/v1/verify?type=magiclink`,
  'https://user:pass@example.supabase.co/auth/v1/verify?token=test&type=magiclink',
])('rejects unrelated or unsafe links: %s', input => {
  expect(() => validatedEmailLink(input, project, origin)).toThrow();
});
