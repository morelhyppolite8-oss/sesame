import { routeSavingsCents } from './allocation';
import { formatEUR } from './money';
import type { BudgetConfig, Cents, Envelope, ISODate, Month, Review, TransferTarget } from './types';

/** En dessous d'un euro, un écart est considéré comme nul : pas de virement de quelques centimes. */
export const LEFTOVER_THRESHOLD = 100;

export interface LeftoverItem {
  envelope: Envelope;
  funded: Cents;
  spent: Cents | undefined;
  /** financé − dépensé : positif = reliquat, négatif = dépassement. */
  diff: Cents;
  carried: boolean;
}

export interface LeftoverResult {
  items: LeftoverItem[];
  /** Reliquats envoyés vers l'enveloppe de destination (Épargne). */
  toSavings: Cents;
  /** Reliquats reportés au mois suivant, par enveloppe. */
  carried: Record<string, Cents>;
  overspent: Cents;
  targets: TransferTarget[];
  flows: { accountId: string; amount: Cents }[];
}

/**
 * Écarts entre prévu et réel pour les enveloppes `dépense`, destination des reliquats et virements générés.
 * Les reliquats non reportés suivent les règles de phase de l'Épargne (matelas puis prorata).
 */
export function computeLeftovers(
  month: Month,
  config: BudgetConfig,
  funded: Record<string, Cents>,
  review: Pick<Review, 'spent' | 'carry'>,
  cushionBalance: Cents,
  date: ISODate,
): LeftoverResult {
  const envelopes = config.envelopes
    .filter((e) => e.kind === 'depense' && !e.archived)
    .sort((a, b) => a.priority - b.priority);
  const items: LeftoverItem[] = envelopes.map((envelope) => {
    const f = funded[envelope.id] ?? 0;
    const spent = review.spent[envelope.id];
    return {
      envelope,
      funded: f,
      spent,
      diff: spent === undefined || Math.abs(f - spent) < LEFTOVER_THRESHOLD ? 0 : f - spent,
      carried: Boolean(review.carry[envelope.id]),
    };
  });

  const carried: Record<string, Cents> = {};
  let overspent = 0;
  const destination = config.envelopes.find((e) => e.id === config.rules.leftoverEnvelopeId);
  // Montants à transférer, regroupés par (depuis, vers).
  const grouped = new Map<string, TransferTarget>();
  const flows: { accountId: string; amount: Cents }[] = [];
  let toSavings = 0;
  let cushion = cushionBalance;

  for (const item of items) {
    if (item.diff < 0) overspent += -item.diff;
    if (item.diff <= 0) continue;
    if (item.carried) {
      carried[item.envelope.id] = item.diff;
      continue;
    }
    toSavings += item.diff;
    const from = item.envelope.accountId;
    if (!from || !destination) continue;
    const routes = destination.accountId
      ? [{ accountId: destination.accountId, amount: item.diff }]
      : routeSavingsCents(item.diff, config.rules.savings, cushion);
    for (const r of routes) {
      if (r.accountId === config.rules.savings.cushionAccountId) cushion += r.amount;
      flows.push({ accountId: from, amount: -r.amount }, { accountId: r.accountId, amount: r.amount });
      if (r.accountId === from) continue;
      const key = `rv:${month}:${from}:${r.accountId}`;
      const t = grouped.get(key) ?? {
        key,
        origin: 'review' as const,
        refId: month,
        month,
        date,
        fromAccountId: from,
        toAccountId: r.accountId,
        amount: 0,
        lines: [],
      };
      t.amount += r.amount;
      t.lines.push({ label: `Reliquat ${item.envelope.name}`, amount: r.amount, envelopeId: item.envelope.id });
      grouped.set(key, t);
    }
  }

  return { items, toSavings, carried, overspent, targets: [...grouped.values()], flows };
}

export interface AdviceInput {
  month: Month;
  items: LeftoverItem[];
  savingsTarget: Cents;
  savedThisMonth: Cents;
  cushion: Cents;
  cushionTarget: Cents;
  missingFunding: Cents;
  /** Reliquats de la même enveloppe les deux mois précédents. */
  previousLeftovers?: Record<string, Cents[]>;
}

/** Un conseil concret pour le mois suivant, sans jugement. */
export function adviceFor(input: AdviceInput): string {
  const over = input.items
    .filter((i) => i.diff < 0)
    .sort((a, b) => a.diff - b.diff)[0];
  if (over) {
    const weekly = Math.floor(over.funded / 4.3 / 100) * 100;
    return `${over.envelope.name} a dépassé de ${formatEUR(-over.diff, { compact: true })}. Le mois prochain, essaie un repère simple : ${formatEUR(weekly, { compact: true })} par semaine.`;
  }
  const steady = input.items.find((i) => {
    const prev = input.previousLeftovers?.[i.envelope.id] ?? [];
    return i.diff > 0 && prev.length >= 2 && prev.every((p) => p > 0);
  });
  if (steady) {
    const avg = Math.round(
      ([steady.diff, ...(input.previousLeftovers?.[steady.envelope.id] ?? [])].reduce((a, b) => a + b, 0) / 3) / 100,
    ) * 100;
    return `${steady.envelope.name} laisse un reliquat depuis trois mois. Tu pourrais baisser son objectif de ${formatEUR(avg, { compact: true })} et l'envoyer directement en épargne.`;
  }
  if (input.missingFunding > 0) {
    return `Il a manqué ${formatEUR(input.missingFunding, { compact: true })} pour tout financer. Garde tes premières dépenses du mois sur les enveloppes essentielles.`;
  }
  const gap = input.cushionTarget - input.cushion;
  if (gap > 0 && gap <= input.savingsTarget * 2) {
    return `Plus que ${formatEUR(gap, { compact: true })} avant que ton matelas soit complet. Encore un ou deux mois comme celui-ci.`;
  }
  if (input.savedThisMonth >= input.savingsTarget) {
    return `Objectif d'épargne tenu. Garde le même rythme : c'est la régularité qui fait le patrimoine.`;
  }
  return `Le mois prochain, fais tes virements dès réception : c'est le meilleur moyen de tenir l'objectif d'épargne.`;
}
