import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform } from 'react-native';
import { Body, Button, Screen } from '../components/ui';
import { useApi } from '../lib/BloomeContext';
import { getSupabase } from '../lib/supabase';
import { readLoginSession } from '../lib/loginFlow';

/** Decides where the app opens, following the product rules. */
export default function Gate() {
  const api = useApi();
  const [error, setError] = useState<string | null>(null);

  const go = useCallback(async () => {
      const sb = getSupabase();
      if (sb) {
        const callbackAttempt = Platform.OS === 'web' && /[?&#](code|error|error_description|error_code|access_token)=/.test(window.location.href);
        const session = await readLoginSession(sb.auth, callbackAttempt);
        if (!session) return router.replace('/sign-in');
      }
      const open = await api.appOpen();
      if (!open.onboarded) return router.replace('/onboarding');
      if (open.milestone) return router.replace('/milestone');
      // Comeback greets once: on the first open of the day, before the day mode is picked.
      if (open.comeback && open.needsDayMode) return router.replace('/comeback');
      if (open.needsDayMode) return router.replace('/day-mode');
      router.replace('/today');
  }, [api]);

  const showError = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  useEffect(() => {
    void go().catch(showError);
  }, [go]);

  return (
    <Screen scroll={false}>
      {error ? (
        <>
          <Body>Belum bisa membuka Bloome: {error}</Body>
          <Button title="Coba lagi" onPress={() => { setError(null); void go().catch(showError); }} />
          <Button title="Kembali ke login" variant="ghost" onPress={() => router.replace('/sign-in')} />
        </>
      ) : (
        <ActivityIndicator accessibilityLabel="Memuat" style={{ marginTop: 80 }} />
      )}
    </Screen>
  );
}
