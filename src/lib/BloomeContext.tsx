import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { Body, Screen, Title } from '../components/ui';
import { pickApi, type BloomeApi } from './api';

const Ctx = createContext<BloomeApi | null>(null);

export function BloomeProvider({ children }: { children: ReactNode }) {
  const api = useMemo(() => pickApi(), []);
  if (!api) {
    // Release build without Supabase settings: stop here rather than keep health data unprotected on the phone.
    return (
      <Screen>
        <Title>Bloome belum siap</Title>
        <Body>Aplikasi ini belum tersambung ke layanan Bloome, jadi belum bisa dipakai dengan aman. Silakan perbarui aplikasi atau coba lagi nanti.</Body>
      </Screen>
    );
  }
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useApi(): BloomeApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('useApi must be used inside BloomeProvider');
  return api;
}
