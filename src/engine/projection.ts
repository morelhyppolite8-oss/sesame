import { balanceAt, investedAt } from './balances';
import { addYears, daysBetween } from './dates';
import { formatEUR0 } from './money';
import type { Account, Cents, Flow, ISODate, Reading } from './types';

export interface SimulationInput {
  initial: Cents;
  monthly: Cents;
  /** Rendement annuel hypothétique, ex. 0.05 pour 5 %. */
  annualRate: number;
  years: number;
}

export interface SimulationPoint {
  year: number;
  contributed: Cents;
  value: Cents;
  gains: Cents;
}

/** Capitalisation mensuelle, versement en fin de mois. Hypothèse pédagogique, sans garantie. */
export function simulate(input: SimulationInput): SimulationPoint[] {
  const monthlyRate = Math.pow(1 + input.annualRate, 1 / 12) - 1;
  let value = input.initial;
  let contributed = input.initial;
  const points: SimulationPoint[] = [{ year: 0, contributed, value, gains: 0 }];
  for (let m = 1; m <= Math.round(input.years * 12); m++) {
    value = value * (1 + monthlyRate) + input.monthly;
    contributed += input.monthly;
    if (m % 12 === 0) {
      const v = Math.round(value);
      points.push({ year: m / 12, contributed, value: v, gains: v - contributed });
    }
  }
  return points;
}

export interface Milestone {
  id: string;
  date?: ISODate;
  title: string;
  detail: string;
  /** Progression vers l'échéance, entre 0 et 1. */
  ratio: number;
  daysLeft?: number;
}

const fmtYears = (n: number) => `${n} an${n > 1 ? 's' : ''}`;

export function milestones(accounts: Account[], readings: Reading[], flows: Flow[], today: ISODate): Milestone[] {
  const out: Milestone[] = [];
  for (const a of accounts) {
    if (a.archived) continue;
    if ((a.type === 'pea' || a.type === 'av') && a.openedAt) {
      const years = a.type === 'pea' ? 5 : 8;
      const date = addYears(a.openedAt, years);
      const total = daysBetween(a.openedAt, date);
      const elapsed = daysBetween(a.openedAt, today);
      out.push({
        id: `age-${a.id}`,
        date,
        title: a.type === 'pea' ? `${a.name} : ${fmtYears(5)}` : `${a.name} : ${fmtYears(8)}`,
        detail: a.type === 'pea'
          ? 'Les retraits deviennent possibles sans clôture, et les gains ne supportent plus que les prélèvements sociaux.'
          : "Les gains retirés bénéficient d'un abattement annuel (4 600 € pour une personne seule).",
        ratio: Math.min(1, Math.max(0, elapsed / total)),
        daysLeft: Math.max(0, daysBetween(today, date)),
      });
    } else if ((a.type === 'pea' || a.type === 'av') && !a.openedAt) {
      out.push({
        id: `age-${a.id}`,
        title: `${a.name} : date d'ouverture à saisir`,
        detail: "Renseigne-la dans les Réglages pour calculer l'échéance.",
        ratio: 0,
      });
    }
    if (a.ceiling) {
      const balance = balanceAt(a.id, today, readings, flows);
      out.push({
        id: `ceiling-${a.id}`,
        title: `Plafond du ${a.name}`,
        detail: `Encore ${formatEUR0(Math.max(0, a.ceiling - balance))} de marge de versement.`,
        ratio: Math.min(1, Math.max(0, balance / a.ceiling)),
      });
    }
    if (a.depositCeiling) {
      const invested = investedAt(a.id, today, readings, flows);
      out.push({
        id: `deposit-${a.id}`,
        title: `Plafond de versements du ${a.name}`,
        detail: `Versé : ${formatEUR0(invested)} sur ${formatEUR0(a.depositCeiling)}.`,
        ratio: Math.min(1, Math.max(0, invested / a.depositCeiling)),
      });
    }
  }
  return out.sort((x, y) => (x.date ?? '9999').localeCompare(y.date ?? '9999'));
}
