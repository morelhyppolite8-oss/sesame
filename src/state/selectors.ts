import { accountBalance, provisionBalanceOf } from '../db/derive';
import { activeEnvelopes } from '../engine/allocation';
import { accountSnapshot } from '../engine/balances';
import { addMonths, monthOf } from '../engine/dates';
import { computeAlerts, computeHealth, missingFunding, savedInMonth, savingsTarget, type Alert, type HealthIndicators } from '../engine/health';
import { incomeStatuses, monthIncomeSummary, type IncomeStatus, type MonthIncomeSummary } from '../engine/income';
import { planForMonth, type MonthLedger } from '../engine/recompute';
import type { MonthPlan } from '../engine/plan';
import { monthTargetsMap } from '../db/ledger';
import { spendingByEnvelope } from '../engine/revolutCsv';
import type { Cents, Envelope, Month, Receipt, Transfer } from '../engine/types';
import type { AppData } from './data';

/** Plan d'un mois : revenu prévu et objectifs adaptés (le même calcul que le recalcul des répartitions). */
export function monthPlan(data: AppData, month: Month, override?: { incomeId: string; amount: Cents }): MonthPlan | null {
  const exceptions = override
    ? [
        ...data.snap.incomeExceptions.filter((e) => !(e.incomeId === override.incomeId && e.month === month)),
        { id: 'simulation', incomeId: override.incomeId, month, amount: override.amount },
      ]
    : data.snap.incomeExceptions;
  // En simulation, on ignore l'encaissement déjà reçu de ce revenu pour voir l'effet du montant choisi.
  const receipts = override ? data.snap.receipts.filter((r) => !(r.month === month && r.incomeId === override.incomeId)) : data.snap.receipts;
  return planForMonth(
    { incomes: data.snap.incomes, incomeExceptions: exceptions, monthTargets: monthTargetsMap(data.snap.monthTargets), receipts },
    data.configFor(month),
    month,
  );
}

export interface ForecastMonth {
  month: Month;
  plan: MonthPlan;
  statuses: IncomeStatus[];
  hasException: boolean;
}

/** Prévisions sur 12 mois glissants à partir du mois en cours. */
export function forecastView(data: AppData, count = 12): ForecastMonth[] {
  const start = monthOf(data.today);
  return Array.from({ length: count }, (_, k) => {
    const month = addMonths(start, k);
    return {
      month,
      plan: monthPlan(data, month)!,
      statuses: incomeStatuses(data.snap.incomes, data.snap.receipts, month, data.today, data.snap.incomeExceptions),
      hasException: data.snap.incomeExceptions.some((e) => e.month === month),
    };
  });
}

export function monthLedger(data: AppData, month: Month): MonthLedger {
  const existing = data.ledger.months[month];
  if (existing) return existing;
  const plan = monthPlan(data, month);
  return {
    month,
    config: plan?.config ?? data.configFor(month),
    ...(plan ? { plan } : {}),
    carryIn: {},
    funded: {},
    received: 0,
    receiptIds: [],
  };
}

export interface EnvelopeProgress {
  envelope: Envelope;
  funded: Cents;
  target: Cents;
  carryIn: Cents;
}

export interface MonthView {
  month: Month;
  ledger: MonthLedger;
  statuses: IncomeStatus[];
  summary: MonthIncomeSummary;
  envelopes: EnvelopeProgress[];
  receipts: Receipt[];
  pending: Transfer[];
  missing: Cents;
  saved: Cents;
  savingsTarget: Cents;
}

export function monthView(data: AppData, month: Month): MonthView {
  const ledger = monthLedger(data, month);
  const statuses = incomeStatuses(data.snap.incomes, data.snap.receipts, month, data.today, data.snap.incomeExceptions).sort(
    (a, b) => (b.expected ?? -1) - (a.expected ?? -1),
  );
  const summary = monthIncomeSummary(statuses, data.snap.receipts, month, data.snap.incomes);
  const envelopes = activeEnvelopes(ledger.config).map((envelope) => ({
    envelope,
    funded: ledger.funded[envelope.id] ?? 0,
    target: envelope.target,
    carryIn: ledger.carryIn[envelope.id] ?? 0,
  }));
  const receipts = data.snap.receipts
    .filter((r) => r.month === month)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const pending = data.snap.transfers.filter((t) => !t.done && t.month === month).sort((a, b) => a.date.localeCompare(b.date));
  return {
    month,
    ledger,
    statuses,
    summary,
    envelopes,
    receipts,
    pending,
    missing: missingFunding(ledger).reduce((a, m) => a + m.missing, 0),
    saved: savedInMonth(ledger),
    savingsTarget: savingsTarget(ledger),
  };
}

