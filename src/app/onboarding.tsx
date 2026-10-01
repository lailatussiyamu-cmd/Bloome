import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Body, Button, Choice, Field, Label, Screen, Title, serif } from '../components/ui';
import { Wordmark } from '../components/Brand';
import { LivingBloom } from '../components/LivingBloom';
import { localDateIn } from '../domain/careMoment';
import { canRegister, isValidDate } from '../domain/safety';
import { trainingProfile, type Activity, type Frequency, type Goal } from '../domain/onboarding';
import { useApi } from '../lib/BloomeContext';

const GOALS: [Goal, string][] = [
  ['energy', 'Lebih bertenaga'],
  ['eating', 'Pola makan lebih baik'],
  ['weight', 'Turun berat'],
  ['routine', 'Lebih rutin gerak'],
];
const ACTIVITIES: [Activity, string][] = [
  ['none', 'Belum pernah rutin'],
  ['light', 'Jalan, senam, yoga'],
  ['intense', 'Gym, lari, HIIT'],
  ['other', 'Olahraga lain'],
];
const FREQS: [Frequency, string][] = [
  ['rarely', 'Jarang'],
  ['sometimes', '1–2× per minggu'],
  ['often', '3× atau lebih per minggu'],
];

const TOTAL_STEPS = 7;

export default function Onboarding() {
  const api = useApi();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jakarta';
  const [step, setStep] = useState(0);
  const [nickname, setNickname] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [goal, setGoal] = useState<Goal | null>(null);
  const [pregnant, setPregnant] = useState<boolean | null | undefined>(undefined);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [frequency, setFrequency] = useState<Frequency | null>(null);
  const [wakeTime, setWakeTime] = useState('06:00');
  const [shiftWork, setShiftWork] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const validDate = isValidDate(birthDate);
  const adult = validDate && canRegister(birthDate, localDateIn(timeZone));

  const canNext: Record<number, boolean> = {
    1: nickname.trim().length > 0 && adult,
    2: goal !== null,
    3: pregnant !== undefined,
    4: activity !== null,
    5: frequency !== null,
    6: /^([01]\d|2[0-3]):[0-5]\d$/.test(wakeTime),
    7: true,
  };

  const finish = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.completeOnboarding({
        nickname: nickname.trim(),
        birthDate,
        timeZone,
        goal: goal!,
        pregnantOrBreastfeeding: pregnant ?? null,
        activity: activity!,
        frequency: frequency!,
        wakeTime,
        shiftWork,
      });
      router.replace('/day-mode');
    } catch (e) {
      setError(e instanceof Error && e.message === 'under_18' ? 'Bloome hanya untuk usia 18 tahun ke atas.' : 'Profil belum tersimpan. Periksa koneksi dan coba lagi.');
    } finally { setBusy(false); }
  };

  if (step === 0) return <Screen dark>
    <View style={{alignItems:'center',paddingTop:30,gap:12}}><Wordmark dark size={60}/><Label>Balance · Nourish · Grow</Label></View>
    <View style={{flex:1,justifyContent:'center',alignItems:'center',minHeight:280}}><LivingBloom stage="seed" size={290}/></View>
    <View style={{alignItems:'center',gap:14,marginBottom:22}}><Text style={{fontFamily:serif,fontSize:34,lineHeight:40,textAlign:'center',color:'#F4E5D7'}}>Cara yang lebih lembut{ '\n' }untuk merawat diri.</Text><Body muted>Langkah kecil. Tumbuh dengan ritmemu.</Body></View>
    <Button title="Mulai perjalanan  →" onPress={()=>setStep(1)}/><View style={{alignItems:'center'}}><Body muted>Bloom-mu tumbuh saat kamu merawat diri.</Body></View>
  </Screen>;
  return (
    <Screen>
      <Label>Langkah {step} dari {TOTAL_STEPS}</Label>

      {step === 1 && (
        <>
          <Title>Selamat datang di Bloome</Title>
          <View style={{ alignItems: 'center', backgroundColor: '#10271E', borderRadius: 24 }}>
            <LivingBloom stage="seed" size={180} />
          </View>
          <Body>Bloom-mu tumbuh saat kamu merawat diri.</Body>
          <Body muted>Langkah kecil, dengan ritmemu sendiri.</Body>
          <Field label="Nama panggilan" value={nickname} onChangeText={setNickname} maxLength={40} autoComplete="given-name" />
          <Field label="Tanggal lahir (TTTT-BB-HH)" value={birthDate} onChangeText={setBirthDate} placeholder="1990-05-01" />
          {validDate && !adult && <Body muted>Bloome hanya untuk usia 18 tahun ke atas.</Body>}
        </>
      )}

      {step === 2 && (
        <>
          <Title>Apa yang paling kamu inginkan?</Title>
          {GOALS.map(([k, l]) => <Choice key={k} label={l} selected={goal === k} onPress={() => setGoal(k)} />)}
        </>
      )}

      {step === 3 && (
        <>
          <Title>Sedang hamil atau menyusui?</Title>
          <Body muted>Kalau ya, Bloome tidak akan memberi tujuan turun berat.</Body>
          <Choice label="Ya" selected={pregnant === true} onPress={() => setPregnant(true)} />
          <Choice label="Tidak" selected={pregnant === false} onPress={() => setPregnant(false)} />
          <Choice label="Tidak mau jawab" selected={pregnant === null} onPress={() => setPregnant(null)} />
        </>
      )}

      {step === 4 && (
        <>
          <Title>Olahraga yang biasa kamu lakukan</Title>
          {ACTIVITIES.map(([k, l]) => <Choice key={k} label={l} selected={activity === k} onPress={() => setActivity(k)} />)}
        </>
      )}

      {step === 5 && (
        <>
          <Title>Sebulan terakhir, seberapa sering?</Title>
          {FREQS.map(([k, l]) => <Choice key={k} label={l} selected={frequency === k} onPress={() => setFrequency(k)} />)}
          {activity && frequency && (
            <Body muted>Profilmu: {trainingProfile({ activity, frequency }).title}</Body>
          )}
        </>
      )}

      {step === 6 && (
        <>
          <Title>Ritme harianmu</Title>
          <Field label="Jam bangun (JJ:MM)" value={wakeTime} onChangeText={setWakeTime} placeholder="06:00" />
          <Choice label="Kerja shift bergilir" sub="Bloome akan menyarankan hari pulih setelah shift malam" selected={shiftWork} onPress={() => setShiftWork(!shiftWork)} />
        </>
      )}

      {step === 7 && (
        <>
          <Title>Bloom-mu mulai di sini</Title>
          <View style={{ alignItems: 'center', backgroundColor: '#10271E', borderRadius: 24, paddingVertical: 8 }}>
            <LivingBloom stage="seed" size={200} />
          </View>
          <Body>Bloom-mu tumbuh saat kamu merawat diri, bukan dari angka timbangan.</Body>
          <Body muted>Data kesehatan, siklus, dan lokasi bisa dihubungkan nanti. Semuanya opsional.</Body>
        </>
      )}

      {error && <Body>{error}</Body>}

      <View style={{ flex: 1 }} />
      <Button title={busy ? 'Menyimpan…' : step === TOTAL_STEPS ? 'Mulai' : 'Lanjut'} disabled={busy || !canNext[step]} onPress={() => (step === TOTAL_STEPS ? finish() : setStep(step + 1))} />
      {step > 1 && <Button variant="ghost" title="Kembali" onPress={() => setStep(step - 1)} />}
    </Screen>
  );
}

