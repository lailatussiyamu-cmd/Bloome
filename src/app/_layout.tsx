import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BloomeProvider } from '../lib/BloomeContext';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <BloomeProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </BloomeProvider>
    </SafeAreaProvider>
  );
}
