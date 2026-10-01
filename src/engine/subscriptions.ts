import { addDays, daysBetween, daysInMonth, firstDayOf, lastDayOf, monthIndex, monthOf } from './dates';
import type {
  Cents,
  Envelope,
  ISODate,
  Month,
  Subscription,
  SubscriptionCategory,
  SubscriptionFrequency,
} from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export const FREQUENCY_LABELS: Record<SubscriptionFrequency, { adjective: string; per: string }> = {
  weekly: { adjective: 'Hebdomadaire', per: 'semaine' },
  monthly: { adjective: 'Mensuel', per: 'mois' },
  quarterly: { adjective: 'Trimestriel', per: 'trimestre' },
  yearly: { adjective: 'Annuel', per: 'an' },
};

export const CATEGORY_LABELS: Record<SubscriptionCategory, string> = {
  divertissement: 'Divertissement',
  outils: 'Outils',
  cloud: 'Cloud',
  sport: 'Sport',
  presse: 'Presse',
  autre: 'Autre',
};

/** Montant en vigueur à une date, d'après l'historique des prix. */
export function priceAt(sub: Subscription, date: ISODate): Cents {
  const history = [...sub.priceHistory].sort((a, b) => a.date.localeCompare(b.date));
  let price = history[0]?.amount ?? sub.amount;
  for (const h of history) if (h.date <= date) price = h.amount;
  return price;
}

/** Équivalent mensuel exact (fractionnaire) : annuel ÷ 12, trimestriel ÷ 3, hebdomadaire × 52 ÷ 12. */
export function monthlyEquivalent(sub: Pick<Subscription, 'frequency' | 'amount'>, amount = sub.amount): number {
  switch (sub.frequency) {
    case 'weekly':
      return (amount * 52) / 12;
    case 'quarterly':
      return amount / 3;
    case 'yearly':
      return amount / 12;
    default:
      return amount;
  }
}

export const annualCost = (sub: Pick<Subscription, 'frequency' | 'amount'>): Cents => Math.round(monthlyEquivalent(sub) * 12);

/** Abonnements qui comptent dans le budget d'un mois : actifs et déjà commencés. */
export const activeForBudget = (subs: Subscription[], month: Month): Subscription[] =>
  subs.filter((s) => s.status === 'actif' && s.startDate <= lastDayOf(month));

/** Objectif de l'enveloppe Abonnements : somme des équivalents mensuels, arrondie à l'euro supérieur. */
export function subscriptionsTarget(subs: Subscription[], month: Month): Cents {
  const total = activeForBudget(subs, month).reduce((a, s) => a + monthlyEquivalent(s), 0);
  return Math.ceil(Math.round(total) / 100) * 100;
}

/** Poids par compte débité, pour verser l'enveloppe sur les bons comptes. */
export function accountWeights(subs: Subscription[], month: Month): { accountId: string; weight: number }[] {
  const byAccount = new Map<string, number>();
  for (const s of activeForBudget(subs, month)) byAccount.set(s.accountId, (byAccount.get(s.accountId) ?? 0) + monthlyEquivalent(s));
  return [...byAccount.entries()].map(([accountId, weight]) => ({ accountId, weight })).sort((a, b) => b.weight - a.weight);
}

/** Met à jour l'enveloppe automatique (objectif et comptes) d'après les abonnements. */
export function applySubscriptions(envelopes: Envelope[], subs: Subscription[], month: Month): Envelope[] {
  return envelopes.map((e) => {
    if (e.auto !== 'subscriptions') return e;
    const weights = accountWeights(subs, month);
    const next: Envelope = { ...e, target: subscriptionsTarget(subs, month) };
    if (weights.length) {
      next.accountSplit = weights;
      next.accountId = weights[0].accountId;
    } else delete next.accountSplit;
    return next;
  });
}

export interface Charge {
  sub: Subscription;
  /** Date du prélèvement ; absente si le jour est « à compléter ». */
  date?: ISODate;
  amount: Cents;
}

/** Jour de prélèvement ramené au dernier jour du mois si le mois est plus court. */
export const chargeDay = (day: number, month: Month): ISODate => `${month}-${pad(Math.min(day, daysInMonth(month)))}`;

function anchorMonth(sub: Subscription): number {
  return sub.month ?? Number(sub.startDate.slice(5, 7));
}

