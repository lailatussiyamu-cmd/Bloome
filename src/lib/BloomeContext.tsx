import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { pickApi, type BloomeApi } from './api';

const Ctx = createContext<BloomeApi | null>(null);

export function BloomeProvider({ children }: { children: ReactNode }) {
  const api = useMemo(() => pickApi(), []);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useApi(): BloomeApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('useApi must be used inside BloomeProvider');
  return api;
}
