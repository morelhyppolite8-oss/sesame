import { balanceAt, isProjected, provisionBalance } from '../engine/balances';
import type { LedgerOutput } from '../engine/recompute';
import type { Cents, Envelope, Goal, ISODate } from '../engine/types';
import type { Snapshot } from './ledger';

export function provisionBalanceOf(env: Envelope, snap: Pick<Snapshot, 'provisionUses'>, ledger: LedgerOutput): Cents {
  return provisionBalance(env, ledger.allocatedTotals[env.id] ?? 0, snap.provisionUses);
}

export function accountBalance(accountId: string, snap: Pick<Snapshot, 'accounts' | 'readings'>, ledger: LedgerOutput, date: ISODate): Cents {
  const account = snap.accounts.find((a) => a.id === accountId);
  return balanceAt(accountId, date, snap.readings, ledger.flows, account ? isProjected(account.type) : true);
}

/** Valeur actuelle d'un objectif selon son lien (provision, enveloppe, compte ou épargne totale). */
export function goalCurrent(goal: Goal, snap: Snapshot, ledger: LedgerOutput, today: ISODate): Cents {
  const link = goal.link;
  if (link.type === 'envelope') {
    const env = snap.envelopes.find((e) => e.id === link.id);
    if (!env) return 0;
    return env.kind === 'provision' ? provisionBalanceOf(env, snap, ledger) : ledger.allocatedTotals[env.id] ?? 0;
  }
  if (link.type === 'account') return accountBalance(link.id, snap, ledger, today);
  return snap.accounts
    .filter((a) => isProjected(a.type) && !a.archived)
    .reduce((acc, a) => acc + balanceAt(a.id, today, snap.readings, ledger.flows), 0);
}