/** Prélèvements d'un abonnement dans un mois. */
export function chargesInMonth(sub: Subscription, month: Month): Charge[] {
  if (monthIndex(month) < monthIndex(monthOf(sub.startDate))) return [];
  const first = firstDayOf(month);
  const last = lastDayOf(month);
  const dates: (ISODate | undefined)[] = [];
  const m = Number(month.slice(5, 7));
  switch (sub.frequency) {
    case 'monthly':
      dates.push(sub.day ? chargeDay(sub.day, month) : undefined);
      break;
    case 'quarterly':
      if ((((m - anchorMonth(sub)) % 3) + 3) % 3 === 0) dates.push(sub.day ? chargeDay(sub.day, month) : undefined);
      break;
    case 'yearly':
      if (m === anchorMonth(sub)) dates.push(sub.day ? chargeDay(sub.day, month) : undefined);
      break;
    case 'weekly': {
      const gap = daysBetween(sub.startDate, first);
      let d = addDays(sub.startDate, gap > 0 ? Math.ceil(gap / 7) * 7 : 0);
      for (; d <= last; d = addDays(d, 7)) if (d >= first) dates.push(d);
      break;
    }
  }
  return dates
    .filter((d) => {
      if (d && d < sub.startDate) return false;
      if (sub.status === 'actif') return true;
      return Boolean(sub.statusSince && (d ?? first) < sub.statusSince);
    })
    .map((date) => ({ sub, date, amount: priceAt(sub, date ?? first) }));
}

export function monthCharges(subs: Subscription[], month: Month): Charge[] {
  return subs
    .flatMap((s) => chargesInMonth(s, month))
    .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || b.amount - a.amount);
}

export interface ChargeSummary {
  total: Cents;
  done: Cents;
  remaining: Cents;
  /** Prélèvements dont le jour est à compléter. */
  undated: number;
}

export function chargeSummary(subs: Subscription[], month: Month, today: ISODate): ChargeSummary {
  const charges = monthCharges(subs, month);
  const total = charges.reduce((a, c) => a + c.amount, 0);
  const done = charges.filter((c) => c.date && c.date <= today).reduce((a, c) => a + c.amount, 0);
  return { total, done, remaining: total - done, undated: charges.filter((c) => !c.date).length };
}

export interface UpcomingCharge extends Charge {
  date: ISODate;
  daysLeft: number;
}

