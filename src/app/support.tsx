import { router } from 'expo-router';
import { Linking } from 'react-native';
import { useState } from 'react';
import { SUPPORT_URL } from '../domain/assistant';
import { Body, Button, Card, Screen, Title } from '../components/ui';

/**
 * Shown when safety signals appear. Nudges and targets pause; no diagnosis is given.
 * TODO before release: verified Indonesian contacts for mental-health and nutrition services.
 */
export default function Support() {
  const [error, setError] = useState('');
  return (
    <Screen>
      <Title>Terima kasih sudah jujur.</Title>
      <Body>Apa yang kamu rasakan penting. Kamu boleh memilih hari yang lebih ringan.</Body>
      <Card>
        <Body>Kalau makan, berat badan, atau perasaan tentang tubuhmu mulai terasa berat, bicara dengan tenaga kesehatan bisa sangat membantu.</Body>
        <Body muted>Jika kamu merasa tidak aman atau mungkin menyakiti diri, minta orang terdekat menemanimu. Dalam bahaya langsung, cari layanan darurat atau IGD terdekat.</Body>
        <Body muted>Di Indonesia, dukungan krisis tersedia melalui Healing119.id atau 119 ekstensi 8. Jika belum tersambung, cari bantuan langsung dari orang terdekat atau fasilitas kesehatan.</Body>
        <Button title="Buka Healing119.id" onPress={() => { Linking.openURL(SUPPORT_URL).catch(() => setError('Buka healing119.id di browser atau hubungi 119 ekstensi 8.')); }} />
      </Card>
      <Body muted>Bloom-mu tetap utuh, apa pun yang terjadi hari ini.</Body>
      {!!error && <Body>{error}</Body>}
      <Button title="Pilih ritme lebih ringan" onPress={() => router.push('/day-mode')} />
      <Button variant="ghost" title="Ruang cerita Bloome" onPress={() => router.push('/assistant')} />
      <Button title="Kembali ke Bloome" onPress={() => router.replace('/today')} />
    </Screen>
  );
}
