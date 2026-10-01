import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import type { PublicBloom } from '../domain/bloom';
import type { DayMode } from '../domain/dayMode';
import type { Profile } from './api';
import { useApi } from './BloomeContext';

export function useBloomSnapshot() {
  const api = useApi();
  const [bloom, setBloom] = useState<PublicBloom | null>(null);
  const [mode, setMode] = useState<DayMode>('standard');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([api.getBloom(), api.appOpen(), api.getProfile()]).then(([b, open, p]) => {
      if (!active) return;
      if (!b || !p) { router.replace('/'); return; }
      setBloom(b); setMode(open.dayMode ?? 'standard'); setProfile(p);
    }).catch(() => { if (active) setError('Bloom belum dapat dimuat. Silakan coba lagi.'); });
    return () => { active = false; };
  }, [api]);
  return { bloom, mode, profile, error };
}
