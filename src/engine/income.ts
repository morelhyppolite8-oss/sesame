import { daysInMonth, lastDayOf, monthOf } from './dates';
import { splitCents } from './money';
import type { Cents, ExpectedIncome, IncomeException, ISODate, Month, Receipt } from './types';

export type IncomeState = 'recu' | 'partiel' | 'attente' | 'retard' | 'annule';

export interface IncomeStatus {
  income: ExpectedIncome;
  receivedCount: number;
  received: Cents;
  /** Montant attendu ce mois-ci (exception, puis montant habituel) ; `null` si aucun montant attendu. */
  expected: Cents | null;
  /** Revenu prévu : le réel s'il est reçu, reçu + reste attendu s'il l'est en partie, sinon l'attendu. */
  planned: Cents;
  remaining: Cents;
  state: IncomeState;
  /** Dernier jour où le versement est encore « à l'heure ». */
  dueDate: ISODate;
  /** Versements attendus (détail). */
  installments: Cents[];
  exception?: IncomeException;
  /** Montant habituel en vigueur ce mois-là, hors exception. */
  habitual: Cents | null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** La fenêtre peut chevaucher deux mois (du 25 au 5) : dans le mois budgétaire, on retient sa partie de fin de mois. */
export function dueDateFor(income: ExpectedIncome, month: Month): ISODate {
  const dim = daysInMonth(month);
  if (income.windowStart === undefined || income.windowEnd === undefined) return lastDayOf(month);
  if (income.windowStart <= income.windowEnd) return `${month}-${pad(Math.min(income.windowEnd, dim))}`;
  return lastDayOf(month);
}

export function inWindow(income: ExpectedIncome, date: ISODate): boolean {
  if (income.windowStart === undefined || income.windowEnd === undefined) return true;
  const day = Number(date.slice(8, 10));
  return income.windowStart <= income.windowEnd
    ? day >= income.windowStart && day <= income.windowEnd
    : day >= income.windowStart || day <= income.windowEnd;
}

/** Montant habituel en vigueur un mois donné : dernier changement durable atteint, sinon la valeur par défaut. */
export function habitualAmount(income: ExpectedIncome, month: Month): Cents | null {
  const entries = (income.schedule ?? []).filter((e) => e.from <= month).sort((a, b) => a.from.localeCompare(b.from));
  return entries.length ? entries[entries.length - 1].amount : income.amount;
}

export const exceptionId = (incomeId: string, month: Month) => `${incomeId}:${month}`;

export interface Expected {
  amount: Cents | null;
  installments: Cents[];
  source: 'exception' | 'habituel';
  exception?: IncomeException;
  habitual: Cents | null;
}

/** Montant attendu d'un mois : exception du mois, sinon montant habituel en vigueur, sinon valeur par défaut. */
export function expectedFor(income: ExpectedIncome, month: Month, exceptions: IncomeException[] = []): Expected {
  const habitual = habitualAmount(income, month);
  const n = Math.max(1, income.installments);
  const exception = exceptions.find((e) => e.incomeId === income.id && e.month === month);
  if (exception) {
    const installments = exception.installments ?? splitCents(exception.amount, Array(n).fill(1));
    return { amount: exception.amount, installments, source: 'exception', exception, habitual };
  }
  if (habitual === null) return { amount: null, installments: [], source: 'habituel', habitual };
  return { amount: habitual, installments: splitCents(habitual, Array(n).fill(1)), source: 'habituel', habitual };
}

export function incomeStatuses(
  incomes: ExpectedIncome[],
  receipts: Receipt[],
  month: Month,
  today: ISODate,
  exceptions: IncomeException[] = [],
): IncomeStatus[] {
  return incomes
    .filter((i) => !i.archived)
    .map((income) => {
      const mine = receipts.filter((r) => r.month === month && r.incomeId === income.id && !r.internal);
      const received = mine.reduce((a, r) => a + r.amount, 0);
      const count = mine.length;
      const dueDate = dueDateFor(income, month);
      const exp = expectedFor(income, month, exceptions);
      const active = exp.installments.filter((a) => a > 0);
      let planned: Cents;
      let complete: boolean;
      if (exp.amount === null) {
        planned = received;
        complete = count > 0;
      } else if (count > 0 && (count >= active.length || received >= exp.amount * 0.95)) {
        // Reçu : le montant réel remplace l'attendu, qu'il soit inférieur ou supérieur.
        planned = received;
        complete = true;
      } else if (count > 0) {
        planned = received + active.slice(count).reduce((a, b) => a + b, 0);
        complete = false;
      } else {
        planned = exp.amount;
        complete = exp.amount === 0;
      }
      let state: IncomeState;
      if (exp.amount === 0 && count === 0) state = 'annule';
      else if (exp.amount === null) state = count > 0 ? 'recu' : 'attente';
      else if (complete) state = 'recu';
      else if (today > dueDate) state = 'retard';
      else state = count > 0 ? 'partiel' : 'attente';
      return {
        income,
        receivedCount: count,
        received,
        expected: exp.amount,
        planned,
        remaining: complete ? 0 : Math.max(0, planned - received),
        state,
        dueDate,
        installments: exp.installments,
        exception: exp.exception,
        habitual: exp.habitual,
      };
    });
}

export interface MonthIncomeSummary {
  received: Cents;
  expected: Cents;
  remaining: Cents;
  /** Revenu prévu du mois (réel + reste attendu + encaissements hors revenus attendus). */
  planned: Cents;
}

/** Encaissements du mois qui ne correspondent à aucun revenu attendu actif (commissions libres, renforts…). */
export function extraReceipts(incomes: ExpectedIncome[], receipts: Receipt[], month: Month): Receipt[] {
  const active = new Set(incomes.filter((i) => !i.archived).map((i) => i.id));
  return receipts.filter((r) => r.month === month && (!r.incomeId || !active.has(r.incomeId) || r.internal));
}

export function monthIncomeSummary(statuses: IncomeStatus[], receipts: Receipt[], month: Month, incomes?: ExpectedIncome[]): MonthIncomeSummary {
  const received = receipts.filter((r) => r.month === month && !r.internal).reduce((a, r) => a + r.amount, 0);
  const expected = statuses.reduce((a, s) => a + (s.expected ?? 0), 0);
  const remaining = statuses.reduce((a, s) => a + s.remaining, 0);
  const extra = extraReceipts(incomes ?? statuses.map((s) => s.income), receipts, month).reduce((a, r) => a + r.amount, 0);
  return { received, expected, remaining, planned: statuses.reduce((a, s) => a + s.planned, 0) + extra };
}

/** Revenu prévu d'un mois, selon l'ordre de priorité : reçu, exception du mois, montant habituel, valeur par défaut. */
export function plannedIncome(incomes: ExpectedIncome[], exceptions: IncomeException[], receipts: Receipt[], month: Month): Cents {
  const statuses = incomeStatuses(incomes, receipts, month, '0000-00-00', exceptions);
  return monthIncomeSummary(statuses, receipts, month, incomes).planned;
}

/**
 * Classe les revenus attendus du plus probable au moins probable pour un montant et une date.
 * Critères : pas encore reçu en entier, date dans la fenêtre, montant proche d'un versement attendu.
 */
export function suggestIncome(
  incomes: ExpectedIncome[],
  receipts: Receipt[],
  amount: Cents,
  date: ISODate,
  exceptions: IncomeException[] = [],
): ExpectedIncome[] {
  const month = monthOf(date);
  const scored = incomes
    .filter((i) => !i.archived)
    .map((income) => {
      const mine = receipts.filter((r) => r.month === month && r.incomeId === income.id);
      const received = mine.reduce((a, r) => a + r.amount, 0);
      const expected = expectedFor(income, month, exceptions).amount ?? habitualAmount(income, month);
      let score = 0;
      if (expected !== null && expected > 0) {
        const pending = expected - received;
        const complete = mine.length >= income.installments || pending <= expected * 0.05;
        if (complete) score -= 50;
        else score += 40;
        const perInstallment = expected / Math.max(1, income.installments);
        const candidates = [perInstallment, pending, expected].filter((c) => c > 0);
        const closeness = Math.min(...candidates.map((c) => Math.abs(amount - c) / c));
        if (amount > 0) score += Math.max(0, 50 - closeness * 100);
        if (income.windowStart !== undefined && !complete) score += inWindow(income, date) ? 25 : -10;
      } else {
        score += 12;
      }
      return { income, score };
    });
  return scored.sort((a, b) => b.score - a.score).map((s) => s.income);
}

export interface IncomeRise {
  income: ExpectedIncome;
  newAmount: Cents;
  rise: Cents;
}

/** Hausse récurrente : les deux derniers versements dépassent le montant habituel d'au moins 10 € et 1 %, hors mois avec exception. */
export function detectIncomeRise(incomes: ExpectedIncome[], receipts: Receipt[], exceptions: IncomeException[] = []): IncomeRise[] {
  const out: IncomeRise[] = [];
  for (const income of incomes) {
    if (income.archived || income.installments !== 1) continue;
    const last = receipts
      .filter((r) => r.incomeId === income.id && !exceptions.some((e) => e.incomeId === income.id && e.month === r.month))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 2);
    if (last.length < 2) continue;
    const habitual = habitualAmount(income, last[0].month);
    if (habitual === null) continue;
    const threshold = Math.max(1000, Math.round(habitual * 0.01));
    const minimum = Math.min(...last.map((r) => r.amount));
    if (minimum - habitual >= threshold) out.push({ income, newAmount: minimum, rise: minimum - habitual });
  }
  return out;
}

/**
 * Changement durable : nouveau montant habituel à partir d'un mois, sans toucher aux mois précédents.
 * La valeur par défaut suit le montant en vigueur le mois en cours.
 */
export function withScheduleChange(income: ExpectedIncome, from: Month, amount: Cents, currentMonth: Month): ExpectedIncome {
  const base = income.schedule?.length ? income.schedule : [{ from: '1900-01', amount: income.amount ?? 0 }];
  const schedule = [...base.filter((e) => e.from !== from), { from, amount }].sort((a, b) => a.from.localeCompare(b.from));
  const next: ExpectedIncome = { ...income, schedule };
  next.amount = habitualAmount(next, currentMonth);
  return next;
}

/** Écart notable entre reçu et attendu : plus de 5 % ou plus de 20 €. */
export const significantVariance = (received: Cents, expected: Cents): boolean =>
  Math.abs(received - expected) > expected * 0.05 || Math.abs(received - expected) >= 2000;
