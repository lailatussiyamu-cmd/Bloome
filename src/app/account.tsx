import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { exportAccountData } from '../lib/exportAccountData';
import { Body, Button, Card, Field, Label, Screen, Title } from '../components/ui';
import { DELETE_CONFIRMATION } from '../../supabase/functions/_shared/accountPolicy.ts';
import { useApi } from '../lib/BloomeContext';

/** Account & privacy: export data, revoke AI consent, sign out, delete the account. */
export default function Account() {
  const api = useApi();
  const online = api.kind === 'supabase';
  const [aiConsent, setAiConsent] = useState<boolean | null>(null);
  const [consentError, setConsentError] = useState(false);
  const [consentAttempt, setConsentAttempt] = useState(0);
  const [busy, setBusy] = useState<'' | 'export' | 'consent' | 'signout' | 'delete'>('');
  const [msg, setMsg] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    let active = true;
    api.hasConsent('ai').then(c => { if (active) setAiConsent(c); }).catch(() => { if (active) setConsentError(true); });
    return () => { active = false; };
  }, [api, consentAttempt]);

  const run = async (kind: typeof busy, fn: () => Promise<void>, failure: string) => {
    if (busy) return;
    setBusy(kind); setMsg('');
    try { await fn(); } catch { setMsg(failure); } finally { setBusy(''); }
  };

  const exportData = () => run('export', async () => {
    const json = await api.exportData();
    await exportAccountData(json);
  }, 'Data belum dapat diekspor. Periksa koneksi lalu coba lagi.');

  const revokeAi = () => run('consent', async () => {
    setAiConsent(await api.setConsent('ai', false));
    setConsentError(false);
    setMsg('Izin AI sudah dicabut. Pesan tidak akan dikirim ke AI sampai kamu menyetujuinya lagi.');
  }, 'Izin belum dapat diubah. Coba lagi.');

  const signOut = () => run('signout', async () => {
    await api.signOut();
    router.replace('/sign-in');
  }, 'Belum bisa keluar. Coba lagi.');

  const deleteAccount = () => run('delete', async () => {
    await api.deleteAccount(typed.trim());
    router.replace(online ? '/sign-in' : '/');
  }, 'Status penghapusan belum dapat dipastikan. Permintaan mungkin sudah diproses. Periksa koneksi dan coba masuk kembali untuk memeriksa akunmu.');

  return (
    <Screen>
      <Title>Akun & privasi</Title>
      <Body muted>Datamu milikmu. Kamu bisa membawanya, membatasi penggunaannya, atau menghapusnya.</Body>

      <Card>
        <Label>Ekspor data</Label>
        <Body>Salinan semua yang Bloome simpan tentangmu, dalam format JSON.</Body>
        <Button variant="ghost" title={busy === 'export' ? 'Menyiapkan…' : 'Ekspor dataku'} disabled={!!busy} onPress={exportData} />
      </Card>

      {online && (
        <Card>
          <Label>Pendamping AI</Label>
          <Body>{aiConsent === null ? (consentError ? 'Status izin AI belum dapat diperiksa. Izin sebelumnya mungkin masih aktif.' : 'Memeriksa izin AI…') : aiConsent ? 'Kamu mengizinkan pesan di Ruang cerita dikirim ke penyedia AI.' : 'Pesan tidak dikirim ke penyedia AI.'}</Body>
          {consentError && <Button variant="ghost" title="Periksa ulang izin" disabled={!!busy} onPress={() => { setAiConsent(null); setConsentError(false); setConsentAttempt(n => n + 1); }} />}
          {(aiConsent === true || consentError) && <Button variant="ghost" title={busy === 'consent' ? 'Menyimpan…' : 'Cabut izin AI'} disabled={!!busy} onPress={revokeAi} />}
        </Card>
      )}

      {online && <Button variant="ghost" title={busy === 'signout' ? 'Keluar…' : 'Keluar'} disabled={!!busy} onPress={signOut} />}

      <Card>
        <Label>Hapus akun</Label>
        <Body>{online
          ? 'Akun dan semua datamu (profil, Bloom, check-in, catatan, izin) dihapus permanen dari server Bloome. Ini tidak bisa dibatalkan.'
          : 'Semua data Bloome di perangkat ini dihapus permanen. Ini tidak bisa dibatalkan.'}</Body>
        {!confirming ? (
          <Button variant="ghost" title="Hapus akun…" disabled={!!busy} onPress={() => { setConfirming(true); setTyped(''); setMsg(''); }} />
        ) : (
          <>
            <Field label={`Ketik ${DELETE_CONFIRMATION} untuk konfirmasi`} value={typed} onChangeText={setTyped} autoCapitalize="characters" autoCorrect={false} editable={!busy} />
            <Button title={busy === 'delete' ? 'Menghapus…' : 'Hapus permanen'} disabled={!!busy || typed.trim() !== DELETE_CONFIRMATION} onPress={deleteAccount} />
            <Button variant="ghost" title="Batal" disabled={!!busy} onPress={() => { setConfirming(false); setTyped(''); }} />
          </>
        )}
      </Card>

      {!!msg && <Body>{msg}</Body>}
      <Button variant="ghost" title="Kembali" onPress={() => router.replace('/today')} />
    </Screen>
  );
}
