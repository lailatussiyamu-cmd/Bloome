import { Stack, router } from 'expo-router';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BloomeProvider } from '../lib/BloomeContext';
import { getSupabase } from '../lib/supabase';

/** When the session ends (sign-out, expired refresh token, deleted account), go back to sign-in. */
function AuthWatcher() {
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    const { data } = sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.replace('/sign-in');
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <BloomeProvider>
        <AuthWatcher />
        <Stack screenOptions={{ headerShown: false }} />
      </BloomeProvider>
    </SafeAreaProvider>
  );
}