export const pendingTransfers = (data: AppData): Transfer[] =>
  data.snap.transfers.filter((t) => !t.done).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);

export interface CushionView {
  accountId: string;
  balance: Cents;
  target: Cents;
  phase: 1 | 2;
}

export function cushionView(data: AppData): CushionView {
  const rules = data.snap.settings.rules.savings;
  const balance = accountBalance(rules.cushionAccountId, data.snap, data.ledger, data.today);
  return { accountId: rules.cushionAccountId, balance, target: rules.cushionTarget, phase: balance >= rules.cushionTarget ? 2 : 1 };
}

export function healthView(data: AppData): HealthIndicators {
  const cushion = cushionView(data);
  return computeHealth({
    ledger: data.ledger,
    transfers: data.snap.transfers,
    reviews: data.snap.reviews,
    readings: data.snap.readings,
    today: data.today,
    cushion: cushion.balance,
    cushionTarget: cushion.target,
  });
}

export function alertsView(data: AppData): Alert[] {
  const cushion = cushionView(data);
  const month = monthOf(data.today);
  const imported = data.snap.bankTransactions.some((t) => t.month === month)
    ? spendingByEnvelope(data.snap.bankTransactions, month)
    : undefined;
  return computeAlerts({
    today: data.today,
    ledger: data.ledger,
    incomes: data.snap.incomes,
    receipts: data.snap.receipts,
    transfers: data.snap.transfers,
    reviews: data.snap.reviews,
    accounts: data.snap.accounts,
    readings: data.snap.readings,
    cushion: cushion.balance,
    cushionTarget: cushion.target,
    cushionCelebrated: data.snap.settings.cushionCelebrated,
    lastBackupAt: data.snap.settings.lastBackupAt,
    installedAt: data.snap.settings.installedAt,
    dismissed: data.snap.settings.dismissedAlerts,
    importedSpending: imported,
    accountName: (id) => withArticleName(data, id),
    envelopeName: data.envelopeName,
    subscriptions: data.snap.subscriptions,
    subscriptionsFunding: subscriptionsFunding(data, month),
    incomeExceptions: data.snap.incomeExceptions,
    currentPlan: monthPlan(data, month),
    upcomingPlans: [1, 2, 3].map((k) => ({ month: addMonths(month, k), plan: monthPlan(data, addMonths(month, k)) })),
    cushionAccountName: withArticleName(data, data.snap.settings.rules.savings.cushionAccountId),
  });
}

/** Financement de l'enveloppe Abonnements pour un mois. */
export function subscriptionsFunding(data: AppData, month: Month): { funded: Cents; target: Cents } | undefined {
  const ledger = monthLedger(data, month);
  const env = ledger.config.envelopes.find((e) => e.auto === 'subscriptions' && !e.archived);
  if (!env) return undefined;
  return { funded: ledger.funded[env.id] ?? 0, target: env.target };
}

function withArticleName(data: AppData, id: string): string {
  const name = data.accountName(id);
  return /^(Compte|Livret|LDDS|PEA|CTO)/.test(name) ? `le ${name}` : name;
}

export function provisionsView(data: AppData) {
  return data.snap.envelopes
    .filter((e) => e.kind === 'provision' && !e.archived)
    .sort((a, b) => a.priority - b.priority)
    .map((envelope) => ({
      envelope,
      balance: provisionBalanceOf(envelope, data.snap, data.ledger),
      uses: data.snap.provisionUses.filter((u) => u.envelopeId === envelope.id).sort((a, b) => b.date.localeCompare(a.date)),
    }));
}

export function accountsView(data: AppData) {
  return data.snap.accounts
    .filter((a) => !a.archived)
    .sort((a, b) => a.order - b.order)
    .map((a) => accountSnapshot(a, data.today, data.snap.readings, data.ledger.flows));
}

/** Épargne des derniers mois (pour les rythmes des objectifs). */
export function recentMonths(data: AppData, count = 6): Month[] {
  const current = monthOf(data.today);
  return Array.from({ length: count }, (_, i) => addMonths(current, i - count + 1));
}
