import { router } from 'expo-router';

import { View } from 'react-native';
import { Body, Button, Label, Screen, Title } from '../components/ui';
import { LivingBloom } from '../components/LivingBloom';

import { useBloomSnapshot } from '../lib/useBloomSnapshot';


export default function Comeback() {
  const { bloom, mode, profile, error } = useBloomSnapshot();
  const name = profile?.nickname ?? '';

  if (!bloom) return <Screen dark><Body muted>{error || 'Memuat…'}</Body>{!!error && <Button title="Coba lagi" onPress={() => router.replace('/')} />}</Screen>;

  return (
    <Screen dark>
      <Label>Mode kembali</Label>
      <Title>Selamat datang kembali{name ? `, ${name}` : ''}.</Title>
      <Body>Tidak perlu mulai dari nol. Lanjutkan saja.</Body>
      <View style={{ alignItems: 'center', paddingVertical: 16 }}>
        <LivingBloom stage={bloom.stage} mode={mode} interactionState="comeback" size={300} />
      </View>
      <Body muted>
        Bloom-mu masih {bloom.name.toLowerCase()}, utuh. Kita mulai pelan, sesuai tenagamu hari ini.
      </Body>
      <View style={{ flex: 1 }} />
      <Button title="Ayo lanjut" onPress={() => router.replace('/day-mode')} />
    </Screen>
  );
}
