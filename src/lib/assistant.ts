import { getSupabase } from './supabase';
import { MAX_HISTORY, type ChatMessage, type AssistantReply } from '../domain/assistant';

export async function askAssistant(messages: ChatMessage[], signal: AbortSignal): Promise<AssistantReply> {
  const sb = getSupabase();
  if (!sb) throw new Error('AI belum tersambung. Panduan lokal tetap tersedia.');
  const { data } = await sb.auth.getSession();
  if (!data.session) throw new Error('Silakan masuk kembali untuk menggunakan AI.');
  const response = await fetch(process.env.EXPO_PUBLIC_SUPABASE_URL + '/functions/v1/bloome-assistant', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.session.access_token, apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY! },
    body: JSON.stringify({ consent: true, messages: messages.slice(-MAX_HISTORY) }),
  });
  if (!response.ok) throw new Error(response.status === 429 ? 'Batas percakapan sementara tercapai. Coba lagi nanti; panduan lokal tetap tersedia.' : response.status === 401 ? 'Sesi berakhir. Silakan masuk kembali.' : 'AI belum dapat menjawab. Coba lagi sebentar atau gunakan panduan lokal.');
  const reply = await response.json() as AssistantReply;
  if (typeof reply.text !== 'string' || !reply.text.trim() || !['ai', 'support'].includes(reply.kind)) throw new Error('Jawaban belum tersedia. Silakan coba lagi.');
  return reply;
}
