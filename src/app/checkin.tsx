import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Body, Button, Choice, Field, Label, Screen, Title } from '../components/ui';
import { hasDistressSignal } from '../domain/safety';
import type { CheckInInput } from '../lib/api';
import { useApi } from '../lib/BloomeContext';

type Portion = NonNullable<CheckInInput['portion']>;
type Mood = NonNullable<CheckInInput['mood']>;
type Reason = NonNullable<CheckInInput['eatingReason']>;

const PORTIONS: [Portion, string][] = [['very_small', 'Sangat sedikit'], ['small', 'Kecil'], ['medium', 'Sedang'], ['large', 'Besar']];
const MOODS: [Mood, string][] = [['tired', 'Lelah'], ['stressed', 'Stres'], ['okay', 'Biasa'], ['calm', 'Tenang'], ['happy', 'Senang']];
const REASONS: [Reason, string][] = [['hungry', 'Lapar'], ['tired', 'Capek'], ['stressed', 'Stres'], ['bored', 'Bosan'], ['event', 'Acara']];

/** 30 seconds, no calories. */
export default function CheckIn() {
  const api = useApi();
  const [portion, setPortion] = useState<Portion | undefined>();
  const [mood, setMood] = useState<Mood | undefined>();
  const [reason, setReason] = useState<Reason | undefined>();
  const [water, setWater] = useState(0);
  const [hardDay, setHardDay] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const distress = !!note && hasDistressSignal(note);
      // One server call: the check-in, a lighter day, and its Care Moments are saved together or not at all.
      const result = await api.submitCheckIn(
        { portion, mood, eatingReason: reason, waterGlasses: water, hardDay, note: note.trim() || undefined },
        { recordMoments: !distress },
      );
      if (distress) return router.replace('/support');
      const lastPillar = result.recordedPillars[result.recordedPillars.length - 1];
      if (!lastPillar) return router.replace('/today');
      router.replace({ pathname: '/care-done', params: { pillar: lastPillar, milestone: result.stageAdvanced && result.milestone ? result.milestone : '' } });
    } catch { setError('Check-in belum tersimpan. Periksa koneksi lalu coba lagi.'); }
    finally { setBusy(false); }
  };

  const row = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 };

  return (
    <Screen>
      <Title>Check-in</Title>
      <Body muted>30 detik, tanpa kalori.</Body>

      <Label>Porsinya</Label>
      <View style={row}>{PORTIONS.map(([k, l]) => <Choice key={k} label={l} selected={portion === k} onPress={() => setPortion(k)} />)}</View>

      <Label>Rasanya sekarang</Label>
      <View style={row}>{MOODS.map(([k, l]) => <Choice key={k} label={l} selected={mood === k} onPress={() => setMood(k)} />)}</View>

      <Label>Tadi makan karena…</Label>
      <View style={row}>{REASONS.map(([k, l]) => <Choice key={k} label={l} selected={reason === k} onPress={() => setReason(k)} />)}</View>

      <Label>Air minum: {water} gelas</Label>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button variant="ghost" title="−" onPress={() => setWater(Math.max(0, water - 1))} />
        <Button title="+ 1 gelas" onPress={() => setWater(Math.min(20, water + 1))} />
      </View>

      <Choice label="Hari ini hari berat" sub="Rencana hari ini jadi lebih ringan. Bloom-mu tetap utuh." selected={hardDay} onPress={() => setHardDay(!hardDay)} />
      <Field label="Catatan (opsional)" value={note} onChangeText={setNote} multiline maxLength={1000} />

      {!!error && <Body>{error}</Body>}
      <Button title={busy ? 'Menyimpan…' : 'Simpan'} disabled={busy} onPress={save} />
    </Screen>
  );
}
