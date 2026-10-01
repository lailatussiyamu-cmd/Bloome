import { router, useLocalSearchParams } from 'expo-router';

import { View } from 'react-native';
import { Body, Button, Screen, Title } from '../components/ui';
import { LivingBloom } from '../components/LivingBloom';

import { PILLAR_COPY, type Pillar } from '../domain/careMoment';
import { useBloomSnapshot } from '../lib/useBloomSnapshot';


export default function CareDone() {
  const { bloom, mode, error } = useBloomSnapshot();
  const { pillar, milestone } = useLocalSearchParams<{ pillar?: Pillar; milestone?: string }>();
  const stage = bloom?.stage;
  if (error) return <Screen><Body>{error}</Body><Button title="Coba lagi" onPress={() => router.replace('/')} /></Screen>;

  return (
    <Screen dark>
      <Body muted>Momen peduli{pillar && Object.hasOwn(PILLAR_COPY, pillar) ? ` · ${PILLAR_COPY[pillar]}` : ''}</Body>
      <View style={{ alignItems: 'center', paddingVertical: 16 }}>
        {stage && <LivingBloom stage={stage} mode={mode} interactionState="careCompleted" size={310} />}
      </View>
      <View accessibilityLiveRegion="polite" style={{ gap: 6 }}>
        <Title>Bagus.</Title>
        <Body>Satu lagi tindakan peduli untukmu.</Body>
        <Body muted>Bloom-mu menyimpannya. Tidak ada yang perlu dihitung.</Body>
      </View>
      <View style={{ flex: 1 }} />
      {milestone ? (
        <Button title="Ada kabar dari Bloom-mu" onPress={() => router.replace('/milestone')} />
      ) : (
        <Button title="Lanjut" onPress={() => router.replace('/today')} />
      )}
      <Button variant="ghost" title="Lihat perjalanan Bloom-mu" onPress={() => router.push('/journey')} />
    </Screen>
  );
}
