import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Body, Button, Label, Screen, Title } from '../components/ui';
import { LivingBloom } from '../components/LivingBloom';
import { STAGE_COPY, STAGES, stageRank } from '../domain/bloom';
import { useBloomSnapshot } from '../lib/useBloomSnapshot';
import { useApi } from '../lib/BloomeContext';

export default function Milestone() {
  const { bloom, mode, error } = useBloomSnapshot();
  const api = useApi();
  const [saveError, setSaveError] = useState('');
  const [busy, setBusy] = useState(false);

  const next = async () => {
    if (busy) return;
    setBusy(true);
    try { await api.ackMilestone(); router.replace('/'); }
    catch { setSaveError('Belum tersimpan. Coba lagi.'); }
    finally { setBusy(false); }
  };

  if (!bloom) return <Screen dark><Body muted>{error || 'Memuat…'}</Body>{!!error && <Button title="Coba lagi" onPress={() => router.replace('/')} />}</Screen>;
  const prev = STAGES[Math.max(0, stageRank(bloom.stage) - 1)];

  return (
    <Screen dark>
      <Label>Tonggak baru</Label>
      <Title>Bloom-mu kini {bloom.name.toLowerCase()}.</Title>
      <View style={{ alignItems: 'center', paddingVertical: 16 }}>
        <LivingBloom stage={bloom.stage} mode={mode} interactionState="careCompleted" size={310} />
      </View>
      <Body>{STAGE_COPY[prev].name} → {bloom.name}</Body>
      <Body muted>{bloom.line}</Body>
      <View style={{ flex: 1 }} />
      {!!saveError && <Body>{saveError}</Body>}
      <Button title="Lanjutkan" disabled={busy} onPress={next} />
      <Button variant="ghost" title="Lihat perjalananku" onPress={() => router.push('/journey')} />
    </Screen>
  );
}
