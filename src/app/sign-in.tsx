import { router } from 'expo-router';
import { useState } from 'react';
import { Body, Button, Field, Screen, Title } from '../components/ui';
import { getSupabase } from '../lib/supabase';
import { withDeadline } from '../lib/requestTimeout';

/** Email one-time code. Only used when Supabase is configured. */
export default function SignIn() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sb = getSupabase();

  const send = async () => {
    if (!sb || busy) return;
    setBusy(true); setMsg(null);
    try {
    const { error } = await withDeadline(sb.auth.signInWithOtp({ email: email.trim() }));
    if (error) return setMsg(error.message);
    setSent(true);
    setMsg('Kode sudah dikirim ke emailmu.');
    } catch { setMsg('Permintaan terlalu lama atau koneksi terputus. Pengiriman belum dapat dipastikan. Cek inbox sebelum mencoba lagi.'); }
    finally { setBusy(false); }
  };

  const verify = async () => {
    if (!sb || busy) return;
    setBusy(true); setMsg(null);
    try {
    const { error } = await withDeadline(sb.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' }));
    if (error) return setMsg(error.message);
    router.replace('/');
    } catch { setMsg('Pemeriksaan terlalu lama atau koneksi terputus. Muat ulang halaman, lalu coba masuk kembali.'); }
    finally { setBusy(false); }
  };

  if (!sb) return <Screen><Title>Bloome di perangkat ini</Title><Body>Versi ini memakai penyimpanan lokal. Masuk akun dan AI tersedia setelah layanan tersambung.</Body><Button title="Lanjutkan" onPress={() => router.replace('/')} /></Screen>;

  return (
    <Screen>
      <Title>Masuk ke Bloome</Title>
      <Field label="Email" value={email} onChangeText={setEmail} editable={!busy && !sent} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
      {sent && <Field label="Kode dari email" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" />}
      {msg && <Body muted>{msg}</Body>}
      {sent ? <Button title={busy ? 'Memeriksa…' : 'Masuk'} onPress={verify} disabled={busy || code.length < 6} /> : <Button title={busy ? 'Mengirim…' : 'Kirim kode'} onPress={send} disabled={busy || !email.includes('@')} />}
      {sent && <Button title="Ubah email / kirim ulang" variant="ghost" disabled={busy} onPress={() => { setSent(false); setCode(''); setMsg(null); }} />}
    </Screen>
  );
}
