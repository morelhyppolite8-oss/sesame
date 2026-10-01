import { activeEnvelopes } from './allocation';
import { daysInMonth, parseISODate } from './dates';
import { formatEUR, largestRemainder } from './money';
import type { BudgetConfig, Cents, Envelope, EnvelopeLevel, IncomeReason, Month } from './types';

export const LEVEL_LABELS: Record<EnvelopeLevel, string> = {
  essentiel: 'Essentiel',
  important: 'Important',
  flexible: 'Flexible',
};

export const REASON_LABELS: Record<IncomeReason, string> = {
  prorata: 'Prorata d’entrée',
  'sans-solde': 'Congé sans solde',
  absence: 'Absence',
  maladie: 'Arrêt maladie',
  prime: 'Prime',
  regularisation: 'Régularisation',
  'ne-viendra-pas': 'Ne viendra pas',
  autre: 'Autre',
};

/** Niveau d'une enveloppe (valeur enregistrée, sinon d'après son type). */
export function levelOf(env: Envelope): EnvelopeLevel {
  if (env.level) return env.level;
  if (env.auto === 'subscriptions' || env.id === 'courses' || env.id === 'logement' || env.id === 'fixe') return 'essentiel';
  return env.kind === 'depense' ? 'flexible' : 'important';
}

export function floorOf(env: Envelope): Cents {
  return env.floor ?? 0;
}

export type PlanStatus = 'normal' | 'serre' | 'confortable';

export interface PlanItem {
  envelope: Envelope;
  level: EnvelopeLevel;
  floor: Cents;
  /** Objectif normal (ou fixé à la main pour ce mois). */
  normal: Cents;
  adapted: Cents;
  /** Objectif fixé à la main pour ce mois. */
  fixed: boolean;
}

export interface MonthPlan {
  /** Revenu prévu P. */
  planned: Cents;
  /** Budget normal T. */
  normal: Cents;
  /** P − T : négatif si le mois est serré. */
  delta: Cents;
  status: PlanStatus;
  items: PlanItem[];
  /** Ce qui manque pour couvrir l'essentiel. */
  essentialMissing: Cents;
  /** Configuration du mois avec les objectifs adaptés. */
  config: BudgetConfig;
}

export const planStatus = (delta: Cents): PlanStatus => (delta <= -100 ? 'serre' : delta >= 100 ? 'confortable' : 'normal');

/**
 * Adapte les objectifs du mois au revenu prévu P.
 * Si P ≥ T, rien ne change (le surplus suivra la règle de surplus).
 * Sinon le déficit est absorbé : Flexibles puis Importants jusqu'à leurs planchers (au prorata de leur marge),
 * puis Flexibles puis Importants jusqu'à 0 €. Les Essentiels ne sont jamais réduits ; s'ils ne sont pas couverts,
 * ils sont financés par ordre de priorité. Arrondi à l'euro (plus fort reste) : la somme vaut exactement P.
 */
