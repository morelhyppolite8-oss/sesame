import { savedInMonth, savingsRate, savingsTarget } from './health';
import type { LedgerOutput, MonthLedger } from './recompute';
import type { Cents, Goal, Month } from './types';

export interface MonthStat {
  month: Month;
  received: Cents;
  saved: Cents;
  rate: number;
  targetMet: boolean;
}

export interface Retrospective {
  year: number;
  months: MonthStat[];
  totalReceived: Cents;
  totalSaved: Cents;
  averageRate: number;
  best?: MonthStat;
  worst?: MonthStat;
  monthsOnTarget: number;
  leftoversSaved: Cents;
  goalsReached: Goal[];
}

export function retrospective(ledger: LedgerOutput, goals: Goal[], year: number): Retrospective {
  const months: MonthStat[] = Object.values(ledger.months)
    .filter((m: MonthLedger) => m.month.startsWith(`${year}-`) && m.received > 0)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((m) => ({
      month: m.month,
      received: m.received,
      saved: savedInMonth(m),
      rate: savingsRate(m),
      targetMet: savedInMonth(m) >= savingsTarget(m) && savingsTarget(m) > 0,
    }));
  const totalReceived = months.reduce((a, m) => a + m.received, 0);
  const totalSaved = months.reduce((a, m) => a + m.saved, 0);
  const byRate = [...months].sort((a, b) => b.rate - a.rate || b.saved - a.saved);
  const leftoversSaved = Object.values(ledger.months)
    .filter((m) => m.month.startsWith(`${year}-`))
    .reduce((a, m) => a + (m.leftovers?.toSavings ?? 0), 0);
  return {
    year,
    months,
    totalReceived,
    totalSaved,
    averageRate: totalReceived > 0 ? totalSaved / totalReceived : 0,
    best: byRate[0],
    worst: byRate.length > 1 ? byRate[byRate.length - 1] : undefined,
    monthsOnTarget: months.filter((m) => m.targetMet).length,
    leftoversSaved,
    goalsReached: goals.filter((g) => g.achievedAt?.startsWith(`${year}-`)),
  };
}
