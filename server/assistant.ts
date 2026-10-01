import { ASSISTANT_INSTRUCTIONS, MAX_HISTORY, MAX_MESSAGE, URGENT_REPLY, urgentSignal, type ChatMessage } from '../src/domain/assistant.ts';

export interface AssistantConfig { supabaseUrl: string; anonKey: string; openaiKey: string; model: string }
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store' };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });

export function parseMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_HISTORY) throw new Error('invalid_messages');
  const result = value.map((m: unknown) => {
    if (!m || typeof m !== 'object') throw new Error('invalid_messages');
    const { role, content } = m as Record<string, unknown>;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || !content.trim() || content.length > MAX_MESSAGE) throw new Error('invalid_messages');
    return { role, content: content.trim() } as ChatMessage;
  });
  if (result[result.length - 1].role !== 'user') throw new Error('invalid_messages');
  return result;
}

export function outputText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const d = value as { status?: string; output?: { type?: string; content?: { type?: string; text?: string; refusal?: string }[] }[] };
  if (d.status !== 'completed' || !Array.isArray(d.output)) return '';
  return d.output.filter(o => o.type === 'message').flatMap(o => o.content ?? []).map(c => c.type === 'output_text' ? c.text ?? '' : c.type === 'refusal' ? c.refusal ?? '' : '').join('\n').trim().slice(0, MAX_MESSAGE);
}

/** Dependency injection lets tests exercise the real HTTP handler without live health data or API charges. */
export function createAssistantHandler(config: AssistantConfig, fetcher: Fetch = fetch) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    const auth = req.headers.get('Authorization') ?? '';
    if (!/^Bearer\s+\S+$/i.test(auth)) return json(401, { error: 'sign_in_required' });
    if (!config.supabaseUrl || !config.anonKey) return json(503, { error: 'assistant_not_configured' });
    // Bound request data even when Content-Length is missing/chunked.
    const reader = req.body?.getReader();
    if (!reader) return json(400, { error: 'invalid_request' });
    let total = 0; const chunks: Uint8Array[] = [];
    try {
      while (true) { const chunk = await reader.read(); if (chunk.done) break; total += chunk.value.length; if (total > 32000) { await reader.cancel(); return json(413, { error: 'message_too_large' }); } chunks.push(chunk.value); }
    } catch { return json(400, { error: 'invalid_request' }); }
    let messages: ChatMessage[];
    try {
      const bytes = new Uint8Array(total); let at = 0; for (const c of chunks) { bytes.set(c, at); at += c.length; }
      const body = JSON.parse(new TextDecoder().decode(bytes));
      if (body.consent !== true) return json(400, { error: 'consent_required' });
      messages = parseMessages(body.messages);
    } catch { return json(400, { error: 'invalid_messages' }); }
    const signal = AbortSignal.timeout(35000);
    const supabaseHeaders = { apikey: config.anonKey, Authorization: auth, 'Content-Type': 'application/json' };
    try {
      const userResponse = await fetcher(config.supabaseUrl + '/auth/v1/user', { headers: supabaseHeaders, signal });
      if (!userResponse.ok) return json(401, { error: 'sign_in_required' });
      const user = await userResponse.json() as { id?: string };
      if (!user.id) return json(401, { error: 'sign_in_required' });
      // Server-side onboarding check: app UI alone is not an age/access boundary.
      const profileResponse = await fetcher(config.supabaseUrl + '/rest/v1/profiles?select=user_id&limit=1', { headers: supabaseHeaders, signal });
      if (!profileResponse.ok) return json(503, { error: 'assistant_unavailable' });
      const profiles = await profileResponse.json() as { user_id: string }[];
      if (!profiles.some(p => p.user_id === user.id)) return json(403, { error: 'onboarding_required' });
      if (urgentSignal(messages[messages.length - 1].content)) return json(200, URGENT_REPLY);
      if (!config.openaiKey || !config.model) return json(503, { error: 'assistant_not_configured' });
      const quota = await fetcher(config.supabaseUrl + '/rest/v1/rpc/consume_ai_request', { method: 'POST', headers: supabaseHeaders, body: '{}', signal });
      if (!quota.ok) return json(503, { error: 'assistant_unavailable' });
      if (await quota.json() !== true) return json(429, { error: 'rate_limited' });
      const aiHeaders = { Authorization: 'Bearer ' + config.openaiKey, 'Content-Type': 'application/json' };
      const moderation = await fetcher('https://api.openai.com/v1/moderations', { method: 'POST', headers: aiHeaders, body: JSON.stringify({ model: 'omni-moderation-latest', input: messages[messages.length - 1].content }), signal });
      if (!moderation.ok) return json(503, { error: 'assistant_unavailable' });
      const check = await moderation.json() as { results?: { categories?: Record<string, boolean> }[] };
      const categories = check.results?.[0]?.categories;
      if (!categories) return json(503, { error: 'assistant_unavailable' });
      if (categories['self-harm/intent'] || categories['self-harm/instructions']) return json(200, URGENT_REPLY);
      const response = await fetcher('https://api.openai.com/v1/responses', { method: 'POST', headers: aiHeaders, signal, body: JSON.stringify({ model: config.model, store: false, instructions: ASSISTANT_INSTRUCTIONS, input: messages, max_output_tokens: 1600, reasoning: { effort: 'low' } }) });
      if (!response.ok) return json(response.status === 429 ? 429 : 503, { error: response.status === 429 ? 'rate_limited' : 'assistant_unavailable' });
      const text = outputText(await response.json());
      if (!text) return json(503, { error: 'assistant_unavailable' });
      return json(200, { text, kind: 'ai', urgent: false });
    } catch (e) {
      return json(503, { error: e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'request_timeout' : 'assistant_unavailable' });
    }
  };
}
