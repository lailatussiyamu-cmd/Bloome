import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Screen, Body, Button, Card, Label, Title, colors } from '../components/ui';
import { LivingBloom } from '../components/LivingBloom';
import { BloomNavigation } from '../components/BloomNavigation';
import { LOCAL_GUIDES, MAX_MESSAGE, SUPPORT_URL, URGENT_REPLY, urgentSignal, type ChatMessage } from '../domain/assistant';
import type { BloomStage } from '../domain/bloom';
import { useApi } from '../lib/BloomeContext';
import { askAssistant } from '../lib/assistant';

type Message = ChatMessage & { label?: string };
export default function Assistant() {
  const api = useApi();
  const [stage, setStage] = useState<BloomStage>('seed');
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [urgent, setUrgent] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const scroll = useRef<ScrollView>(null);
  const online = api.kind === 'supabase';
  useEffect(() => { let mounted = true; api.getBloom().then(b => { if (mounted && b) setStage(b.stage); }).catch(() => {}); return () => { mounted = false; pending.current?.abort(); }; }, [api]);

  async function send() {
    const text = draft.trim();
    if (!text || busy || pending.current) return;
    setError('');
    if (urgentSignal(text)) {
      setMessages(m => [...m, { role: 'user', content: text }, { role: 'assistant', content: URGENT_REPLY.text, label: 'Dukungan keselamatan' }]); setDraft(''); setUrgent(true); return;
    }
    if (!online || !consent) { setError(online ? 'Pilih izin percakapan di atas terlebih dahulu.' : 'AI belum tersambung. Pilih panduan lokal di atas.'); return; }
    const controller = new AbortController(); pending.current = controller; setBusy(true);
    const timer = setTimeout(() => controller.abort(), 45000);
    // Authored local guides are excluded from AI history.
    const history = messages.filter(m => m.label !== 'Panduan lokal').map(({ role, content }) => ({ role, content }));
    try {
      const reply = await askAssistant([...history, { role: 'user', content: text }], controller.signal);
      setMessages(m => [...m, { role: 'user', content: text }, { role: 'assistant', content: reply.text, label: reply.kind === 'ai' ? 'Bloome AI' : 'Dukungan keselamatan' }]);
      setUrgent(reply.urgent); setDraft('');
    } catch (e) { setError(controller.signal.aborted ? 'Permintaan dihentikan atau terlalu lama. Pesanmu masih di sini untuk dicoba lagi.' : e instanceof Error ? e.message : 'Belum tersambung. Coba lagi.'); }
    finally { clearTimeout(timer); pending.current = null; setBusy(false); }
  }

  return <Screen scroll={false} footer={<BloomNavigation stage={stage} current="assistant" />}>
    <KeyboardAvoidingView style={{ flex: 1, gap: 12 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><LivingBloom stage={stage} size={54} compact decorative /><View style={{ flex: 1 }}><Title>Ruang cerita</Title><Label>{online ? 'Pendamping AI Bloome' : 'Panduan lokal · AI belum tersambung'}</Label></View></View>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })} contentContainerStyle={{ gap: 14, paddingBottom: 12 }}>
        <Body>Kamu boleh datang apa adanya. Apa yang terasa berat hari ini?</Body>
        <Body muted>AI dapat keliru dan tidak menggantikan tenaga kesehatan. Percakapan tidak mengubah Bloom atau rencana harimu.</Body>
        {online && !consent && <Card><Body>Untuk berbicara dengan AI, pesanmu dikirim melalui server Bloome ke OpenAI. Riwayat di layar hanya disimpan selama halaman ini terbuka. Kebijakan penyimpanan penyedia tetap berlaku. Hindari menyertakan data identitas.</Body><Button title="Setuju, gunakan AI" onPress={() => setConsent(true)} /><Button variant="ghost" title="Gunakan panduan lokal" onPress={() => setError('Panduan lokal tersedia di bawah tanpa mengirim pesan ke AI.')} /></Card>}
        <Label>Panduan lokal</Label>
        {LOCAL_GUIDES.map(g => <Button key={g.title} variant="ghost" title={g.title} disabled={busy} onPress={() => { setMessages(m => [...m, { role: 'assistant', content: g.text, label: 'Panduan lokal' }]); setError(''); }} />)}
        {messages.map((m, i) => <View key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '94%', borderRadius: 20, padding: 17, gap: 7, backgroundColor: m.role === 'user' ? colors.accent : colors.surface }}><Text style={{ color: m.role === 'user' ? '#DED9CA' : colors.muted, fontSize: 11 }}>{m.role === 'user' ? 'Kamu' : m.label}</Text><Text selectable style={{ color: m.role === 'user' ? colors.onAccent : colors.ink, fontSize: 15, lineHeight: 23 }}>{m.content}</Text></View>)}
        {busy && <Text accessibilityLiveRegion="polite" style={{ color: colors.muted }}>Bloome sedang menyiapkan jawaban…</Text>}
        {urgent && <Button title="Buka Healing119.id" onPress={() => { Linking.openURL(SUPPORT_URL).catch(() => setError('Buka healing119.id di browser, atau telepon 119 ekstensi 8.')); }} />}
        {!!error && <Text accessibilityRole="alert" style={{ color: '#814E3F', lineHeight: 21 }}>{error}</Text>}
      </ScrollView>
      <TextInput accessibilityLabel="Pesan untuk Bloome" placeholder="Ceritakan yang kamu rasakan…" placeholderTextColor={colors.muted} multiline maxLength={MAX_MESSAGE} value={draft} onChangeText={setDraft} editable={!busy} style={{ minHeight: 54, maxHeight: 110, borderRadius: 20, padding: 15, backgroundColor: colors.surface, color: colors.ink, fontSize: 15 }} />
      <Button title={busy ? 'Menunggu jawaban…' : 'Kirim'} disabled={busy || !draft.trim()} onPress={send} />
      <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Button variant="ghost" title="Hapus obrolan" disabled={busy} onPress={() => { setMessages([]); setDraft(''); setError(''); setUrgent(false); setConsent(false); }} /></View><View style={{ flex: 1 }}><Button variant="ghost" title="Dukungan" onPress={() => router.push('/support')} /></View></View>
    </KeyboardAvoidingView>
  </Screen>;
}
