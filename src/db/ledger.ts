import { toISODate } from '../engine/dates';
import { recomputeLedger, type LedgerOutput } from '../engine/recompute';
import { applySubscriptions } from '../engine/subscriptions';
import type { BankTransaction, CsvRule } from '../engine/revolutCsv';
import type {
  Account,
  BudgetConfig,
  Envelope,
  ExpectedIncome,
  Goal,
  IncomeException,
  Month,
  MonthTarget,
  ProvisionUse,
  Reading,
  Receipt,
  Review,
  Subscription,
  Transfer,
} from '../engine/types';
import { db, type BudgetSnapshot, type Settings } from './schema';

export interface Snapshot {
  settings: Settings;
  accounts: Account[];
  readings: Reading[];
  envelopes: Envelope[];
  incomes: ExpectedIncome[];
  receipts: Receipt[];
  transfers: Transfer[];
  provisionUses: ProvisionUse[];
  goals: Goal[];
  reviews: Review[];
  budgets: BudgetSnapshot[];
  csvRules: CsvRule[];
  bankTransactions: BankTransaction[];
  subscriptions: Subscription[];
  incomeExceptions: IncomeException[];
  monthTargets: MonthTarget[];
}

export async function loadSnapshot(): Promise<Snapshot | null> {
  const settings = await db.settings.get('settings');
  if (!settings) return null;
  const [accounts, readings, envelopes, incomes, receipts, transfers, provisionUses, goals, reviews, budgets, csvRules, bankTransactions, subscriptions, incomeExceptions, monthTargets] =
    await Promise.all([
      db.accounts.orderBy('order').toArray(),
      db.readings.toArray(),
      db.envelopes.orderBy('priority').toArray(),
      db.incomes.toArray(),
      db.receipts.toArray(),
      db.transfers.toArray(),
      db.provisionUses.toArray(),
      db.goals.toArray(),
      db.reviews.toArray(),
      db.budgets.toArray(),
      db.csvRules.toArray(),
      db.bankTransactions.toArray(),
      db.subscriptions.toArray(),
      db.incomeExceptions.toArray(),
      db.monthTargets.toArray(),
    ]);
  return { settings, accounts, readings, envelopes, incomes, receipts, transfers, provisionUses, goals, reviews, budgets, csvRules, bankTransactions, subscriptions, incomeExceptions, monthTargets };
}

/** Configuration du moment, pour un mois donné : l'enveloppe Abonnements suit les abonnements actifs. */
export const currentConfig = (
  s: Pick<Snapshot, 'envelopes' | 'settings' | 'subscriptions'>,
  month: Month = toISODate(new Date()).slice(0, 7),
): BudgetConfig => ({
  envelopes: applySubscriptions(s.envelopes, s.subscriptions, month),
  rules: s.settings.rules,
});

export function configResolver(s: Pick<Snapshot, 'envelopes' | 'settings' | 'budgets' | 'subscriptions'>): (month: Month) => BudgetConfig {
  const byMonth = new Map(s.budgets.map((b) => [b.month, b.config]));
  const cache = new Map<Month, BudgetConfig>();
  return (month) => {
    const frozen = byMonth.get(month);
    if (frozen) return frozen;
    if (!cache.has(month)) cache.set(month, currentConfig(s, month));
    return cache.get(month)!;
  };
}

/** Objectifs fixés à la main, par mois puis par enveloppe. */
export function monthTargetsMap(targets: MonthTarget[]): Record<Month, Record<string, number>> {
  const out: Record<Month, Record<string, number>> = {};
  for (const t of targets) (out[t.month] ??= {})[t.envelopeId] = t.target;
  return out;
}

export function buildLedger(s: Snapshot): LedgerOutput {
  const configFor = configResolver(s);
  const names = new Map(s.envelopes.map((e) => [e.id, e.name]));
  return recomputeLedger({
    receipts: s.receipts,
    reviews: s.reviews,
    provisionUses: s.provisionUses,
    readings: s.readings,
    configFor,
    incomes: s.incomes,
    incomeExceptions: s.incomeExceptions,
    monthTargets: monthTargetsMap(s.monthTargets),
    envelopeLabel: (id, month) => configFor(month).envelopes.find((e) => e.id === id)?.name ?? names.get(id) ?? id,
  });
}
