import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Linking } from 'react-native';
import { Body, Button, Card, Label, Screen, Title } from '../components/ui';
import { readTodaySteps } from '../lib/integrations/health';
import { locateOnce } from '../lib/integrations/location';
import type { StepsSummary } from '../lib/integrations/types';

export default function Connections() {
  const [steps, setSteps] = useState<StepsSummary | null>(null);
  const [location, setLocation] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const generation = useRef(0);
  const running = useRef(false);
  useFocusEffect(useCallback(() => () => { generation.current++; setSteps(null); setLocation(null); setBusy(false); setMessage(''); }, []));

  async function run(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true; setBusy(true); setMessage('');
    const id = generation.current;
    try { await action(); }
    catch (e) { if (id === generation.current) setMessage(e instanceof Error ? e.message : 'Belum dapat tersambung. Coba lagi.'); }
    finally { running.current = false; if (id === generation.current) setBusy(false); }
  }

  return <Screen>
    <Title>Koneksi perangkat</Title>
    <Body>Pilih data yang ingin kamu lihat. Setiap akses dimulai dari tombol di halaman ini.</Body>
    <Card>
      <Label>Langkah hari ini</Label>
      <Body>Bloome meminta izin baca langkah dari Apple Health atau Health Connect. Angka hanya ditampilkan di perangkat, tanpa target wajib.</Body>
      <Button title={busy ? 'Menunggu…' : 'Izinkan & baca langkah'} disabled={busy} onPress={() => { const id = generation.current; setSteps(null); void run(async () => { const result = await readTodaySteps(); if (id === generation.current) setSteps(result); }); }} />
      {steps && <Body>{steps.steps === null ? 'Data belum tersedia atau akses baca belum diberikan.' : `${steps.steps.toLocaleString('id-ID')} langkah`} · {steps.source}</Body>}
    </Card>
    <Card>
      <Label>Lokasi saat ini</Label>
      <Body>GPS diambil sekali setelah kamu mengizinkan. Koordinat tidak disimpan atau dikirim ke server. Belum ada pelacakan perjalanan atau saran rute.</Body>
      <Button title="Izinkan & cek lokasi" disabled={busy} onPress={() => { const id = generation.current; setLocation(null); void run(async () => { const result = await locateOnce(); if (id === generation.current) setLocation(`${result.coords.latitude.toFixed(3)}, ${result.coords.longitude.toFixed(3)}`); }); }} />
      {location && <Body>Perkiraan lokasi: {location}</Body>}
    </Card>
    <Body muted>Data ini tidak dikirim ke AI dan tidak menambah pertumbuhan Bloom otomatis. Menolak izin tidak mengurangi kemajuanmu.</Body>
    {!!message && <Body>{message}</Body>}
    <Button variant="ghost" title="Bersihkan tampilan data" disabled={busy} onPress={() => { setSteps(null); setLocation(null); setMessage('Tampilan dibersihkan. Izin perangkat bisa dicabut di Pengaturan.'); }} />
    <Button variant="ghost" title="Pengaturan izin perangkat" onPress={() => void run(async () => { await Linking.openSettings(); })} />
    <Button variant="ghost" title="Kembali" onPress={() => router.back()} />
  </Screen>;
}

