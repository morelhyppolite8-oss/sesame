import { lastDayOf } from './dates';
import type { Account, AccountType, Cents, Envelope, Flow, ISODate, Month, ProvisionUse, Reading } from './types';

/** Les comptes courants ne sont pas projetés : on ne suit pas les dépenses, seul le dernier relevé fait foi. */
export const isProjected = (type: AccountType): boolean => type !== 'courant' && type !== 'revolut';

export const isInvestment = (type: AccountType): boolean => type === 'pea' || type === 'av' || type === 'cto';

export function latestReading(accountId: string, date: ISODate, readings: Reading[]): Reading | undefined {
  let best: Reading | undefined;
  for (const r of readings) {
    if (r.accountId !== accountId || r.date > date) continue;
    if (!best || r.date >= best.date) best = r;
  }
  return best;
}

/** Solde projeté : dernier relevé à cette date, plus les mouvements prévus depuis. */
export function balanceAt(
  accountId: string,
  date: ISODate,
  readings: Reading[],
  flows: Flow[],
  projected = true,
): Cents {
  const reading = latestReading(accountId, date, readings);
  const base = reading?.value ?? 0;
  if (!projected) return base;
  const since = reading?.date ?? '';
  let total = base;
  for (const f of flows) {
    if (f.accountId === accountId && f.date > since && f.date <= date) total += f.amount;
  }
  return total;
}

/** Montant versé cumulé : versé du dernier relevé plus les versements prévus depuis. */
export function investedAt(accountId: string, date: ISODate, readings: Reading[], flows: Flow[]): Cents {
  const reading = latestReading(accountId, date, readings);
  const base = reading ? (reading.invested ?? reading.value) : 0;
  const since = reading?.date ?? '';
  let total = base;
  for (const f of flows) {
    if (f.accountId === accountId && f.date > since && f.date <= date) total += f.amount;
  }
  return total;
}

export interface AccountSnapshot {
  account: Account;
  value: Cents;
  invested: Cents;
  gain: Cents;
  lastReadingDate?: ISODate;
}

export function accountSnapshot(account: Account, date: ISODate, readings: Reading[], flows: Flow[]): AccountSnapshot {
  const projected = isProjected(account.type);
  const value = balanceAt(account.id, date, readings, flows, projected);
  const invested = isInvestment(account.type) ? investedAt(account.id, date, readings, flows) : value;
  return {
    account,
    value,
    invested,
    gain: value - invested,
    lastReadingDate: latestReading(account.id, date, readings)?.date,
  };
}

export interface NetWorthPoint {
  month: Month;
  total: Cents;
  byAccount: Record<string, Cents>;
}

export function netWorthSeries(accounts: Account[], readings: Reading[], flows: Flow[], months: Month[]): NetWorthPoint[] {
  return months.map((month) => {
    const date = lastDayOf(month);
    const byAccount: Record<string, Cents> = {};
    let total = 0;
    for (const a of accounts) {
      const v = balanceAt(a.id, date, readings, flows, isProjected(a.type));
      byAccount[a.id] = v;
      total += v;
    }
    return { month, total, byAccount };
  });
}

export type TaxWrapper = 'livrets' | 'pea' | 'av' | 'cto' | 'courants';

export const wrapperOf = (type: AccountType): TaxWrapper =>
  type === 'livretA' || type === 'ldds' ? 'livrets'
    : type === 'pea' ? 'pea'
      : type === 'av' ? 'av'
        : type === 'cto' ? 'cto'
          : 'courants';

export const wrapperLabels: Record<TaxWrapper, string> = {
  livrets: 'Livrets réglementés',
  pea: 'PEA',
  av: 'Assurance-vie',
  cto: 'Compte-titres',
  courants: 'Comptes courants',
};

/** Solde d'une provision : solde de départ + financements − utilisations. */
export function provisionBalance(
  envelope: Envelope,
  allocatedTotal: Cents,
  uses: ProvisionUse[],
  excludeUseId?: string,
): Cents {
  const used = uses
    .filter((u) => u.envelopeId === envelope.id && u.id !== excludeUseId)
    .reduce((a, u) => a + u.amount, 0);
  return (envelope.openingBalance ?? 0) + allocatedTotal - used;
}
