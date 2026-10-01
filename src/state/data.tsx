import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { buildLedger, configResolver, loadSnapshot, type Snapshot } from '../db/ledger';
import { monthOf, toISODate } from '../engine/dates';
import { applySubscriptions } from '../engine/subscriptions';
import type { LedgerOutput } from '../engine/recompute';
import type { Account, BudgetConfig, Envelope, ISODate, Month } from '../engine/types';

export interface AppData {
  snap: Snapshot;
  ledger: LedgerOutput;
  today: ISODate;
  configFor: (month: Month) => BudgetConfig;
  account: (id: string | null | undefined) => Account | undefined;
  accountName: (id: string | null | undefined) => string;
  envelope: (id: string) => Envelope | undefined;
  /** Enveloppes du moment, objectif Abonnements calculé. */
  envelopesNow: Envelope[];
  envelopeName: (id: string) => string;
}

const DataContext = createContext<AppData | null>(null);
const LoadingContext = createContext<'loading' | 'empty' | 'ready'>('loading');

function useToday(): ISODate {
  const [today, setToday] = useState(() => toISODate(new Date()));
  useEffect(() => {
    const refresh = () => setToday(toISODate(new Date()));
    const id = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return today;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const snap = useLiveQuery(loadSnapshot, [], undefined);
  const today = useToday();
  const value = useMemo<AppData | null>(() => {
    if (!snap) return null;
    const ledger = buildLedger(snap);
    const accounts = new Map(snap.accounts.map((a) => [a.id, a]));
    const envelopes = new Map(snap.envelopes.map((e) => [e.id, e]));
    return {
      snap,
      ledger,
      today,
      configFor: configResolver(snap),
      account: (id) => (id ? accounts.get(id) : undefined),
      accountName: (id) => (id ? accounts.get(id)?.name ?? 'Compte supprimé' : 'Selon les règles'),
      envelope: (id) => envelopes.get(id),
      envelopesNow: applySubscriptions(snap.envelopes, snap.subscriptions, monthOf(today)),
      envelopeName: (id) => envelopes.get(id)?.name ?? 'Enveloppe supprimée',
    };
  }, [snap, today]);
  const status = snap === undefined ? 'loading' : snap === null ? 'empty' : 'ready';
  return (
    <LoadingContext.Provider value={status}>
      <DataContext.Provider value={value}>{children}</DataContext.Provider>
    </LoadingContext.Provider>
  );
}

export function useData(): AppData {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('Données non chargées');
  return ctx;
}

export const useDataStatus = () => useContext(LoadingContext);
