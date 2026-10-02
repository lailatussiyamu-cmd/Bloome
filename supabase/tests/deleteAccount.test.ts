import { describe, expect, it, vi } from 'vitest';
import { createDeleteAccountHandler, type Fetch } from '../functions/_shared/deleteAccountHandler.ts';

const config = { supabaseUrl: 'https://example.supabase.co', anonKey: 'public-key', serviceRoleKey: 'service-secret' };
const USER = '11111111-1111-1111-1111-111111111111';
const ok = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const req = (body: unknown, auth = 'Bearer user-token') => new Request('https://fn.test', { method: 'POST', headers: auth ? { Authorization: auth } : {}, body: JSON.stringify(body) });
const mock = (o: { auth?: number; del?: number } = {}) => vi.fn<Fetch>(async (url) =>
  String(url).endsWith('/auth/v1/user') ? ok({ id: USER }, o.auth ?? 200) : ok({}, o.del ?? 200));

describe('delete-account', () => {
  it('requires a signed-in user and the typed confirmation', async () => {
    const f = mock();
    expect((await createDeleteAccountHandler(config, f)(req({ confirm: 'HAPUS' }, ''))).status).toBe(401);
    expect((await createDeleteAccountHandler(config, f)(req({ confirm: 'hapus' }))).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  it('deletes only the caller, identified by their token, using the server key upstream only', async () => {
    const f = mock();
    const res = await createDeleteAccountHandler(config, f)(req({ confirm: 'HAPUS', user_id: 'someone-else' }));
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain('service-secret');
    const [url, init] = f.mock.calls[1];
    expect(url).toBe(`https://example.supabase.co/auth/v1/admin/users/${USER}`);
    expect(init?.method).toBe('DELETE');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer service-secret');
    expect((f.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe('Bearer user-token');
  });

  it('rejects expired tokens and reports upstream failures', async () => {
    expect((await createDeleteAccountHandler(config, mock({ auth: 401 }))(req({ confirm: 'HAPUS' }))).status).toBe(401);
    expect((await createDeleteAccountHandler(config, mock({ del: 500 }))(req({ confirm: 'HAPUS' }))).status).toBe(503);
    expect((await createDeleteAccountHandler(config, mock({ del: 404 }))(req({ confirm: 'HAPUS' }))).status).toBe(200);
  });
});

it('stops oversized chunked bodies before calling authentication or deletion', async () => {
  const f = mock();
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(700));
      controller.enqueue(new Uint8Array(400));
    },
    cancel,
  });
  const request = new Request('https://fn.test', {
    method: 'POST', headers: { Authorization: 'Bearer user-token' }, body: stream,
    duplex: 'half',
  } as RequestInit);
  const result = await createDeleteAccountHandler(config, f)(request);
  expect(result.status).toBe(413);
  expect(cancel).toHaveBeenCalledOnce();
  expect(f).not.toHaveBeenCalled();
});

it('measures request limits in bytes and rejects malformed JSON without upstream calls', async () => {
  const f = mock();
  const handler = createDeleteAccountHandler(config, f);
  expect((await handler(req({ confirm: 'HAPUS', extra: '🌿'.repeat(300) }))).status).toBe(413);
  const malformed = new Request('https://fn.test', { method: 'POST', headers: { Authorization: 'Bearer user-token' }, body: '{' });
  expect((await handler(malformed)).status).toBe(400);
  expect(f).not.toHaveBeenCalled();
});
