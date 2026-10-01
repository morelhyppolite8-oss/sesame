import { largestRemainder } from './money';
import type { AllocLine, BudgetConfig, Cents, Envelope, SavingsRules } from './types';

export interface AllocationContext {
  config: BudgetConfig;
  /** Déjà financé ce mois, par enveloppe (reports inclus). */
  funded: Record<string, Cents>;
  /** Solde projeté du compte matelas au moment de l'encaissement. */
  cushionBalance: Cents;
  /** Compte sur lequel l'argent arrive. */
  receivingAccountId: string;
}

interface RawLine {
  envelopeId: string;
  accountId: string;
  pocket?: string;
  /** Montant exact en centimes, éventuellement fractionnaire. */
  amount: number;
}

export const activeEnvelopes = (config: BudgetConfig): Envelope[] =>
  config.envelopes.filter((e) => !e.archived).sort((a, b) => a.priority - b.priority);

/**
 * Phase 1 : tout va au matelas tant qu'il est sous la cible.
 * Phase 2 : répartition au prorata des poids.
 * À la transition, on complète exactement le matelas et le reste suit la phase 2.
 * Les montants renvoyés sont exacts (fractionnaires) ; l'arrondi se fait plus tard.
 */
export function routeSavingsExact(
  amount: number,
  rules: SavingsRules,
  cushionBalance: Cents,
): { accountId: string; amount: number }[] {
  const gap = Math.max(0, rules.cushionTarget - cushionBalance);
  const toCushion = Math.min(amount, gap);
  const rest = amount - toCushion;
  const out: { accountId: string; amount: number }[] = [];
  if (toCushion > 0) out.push({ accountId: rules.cushionAccountId, amount: toCushion });
  if (rest > 0) {
    const weights = rules.phase2.filter((p) => p.weight > 0);
    const total = weights.reduce((a, p) => a + p.weight, 0);
    if (total <= 0) {
      out.push({ accountId: rules.cushionAccountId, amount: rest });
    } else {
      for (const p of weights) out.push({ accountId: p.accountId, amount: (rest * p.weight) / total });
    }
  }
  return out;
}

/** Même règle, avec des centimes entiers exacts (reliquats). */
export function routeSavingsCents(amount: Cents, rules: SavingsRules, cushionBalance: Cents) {
  const exact = routeSavingsExact(amount, rules, cushionBalance);
  const rounded = largestRemainder(exact.map((l) => l.amount), amount);
  return exact.map((l, i) => ({ accountId: l.accountId, amount: rounded[i] })).filter((l) => l.amount > 0);
}

export function isPhase2(rules: SavingsRules, cushionBalance: Cents): boolean {
  return cushionBalance >= rules.cushionTarget;
}

function envelopeLines(env: Envelope, amount: number, ctx: AllocationContext): RawLine[] {
  const split = env.accountSplit?.filter((s) => s.weight > 0) ?? [];
  const weight = split.reduce((a, s) => a + s.weight, 0);
  if (split.length > 1 && weight > 0) {
    // Enveloppe versée sur plusieurs comptes (abonnements débités sur des comptes différents).
    return split.map((s) => ({ envelopeId: env.id, accountId: s.accountId, amount: (amount * s.weight) / weight }));
  }
  if (split.length === 1) return [{ envelopeId: env.id, accountId: split[0].accountId, amount }];
  if (env.accountId) return [{ envelopeId: env.id, accountId: env.accountId, pocket: env.pocket, amount }];
  return routeSavingsExact(amount, ctx.config.rules.savings, ctx.cushionBalance).map((l) => ({
    envelopeId: env.id,
    accountId: l.accountId,
    amount: l.amount,
  }));
}

export interface AllocationResult {
  lines: AllocLine[];
  /** Part du montant affectée par la règle de surplus (avant arrondi). */
  surplus: Cents;
}

/**
 * Cascade : chaque enveloppe, par priorité, reçoit min(reste, objectif − déjà financé).
 * Le reste suit la règle de surplus. Les lignes sont arrondies à l'euro par la méthode du plus fort reste ;
 * les éventuels centimes restent sur le compte de réception.
 */
export function allocateReceipt(amount: Cents, ctx: AllocationContext): AllocationResult {
  const envelopes = activeEnvelopes(ctx.config);
  const byEnvelope = new Map<string, number>();
  let rest = amount;

  for (const env of envelopes) {
    if (rest <= 0) break;
    const need = Math.max(0, env.target - (ctx.funded[env.id] ?? 0));
    const give = Math.min(rest, need);
    if (give > 0) {
      byEnvelope.set(env.id, give);
      rest -= give;
    }
  }

  const surplus = rest;
  if (rest > 0) {
    const rules = ctx.config.rules.surplus.filter(
      (r) => r.pct > 0 && envelopes.some((e) => e.id === r.envelopeId),
    );
    if (rules.length === 0) {
      const fallback = ctx.config.rules.leftoverEnvelopeId;
      byEnvelope.set(fallback, (byEnvelope.get(fallback) ?? 0) + rest);
    } else {
      const total = rules.reduce((a, r) => a + r.pct, 0);
      for (const r of rules) {
        byEnvelope.set(r.envelopeId, (byEnvelope.get(r.envelopeId) ?? 0) + (rest * r.pct) / total);
      }
    }
  }

  // Lignes par enveloppe et par compte, dans l'ordre de priorité.
  const raw: RawLine[] = [];
  for (const env of envelopes) {
    const value = byEnvelope.get(env.id);
    if (value && value > 0) raw.push(...envelopeLines(env, value, ctx));
  }

  const euroTotal = Math.floor(amount / 100);
  const centsRest = amount - euroTotal * 100;
  const rounded = largestRemainder(raw.map((l) => l.amount / 100), euroTotal);
  const lines: AllocLine[] = raw.map((l, i) => ({
    envelopeId: l.envelopeId,
    accountId: l.accountId,
    ...(l.pocket ? { pocket: l.pocket } : {}),
    amount: rounded[i] * 100,
  }));

  if (centsRest > 0 && lines.length > 0) {
    const onReceiving = lines.find((l) => l.accountId === ctx.receivingAccountId);
    if (onReceiving) onReceiving.amount += centsRest;
    else lines.push({ envelopeId: lines[0].envelopeId, accountId: ctx.receivingAccountId, amount: centsRest });
  }

  return { lines: lines.filter((l) => l.amount > 0), surplus };
}

/** Totaux par enveloppe d'un ensemble de lignes. */
export function totalsByEnvelope(lines: AllocLine[]): Record<string, Cents> {
  const out: Record<string, Cents> = {};
  for (const l of lines) out[l.envelopeId] = (out[l.envelopeId] ?? 0) + l.amount;
  return out;
}

/** Totaux par compte d'un ensemble de lignes. */
export function totalsByAccount(lines: AllocLine[]): Record<string, Cents> {
  const out: Record<string, Cents> = {};
  for (const l of lines) out[l.accountId] = (out[l.accountId] ?? 0) + l.amount;
  return out;
}
