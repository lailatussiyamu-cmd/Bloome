import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Body, Button, Choice, Screen, Title } from '../components/ui';
import type { BloomStage } from '../domain/bloom';
import { LivingBloom } from '../components/LivingBloom';
import { DAY_MODES, DAY_MODE_RULES, type DayMode } from '../domain/dayMode';
import { useApi } from '../lib/BloomeContext';

export default function DayModeScreen() {
  const api = useApi();
  const [mode, setMode] = useState<DayMode>('standard');
  const [stage, setStage] = useState<BloomStage | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { Promise.all([api.getBloom(), api.appOpen()]).then(([b, open]) => { if (!b) { router.replace('/'); return; } setStage(b.stage); setMode(open.dayMode ?? 'standard'); }).catch(() => setError('Ritme belum dapat dimuat. Buka kembali Bloome untuk mencoba lagi.')); }, [api]);
  const rules = DAY_MODE_RULES[mode];

  const confirm = async () => {
    if (busy || !stage) return;
    setBusy(true);
    try { await api.setDayMode(mode); router.replace('/today'); }
    catch { setError('Ritme belum tersimpan. Silakan coba lagi.'); }
    finally { setBusy(false); }
  };

  return (
    <Screen>
      <Title>Bagaimana rasamu{'\n'}hari ini?</Title>
      <Body muted>Pilih ritme yang terasa pas. Sedikit pun cukup.</Body>
      <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
        {DAY_MODES.map((m) => (
          <Choice key={m} label={DAY_MODE_RULES[m].label} sub={DAY_MODE_RULES[m].sub} selected={mode === m} onPress={() => setMode(m)} />
        ))}
      </View>
      <View style={{ alignItems: 'center', backgroundColor: '#183128', borderRadius: 28, paddingVertical: 0 }}>
        {stage && <LivingBloom stage={stage} mode={mode} size={180} />}
      </View>
      <Body>{rules.bloomTitle}</Body>
      <Body muted>{rules.bloomText}</Body>
      {!!error && <Body>{error}</Body>}
      <Button title={busy ? 'Menyimpan…' : 'Mulai hari'} disabled={busy || !stage} onPress={confirm} />
      {!!error && <Button variant="ghost" title="Buka kembali Bloome" onPress={() => router.replace('/')} />}
    </Screen>
  );
}