/** Prochains prélèvements datés, dans l'ordre chronologique. */
export function upcomingCharges(subs: Subscription[], today: ISODate, horizonDays = 60): UpcomingCharge[] {
  const end = addDays(today, horizonDays);
  const out: UpcomingCharge[] = [];
  for (let m = monthOf(today); monthIndex(m) <= monthIndex(monthOf(end)); m = monthOfNext(m)) {
    for (const c of monthCharges(subs.filter((s) => s.status === 'actif'), m)) {
      if (c.date && c.date >= today && c.date <= end) out.push({ ...c, date: c.date, daysLeft: daysBetween(today, c.date) });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
}

function monthOfNext(month: Month): Month {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
}

/** « aujourd’hui », « demain », « dans 3 jours ». */
export function countdown(days: number): string {
  if (days <= 0) return 'aujourd’hui';
  if (days === 1) return 'demain';
  return `dans ${days} jours`;
}

/**
 * Consommation d'un mois pour la revue : prélèvements réels des abonnements mensuels et hebdomadaires,
 * équivalent mensuel pour les trimestriels et annuels (la différence reste de côté pour l'échéance).
 */
export function subscriptionConsumption(subs: Subscription[], month: Month): Cents {
  let total = 0;
  for (const s of subs) {
    if (s.frequency === 'monthly' || s.frequency === 'weekly') {
      total += chargesInMonth(s, month).reduce((a, c) => a + c.amount, 0);
    } else if (activeForBudget([s], month).length) {
      total += monthlyEquivalent(s, priceAt(s, lastDayOf(month)));
    }
  }
  return Math.round(total);
}

/** Coût mensuel (équivalent) des abonnements actifs à la fin de chaque mois. */
export function monthlyCostSeries(subs: Subscription[], months: Month[]): { month: Month; total: Cents }[] {
  return months.map((month) => {
    const end = lastDayOf(month);
    const total = subs
      .filter((s) => s.startDate <= end && (s.status === 'actif' || (s.statusSince !== undefined && s.statusSince > end)))
      .reduce((a, s) => a + monthlyEquivalent(s, priceAt(s, end)), 0);
    return { month, total: Math.round(total) };
  });
}

export interface PriceChange {
  previous: Cents;
  current: Cents;
  date: ISODate;
  /** Impact annuel de la hausse (positif) ou de la baisse (négatif). */
  annualImpact: Cents;
}

/** Dernier changement de prix enregistré. */
export function lastPriceChange(sub: Subscription): PriceChange | null {
  const history = [...sub.priceHistory].sort((a, b) => a.date.localeCompare(b.date));
  if (history.length < 2) return null;
  const [prev, cur] = history.slice(-2);
  if (prev.amount === cur.amount) return null;
  return {
    previous: prev.amount,
    current: cur.amount,
    date: cur.date,
    annualImpact: annualCost({ frequency: sub.frequency, amount: cur.amount }) - annualCost({ frequency: sub.frequency, amount: prev.amount }),
  };
}

/** Enregistre un nouveau prix dans l'historique (remplace un changement du même jour). */
export function withNewPrice(sub: Subscription, amount: Cents, date: ISODate): Subscription {
  if (amount === sub.amount) return sub;
  const history = sub.priceHistory.filter((h) => h.date !== date);
  return { ...sub, amount, priceHistory: [...history, { date, amount }] };
}

/** Prochaine échéance annuelle d'un abonnement. */
export function nextYearlyCharge(sub: Subscription, today: ISODate): ISODate | null {
  if (sub.frequency !== 'yearly' || !sub.day) return null;
  const anchor = anchorMonth(sub);
  const year = Number(today.slice(0, 4));
  for (const y of [year, year + 1]) {
    const date = chargeDay(sub.day, `${y}-${pad(anchor)}`);
    if (date >= today && date >= sub.startDate) return date;
  }
  return null;
}

export const initialOf = (sub: Pick<Subscription, 'name' | 'icon'>): string =>
  sub.icon?.trim() || sub.name.trim().charAt(0).toUpperCase() || '·';

/** Teintes proposées pour les abonnements : sobres, lisibles sur fond sombre comme ivoire. */
export const SUBSCRIPTION_COLORS = ['#C9A96E', '#8FB39A', '#7F9CC0', '#C98F8F', '#A08FC0', '#C98F6F', '#8FB3B3', '#9A958B'];

export interface SubscriptionSuggestion {
  name: string;
  amount: Cents;
  frequency: SubscriptionFrequency;
  category: SubscriptionCategory;
  color: string;
}

/** Services courants, montants indicatifs et modifiables. */
export const SUGGESTIONS: SubscriptionSuggestion[] = [
  { name: 'Netflix', amount: 1349, frequency: 'monthly', category: 'divertissement', color: '#C98F8F' },
  { name: 'Spotify', amount: 1211, frequency: 'monthly', category: 'divertissement', color: '#8FB39A' },
  { name: 'Canal+', amount: 2699, frequency: 'monthly', category: 'divertissement', color: '#9A958B' },
  { name: 'Amazon Prime', amount: 699, frequency: 'monthly', category: 'divertissement', color: '#7F9CC0' },
  { name: 'Disney+', amount: 999, frequency: 'monthly', category: 'divertissement', color: '#7F9CC0' },
  { name: 'YouTube Premium', amount: 1299, frequency: 'monthly', category: 'divertissement', color: '#C98F8F' },
  { name: 'Apple Music', amount: 1099, frequency: 'monthly', category: 'divertissement', color: '#C98F8F' },
  { name: 'Basic-Fit', amount: 2999, frequency: 'monthly', category: 'sport', color: '#C98F6F' },
  { name: 'ChatGPT Plus', amount: 2300, frequency: 'monthly', category: 'outils', color: '#8FB3B3' },
  { name: 'Google One', amount: 199, frequency: 'monthly', category: 'cloud', color: '#7F9CC0' },
  { name: 'Le Monde', amount: 1199, frequency: 'monthly', category: 'presse', color: '#9A958B' },
  { name: 'Navigo', amount: 8880, frequency: 'monthly', category: 'autre', color: '#A08FC0' },
];
