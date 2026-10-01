import type { Transfer, TransferTarget } from './types';

export interface ReconcileResult {
  upsert: Transfer[];
  remove: string[];
}

/**
 * Aligne les virements enregistrés sur les virements souhaités, sans jamais effacer un virement coché.
 * Si un virement déjà fait n'a plus le bon montant (encaissement modifié ou supprimé),
 * un virement d'ajustement est proposé pour la différence, dans un sens ou dans l'autre.
 */
export function reconcileTransfers(
  targets: TransferTarget[],
  existing: Transfer[],
  now: number,
  newId: () => string,
): ReconcileResult {
  const byKey = new Map<string, Transfer[]>();
  for (const t of existing) {
    const list = byKey.get(t.key) ?? [];
    list.push(t);
    byKey.set(t.key, list);
  }
  const targetByKey = new Map(targets.map((t) => [t.key, t]));
  const keys = new Set([...targetByKey.keys(), ...byKey.keys()]);
  const upsert: Transfer[] = [];
  const remove: string[] = [];

  for (const key of keys) {
    const target = targetByKey.get(key);
    const records = byKey.get(key) ?? [];
    const done = records.filter((r) => r.done);
    const pending = records.filter((r) => !r.done);
    const base = target ?? records[0];
    const from = base.fromAccountId;
    const to = base.toAccountId;
    const doneSigned = done.reduce(
      (acc, r) => acc + (r.fromAccountId === from && r.toAccountId === to ? r.amount : -r.amount),
      0,
    );
    const delta = (target?.amount ?? 0) - doneSigned;

    if (delta === 0) {
      remove.push(...pending.map((p) => p.id));
      continue;
    }

    const isAdjustment = done.length > 0 || !target;
    const amount = Math.abs(delta);
    const desired: Omit<Transfer, 'id' | 'createdAt'> = {
      key,
      origin: base.origin,
      refId: base.refId,
      month: base.month,
      date: base.date,
      fromAccountId: delta > 0 ? from : to,
      toAccountId: delta > 0 ? to : from,
      amount,
      lines: isAdjustment
        ? [{ label: !target ? 'Retour après suppression' : delta > 0 ? 'Complément après recalcul' : 'Retour après recalcul', amount }]
        : target!.lines,
      done: false,
      isAdjustment,
      ...(isAdjustment ? { adjustmentKind: delta > 0 ? ('plus' as const) : ('retour' as const) } : {}),
    };

    const [keep, ...others] = pending;
    remove.push(...others.map((p) => p.id));
    if (keep) {
      const same =
        keep.amount === desired.amount &&
        keep.fromAccountId === desired.fromAccountId &&
        keep.toAccountId === desired.toAccountId &&
        keep.date === desired.date &&
        keep.month === desired.month &&
        keep.isAdjustment === desired.isAdjustment &&
        keep.adjustmentKind === desired.adjustmentKind &&
        JSON.stringify(keep.lines) === JSON.stringify(desired.lines);
      if (!same) upsert.push({ ...desired, id: keep.id, createdAt: keep.createdAt });
    } else {
      upsert.push({ ...desired, id: newId(), createdAt: now });
    }
  }

  return { upsert, remove };
}
