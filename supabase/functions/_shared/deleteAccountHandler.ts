/**
 * Deletes the signed-in user's account. Every Bloome table references auth.users
 * with ON DELETE CASCADE, so removing the auth user removes all of their data.
 * The service-role key exists only inside the Edge Function, never in the app.
 */
export interface DeleteAccountConfig { supabaseUrl: string; anonKey: string; serviceRoleKey: string }
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

import { DELETE_CONFIRMATION } from './accountPolicy.ts';
export { DELETE_CONFIRMATION };

const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store' };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });

export function createDeleteAccountHandler(config: DeleteAccountConfig, fetcher: Fetch = fetch) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    const auth = req.headers.get('Authorization') ?? '';
    if (!/^Bearer\s+\S+$/i.test(auth)) return json(401, { error: 'sign_in_required' });
    if (!config.supabaseUrl || !config.anonKey || !config.serviceRoleKey) return json(503, { error: 'not_configured' });

    let body: { confirm?: unknown };
    try {
      const text = await req.text();
      if (text.length > 1000) return json(413, { error: 'request_too_large' });
      body = JSON.parse(text);
    } catch { return json(400, { error: 'invalid_request' }); }
    if (body?.confirm !== DELETE_CONFIRMATION) return json(400, { error: 'confirmation_required' });

    const signal = AbortSignal.timeout(20000);
    try {
      // Identify the caller from their own token; never from the request body.
      const who = await fetcher(config.supabaseUrl + '/auth/v1/user', { headers: { apikey: config.anonKey, Authorization: auth }, signal });
      if (!who.ok) return json(401, { error: 'sign_in_required' });
      const user = await who.json() as { id?: string };
      if (!user.id || !/^[0-9a-f-]{36}$/i.test(user.id)) return json(401, { error: 'sign_in_required' });

      const del = await fetcher(config.supabaseUrl + '/auth/v1/admin/users/' + user.id, {
        method: 'DELETE',
        headers: { apikey: config.serviceRoleKey, Authorization: 'Bearer ' + config.serviceRoleKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ should_soft_delete: false }),
        signal,
      });
      if (del.status === 404) return json(200, { deleted: true });
      if (!del.ok) return json(503, { error: 'delete_failed' });
      return json(200, { deleted: true });
    } catch {
      return json(503, { error: 'delete_failed' });
    }
  };
}
