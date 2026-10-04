import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Body, Button, Field, Screen, Title } from '../components/ui';
import { getSupabase } from '../lib/supabase';
import { withDeadline } from '../lib/requestTimeout';
import { readLoginSession, validatedEmailLink } from '../lib/loginFlow';

/** Email one-time code. Only used when Supabase is configured. */
export default function SignIn() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [useCode, setUseCode] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [emailLink, setEmailLink] = useState('');
  const [showLink, setShowLink] = useState(false);
  const sb = getSupabase();

  useEffect(() => {
    if (!sb) return;
    let active = true;
    const check = () => {
      void readLoginSession(sb.auth).then(session => {
        if (active && session) router.replace('/');
      }).catch(() => { /* Callback failures are shown by the entry screen. */ });
    };
    const { data } = sb.auth.onAuthStateChange((event, session) => {
      if (active && session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) router.replace('/');
    });
    check();
    if (Platform.OS === 'web') window.addEventListener('focus', check);
    return () => {
      active = false;
      data.subscription.unsubscribe();
      if (Platform.OS === 'web') window.removeEventListener('focus', check);
    };
  }, [sb]);

  const openEmailLink = () => {
    if (Platform.OS !== 'web') return;
    try {
      const target = validatedEmailLink(emailLink, process.env.EXPO_PUBLIC_SUPABASE_URL ?? '', window.location.origin);
      setEmailLink('');
      window.location.assign(target);
    } catch { setMsg('Link tidak dikenali. Salin alamat tombol masuk dari email Bloome, bukan alamat hasil pencarian Google.'); }
  };

  const send = async () => {
    if (!sb || busy) return;
    setBusy(true); setMsg(null);
    try {
    const { error } = await withDeadline(sb.auth.signInWithOtp({ email: email.trim(), options: Platform.OS === 'web' ? { emailRedirectTo: window.location.origin + '/' } : undefined }));
    if (error) return setMsg(error.message);
    setSent(true);
    setMsg('Periksa email terbaru dari Bloome. Jika berisi link, buka link di browser yang sama dengan halaman ini. Jika berisi kode, pilih Masukkan kode.');
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
      {sent && useCode && <Field label="Kode dari email" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" />}
      {msg && <Body muted>{msg}</Body>}
      {Platform.OS === 'web' && <>
        <Button title="Email berisi link?" variant="ghost" onPress={() => setShowLink(!showLink)} />
        {showLink && <>
          <Body>Salin alamat link masuk dari email terbaru, lalu tempel di sini agar dibuka di browser ini. Gunakan browser tempat kamu meminta email. Jangan kirim link ke chat.</Body>
          <Field label="Link masuk dari email" value={emailLink} onChangeText={setEmailLink} autoCapitalize="none" autoCorrect={false} secureTextEntry />
          <Button title="Buka link masuk" onPress={openEmailLink} disabled={!emailLink.trim() || busy} />
        </>}
      </>}
      {sent && !useCode && <Button title="Masukkan kode dari email" variant="ghost" onPress={() => setUseCode(true)} />}
      {sent ? (useCode ? <Button title={busy ? 'Memeriksa…' : 'Masuk'} onPress={verify} disabled={busy || code.length < 6} /> : null) : <Button title={busy ? 'Mengirim…' : 'Kirim email masuk'} onPress={send} disabled={busy || !email.includes('@')} />}
      {sent && <Button title="Ubah email / kirim ulang" variant="ghost" disabled={busy} onPress={() => { setSent(false); setUseCode(false); setCode(''); setMsg(null); }} />}
    </Screen>
  );
}
