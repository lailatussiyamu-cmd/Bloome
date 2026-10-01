import { createAssistantHandler } from '../../../server/assistant.ts';

Deno.serve(createAssistantHandler({
  supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
  anonKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  openaiKey: Deno.env.get('OPENAI_API_KEY') ?? '',
  model: Deno.env.get('OPENAI_MODEL') ?? 'gpt-5-mini',
}));
