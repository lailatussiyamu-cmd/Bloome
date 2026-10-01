import { router } from 'expo-router';

import { View } from 'react-native';
import { Body, Button, Card, Screen, Title } from '../components/ui';
import { BloomNavigation } from '../components/BloomNavigation';
import { LivingBloom } from '../components/LivingBloom';
import { STAGE_COPY, STAGES, stageRank } from '../domain/bloom';
import { useBloomSnapshot } from '../lib/useBloomSnapshot';


const fmt = (d?: string) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : 'nanti';

/** Stages and dates only: no counts, no "X days to go". */
export default function Journey() {
  const { bloom, mode, error } = useBloomSnapshot();

  if (!bloom) return <Screen dark><Body muted>{error || 'Memuat…'}</Body>{!!error && <Button title="Coba lagi" onPress={() => router.replace('/')} />}</Screen>;
  const current = stageRank(bloom.stage);

  return (
    <Screen dark footer={<BloomNavigation stage={bloom.stage} mode={mode} current="journey" />}>
      <Title>Perjalanan Bloom</Title>
      <Body muted>Setiap tindakan peduli punya tempat di sini.</Body>
      <View style={{alignItems:'center'}}><LivingBloom stage={bloom.stage} mode={mode} size={230}/></View>
      {STAGES.map((s, i) => {
        const reached = i <= current;
        return (
          <Card key={s}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: 1 }}>
              <View style={{ borderRadius: 24 }}>
                <LivingBloom stage={s} size={64} compact decorative />
              </View>
              <View style={{ flex: 1 }}>
                <Body>{STAGE_COPY[s].name}{i === current ? ' · sekarang' : ''}</Body>
                <Body muted>{STAGE_COPY[s].line}</Body>
              </View>
              <Body muted>{reached ? fmt(bloom.stageReachedAt[s]) : 'nanti'}</Body>
            </View>
          </Card>
        );
      })}
      <Body muted>Bloom-mu tidak pernah layu, menyusut, atau mulai ulang. Hari yang terlewat tidak mengurangi apa pun.</Body>
      <Button variant="ghost" title="Kembali" onPress={() => router.replace('/today')} />
    </Screen>
  );
}
