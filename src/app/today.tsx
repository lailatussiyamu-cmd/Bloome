import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Body, Button, Card, Label, Screen, Title, serif } from '../components/ui';
import { Icon } from '../components/Brand';
import { BloomNavigation } from '../components/BloomNavigation';
import { LivingBloom, type InteractionState } from '../components/LivingBloom';
import type { PublicBloom } from '../domain/bloom';
import { PILLAR_COPY, type Pillar } from '../domain/careMoment';
import { DAY_MODE_RULES, planForMode, type DayMode, type PlanItem } from '../domain/dayMode';
import { standardPlan } from '../domain/onboarding';
import { evaluateSafety } from '../domain/safety';
import type { Profile } from '../lib/api';
import { useApi } from '../lib/BloomeContext';

export default function Today() {
  const api = useApi();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [bloom, setBloom] = useState<PublicBloom | null>(null);
  const [mode, setMode] = useState<DayMode>('standard');
  const [night, setNight] = useState(false);
  const [paused, setPaused] = useState(false);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [restChosen, setRestChosen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const [open, p, b, notes, care] = await Promise.all([api.appOpen(), api.getProfile(), api.getBloom(), api.recentNotes(), api.todayCare()]);
        if (!active) return;
        if (!p || !b) { router.replace('/'); return; }
        setError('');
        setDone(Object.fromEntries(care.pillars.map(pillar => [pillar, true])));
        setRestChosen(care.resting);
        setProfile(p);
        setBloom(b);
        setMode(open.dayMode ?? 'standard');
        setNight(Boolean(open.night));
        setPaused(evaluateSafety({ recentTexts: notes, weights: [], today: open.today ?? '', verySmallPortionsInLast7Days: 0 }).pauseNudges);
      })().catch(() => { if (active) setError('Data belum dapat dimuat. Periksa koneksi lalu buka kembali halaman ini.'); });
      return () => { active = false; };
    }, [api]),
  );

  const complete = async (pillar: Pillar) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.recordCareMoment(pillar);
      setDone((d) => ({ ...d, [pillar]: true }));
      if (r.recorded) {
        router.push({ pathname: '/care-done', params: { pillar, milestone: r.stageAdvanced && r.milestone ? r.milestone : '' } });
      }
    } catch { setError('Momen belum tersimpan. Silakan coba lagi.'); } finally {
      setBusy(false);
    }
  };

  const chooseRest = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.chooseRest();
      setRestChosen(true);
      const r = await api.recordCareMoment('recover');
      setDone(d => ({ ...d, recover: true }));
      if (r.recorded) router.push({ pathname: '/care-done', params: { pillar: 'recover', milestone: r.milestone ?? '' } });
    } catch { setError('Pilihan istirahat atau momen belum tersimpan seluruhnya. Coba buka kembali halaman ini.'); }
    finally { setBusy(false); }
  };

  if (!profile || !bloom) return <Screen><Body muted>{error || 'Memuat…'}</Body>{!!error && <Button title="Coba lagi" onPress={() => router.replace('/')} />}</Screen>;

  const plan: PlanItem[] = paused ? [] : planForMode(standardPlan(profile), mode);
  const interaction: InteractionState = night || restChosen || paused ? 'resting' : 'idle';

  const date = new Intl.DateTimeFormat('id-ID', { weekday:'long', day:'numeric', month:'long', timeZone:profile.timeZone }).format(new Date());
  return (
    <Screen dark footer={<BloomNavigation stage={bloom.stage} mode={mode} current="today" />}>
      {!!error && <Body>{error}</Body>}
      <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
        <View style={{gap:7}}><Label>{date}</Label><Title>Halo, {profile.nickname}.</Title></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Pilih ritme hari ini" onPress={()=>router.push('/day-mode')} style={{width:46,height:46,borderRadius:23,borderWidth:1,borderColor:'#D3BA943D',alignItems:'center',justifyContent:'center'}}><Icon name={night?'recover':'plan'}/></Pressable>
      </View>
      <Pressable accessibilityRole="button" onPress={()=>router.push('/day-mode')} style={{alignSelf:'flex-start',borderRadius:18,paddingHorizontal:13,minHeight:36,justifyContent:'center',backgroundColor:'#C1C5AB14'}}><Text style={{fontSize:11,color:'#DBC5AE'}}>{DAY_MODE_RULES[mode].label}   ·   Ubah ritme ↗</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={'Bloom-mu · '+bloom.name+'. Buka perjalanan'} onPress={()=>router.push('/journey')} style={{alignItems:'center',marginTop:-26,marginBottom:0}}>
        <LivingBloom stage={bloom.stage} mode={mode} interactionState={interaction} size={300} decorative/>
        <View style={{alignItems:'center',gap:7,marginTop:-12}}><Text style={{fontFamily:serif,fontSize:26,color:'#F2DECD'}}>Your Bloom Today</Text><Text style={{fontSize:12,color:'#C2C4B5'}}>{bloom.name} · Bertumbuh dalam setiap kepedulian</Text></View>
      </Pressable>
      <Card><View style={{flexDirection:'row',gap:14,alignItems:'center'}}><Icon name={interaction==='resting'?'recover':'mind'} color="#DDBCA4"/><View style={{flex:1}}><Body>{interaction==='resting'?'Istirahat juga bagian dari merawat diri.':DAY_MODE_RULES[mode].bloomTitle}</Body><Body muted>{interaction==='resting'?'Bloom-mu tetap utuh. Tak perlu terburu-buru.':DAY_MODE_RULES[mode].bloomText}</Body></View></View></Card>
      {paused ? <Card><Body>Hari ini kita pelan-pelan saja.</Body><Button variant="ghost" title="Temukan dukungan" onPress={()=>router.push('/support')}/></Card> : <>
        <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:8}}><Label>Momen untuk dirimu</Label><Text style={{color:'#B0B7A6',fontSize:11}}>Sesuai ritmemu</Text></View>
        <View style={{gap:10}}>{plan.map(item=><Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.title+', '+(done[item.pillar]?'selesai':'tandai selesai')} accessibilityState={{disabled:done[item.pillar]||busy}} disabled={done[item.pillar]||busy} onPress={()=>complete(item.pillar)} style={({pressed})=>({flexDirection:'row',alignItems:'center',gap:13,padding:16,minHeight:78,borderRadius:21,backgroundColor:done[item.pillar]?'#334537':'#E2E5D411',borderWidth:1,borderColor:'#D3CCAF16',opacity:pressed?.7:1})}>
          <View style={{width:42,height:42,borderRadius:21,backgroundColor:'#D9DDC71A',alignItems:'center',justifyContent:'center'}}><Icon name={item.pillar}/></View>
          <View style={{flex:1,gap:5}}><Text style={{color:'#F4E8DA',fontSize:15}}>{item.title}</Text><Text style={{color:'#BDC2AF',fontSize:11}}>{PILLAR_COPY[item.pillar]} · {done[item.pillar]?'Sudah dirawat':item.time??'Saat kamu siap'}</Text></View><Icon name={done[item.pillar]?'check':'arrow'} size={18}/>
        </Pressable>)}</View>
      </>}
      <View style={{flexDirection:'row',gap:12,marginTop:4}}>
        <Pressable accessibilityRole="button" onPress={()=>router.push('/checkin')} style={{flex:1,padding:18,borderRadius:22,backgroundColor:'#EAD0BF',gap:11}}><Icon name="mind" color="#644F44"/><Text style={{fontSize:14,color:'#283D30'}}>Bagaimana rasamu?</Text><Text style={{fontSize:11,color:'#6F5F53'}}>Check-in sebentar  ↗</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{disabled:busy||restChosen}} disabled={busy||restChosen} onPress={chooseRest} style={{flex:1,padding:18,borderRadius:22,backgroundColor:'#DAD9C3',gap:11}}><Icon name="recover" color="#485C49"/><Text style={{fontSize:14,color:'#283D30'}}>Ruang untuk jeda</Text><Text style={{fontSize:11,color:'#556451'}}>{restChosen?'Istirahat dipilih. Cukup.':'Aku memilih istirahat  ↗'}</Text></Pressable>
      </View>
      <View style={{alignItems:'center',paddingVertical:6}}><Text style={{color:'#AEB39F',fontSize:11}}>Langkah kecil. Dengan penuh perhatian.</Text></View>
    </Screen>
  );
}

