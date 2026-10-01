import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { timedFetch } from './requestTimeout';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

/** Returns null when Supabase is not configured; the app then runs in local demo mode. */
export function getSupabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  if (!client) {
    client = createClient(url, anonKey, {
      global: { fetch: timedFetch },
      auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  }
  return client;
}