export function adaptBudget(config: BudgetConfig, planned: Cents, overrides: Record<string, Cents> = {}): MonthPlan {
  const envs = activeEnvelopes(config);
  const normals = envs.map((e) => overrides[e.id] ?? e.target);
  const T = normals.reduce((a, b) => a + b, 0);
  const delta = planned - T;
  let adapted: Cents[] = [...normals];
  let essentialMissing = 0;

  if (planned < T) {
    const exact = normals.map((v) => v);
    let deficit = T - planned;
    const stage = (level: EnvelopeLevel, toFloor: boolean) => {
      if (deficit <= 0) return;
      const idx = envs.map((_, i) => i).filter((i) => levelOf(envs[i]) === level && overrides[envs[i].id] === undefined);
      const margins = idx.map((i) => Math.max(0, exact[i] - (toFloor ? Math.min(floorOf(envs[i]), normals[i]) : 0)));
      const total = margins.reduce((a, b) => a + b, 0);
      if (total <= 0) return;
      const cut = Math.min(deficit, total);
      idx.forEach((i, k) => {
        exact[i] -= (margins[k] * cut) / total;
      });
      deficit -= cut;
    };
    stage('flexible', true);
    stage('important', true);
    stage('flexible', false);
    stage('important', false);
    if (deficit > 1e-6) {
      // L'essentiel n'est pas couvert : on le finance par ordre de priorité avec ce qu'il y a.
      essentialMissing = Math.round(deficit);
      let available = planned;
      for (let i = 0; i < envs.length; i++) {
        const give = Math.min(exact[i], Math.max(0, available));
        exact[i] = give;
        available -= give;
      }
    }
    const euroTotal = Math.floor(Math.max(0, planned) / 100);
    const cents = Math.max(0, planned) - euroTotal * 100;
    adapted = largestRemainder(exact.map((v) => Math.max(0, v) / 100), euroTotal).map((v) => v * 100);
    if (cents > 0 && adapted.length) {
      // Les centimes vont à l'enveloppe que l'arrondi a le plus lésée (jamais au-delà de son objectif).
      let best = 0;
      for (let i = 1; i < adapted.length; i++) if (exact[i] - adapted[i] > exact[best] - adapted[best]) best = i;
      adapted[best] += cents;
    }
  }

  const items: PlanItem[] = envs.map((envelope, i) => ({
    envelope,
    level: levelOf(envelope),
    floor: floorOf(envelope),
    normal: normals[i],
    adapted: adapted[i],
    fixed: overrides[envelope.id] !== undefined,
  }));
  const adaptedById = new Map(items.map((it) => [it.envelope.id, it.adapted]));
  return {
    planned,
    normal: T,
    delta,
    status: planStatus(delta),
    items,
    essentialMissing,
    config: {
      ...config,
      envelopes: config.envelopes.map((e) => (adaptedById.has(e.id) ? { ...e, target: adaptedById.get(e.id)! } : e)),
    },
  };
}

/** Phrase d'explication d'une enveloppe réduite. */
export function reductionReason(plan: MonthPlan, item: PlanItem): string | null {
  const cut = item.normal - item.adapted;
  if (cut <= 0) return null;
  const reducedImportant = plan.items.some((i) => i.level === 'important' && i.adapted < i.normal);
  const savingsProtected = plan.items.some((i) => i.envelope.kind === 'epargne' && i.adapted >= i.normal);
  const protects = plan.essentialMissing > 0
    ? 'parce que l’essentiel n’est pas entièrement couvert'
    : !reducedImportant && savingsProtected
      ? 'pour protéger l’essentiel et ton épargne'
      : 'pour protéger l’essentiel';
  return `${item.envelope.name} réduit de ${formatEUR(cut, { compact: true })} ${protects}.`;
}

// ─── Jours ouvrés et estimation de retenue ─────────────────────────────

/** Dimanche de Pâques (algorithme de Meeus/Jones/Butcher). */
function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day, 12);
}

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Jours fériés français (métropole). */
export function frenchHolidays(year: number): Set<string> {
  const e = easter(year);
  const shift = (n: number) => {
    const d = new Date(e);
    d.setDate(d.getDate() + n);
    return iso(d);
  };
  return new Set([
    `${year}-01-01`, `${year}-05-01`, `${year}-05-08`, `${year}-07-14`, `${year}-08-15`, `${year}-11-01`, `${year}-11-11`, `${year}-12-25`,
    shift(1), shift(39), shift(50),
  ]);
}

/** Jours ouvrés d'un mois : du lundi au vendredi, hors jours fériés. */
export function workingDays(month: Month): number {
  const holidays = frenchHolidays(Number(month.slice(0, 4)));
  let count = 0;
  for (let d = 1; d <= daysInMonth(month); d++) {
    const date = `${month}-${pad(d)}`;
    const day = parseISODate(date).getDay();
    if (day !== 0 && day !== 6 && !holidays.has(date)) count += 1;
  }
  return count;
}

/** Salaire estimé après une retenue de `unpaidDays` jours non payés, arrondi à l'euro. */
export function estimateWithholding(salary: Cents, unpaidDays: number, workDays: number): Cents {
  if (workDays <= 0) return salary;
  const days = Math.min(Math.max(0, unpaidDays), workDays);
  return Math.round((salary * (workDays - days)) / workDays / 100) * 100;
}
