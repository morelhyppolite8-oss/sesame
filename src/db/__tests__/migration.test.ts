import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { toISODate } from '../../engine/dates';
import { completeSetup, ensureSubscriptionsModel, saveSubscription, seedDefaults } from '../actions';
import { configResolver, loadSnapshot } from '../ledger';
import { db, TABLES } from '../schema';

const OLD_ENVELOPES = [
  { id: 'fixe', name: 'Fixe', kind: 'depense', accountId: 'courant', target: 7000, priority: 1 },
  { id: 'courses', name: 'Courses', kind: 'depense', accountId: 'depenses', target: 30000, priority: 2 },
  { id: 'epargne', name: 'Épargne', kind: 'epargne', accountId: null, target: 25000, priority: 3 },
] as const;

beforeEach(async () => {
  for (const t of TABLES) await db.table(t).clear();
});

describe('Premier lancement', () => {
  it('la base démarre avec l’exemple générique, sans abonnement', async () => {
    await seedDefaults();
    const snap = (await loadSnapshot())!;
    expect(snap.settings.onboarded).toBe(false);
    expect(snap.subscriptions).toEqual([]);
    expect(snap.incomes.map((i) => i.name)).toEqual(['Salaire', 'Revenus variables']);
  });

  it('l’assistant enregistre la configuration saisie et répare les références', async () => {
    await seedDefaults();
    const snap = (await loadSnapshot())!;
    // Le compte de dépenses est retiré : ses enveloppes passent sur le premier compte courant.
    const accounts = snap.accounts.filter((a) => a.id !== 'depenses');
    await completeSetup({
      pinHash: 'h',
      pinSalt: 's',
      accounts,
      balances: { courant: { value: 120000 }, livretA: { value: 50000 } },
      incomes: [{ ...snap.incomes[0], amount: 175000 }],
      envelopes: snap.envelopes,
      subscriptions: [{ id: 'x', name: 'Service', color: '#C9A96E', amount: 999, priceHistory: [], frequency: 'monthly', accountId: 'courant', category: 'autre', startDate: '', status: 'actif', createdAt: 0 }],
      goals: snap.goals,
      rules: snap.settings.rules,
    });
    const after = (await loadSnapshot())!;
    expect(after.settings.onboarded).toBe(true);
    expect(after.incomes).toHaveLength(1);
    expect(after.envelopes.find((e) => e.id === 'courses')!.accountId).toBe('courant');
    expect(after.subscriptions[0].priceHistory).toHaveLength(1);
    expect(after.readings.find((r) => r.accountId === 'courant')!.value).toBe(120000);
    const month = toISODate(new Date()).slice(0, 7);
    expect(configResolver(after)(month).envelopes.find((e) => e.id === 'abonnements')!.target).toBe(1000);
  });
});

describe('Migration vers le modèle Abonnements', () => {
  it('remplace Fixe par Abonnements (auto) et Marge, de façon idempotente', async () => {
    await seedDefaults();
    await db.envelopes.clear();
    await db.envelopes.bulkPut(OLD_ENVELOPES.map((e) => ({ ...e })));
    await db.settings.update('settings', { subscriptionsModel: false, onboarded: true });

    await ensureSubscriptionsModel();
    const envelopes = (await db.envelopes.orderBy('priority').toArray()).filter((e) => !e.archived);
    expect(envelopes.map((e) => [e.id, e.priority])).toEqual([['abonnements', 1], ['marge', 2], ['courses', 4], ['epargne', 5]]);
    expect((await db.envelopes.get('fixe'))?.archived).toBe(true);

    await ensureSubscriptionsModel();
    expect(await db.envelopes.count()).toBe(5);
  });

  it('un changement de prix garde l’historique et met l’objectif à jour', async () => {
    await seedDefaults();
    await db.subscriptions.put({ id: 'svc', name: 'Service', color: '#C9A96E', amount: 999, priceHistory: [{ date: '2026-01-01', amount: 999 }], frequency: 'monthly', accountId: 'courant', category: 'autre', startDate: '2026-01-01', status: 'actif', createdAt: 0 });
    const change = await saveSubscription({ ...(await db.subscriptions.get('svc'))!, amount: 1099 });
    expect(change).toMatchObject({ previous: 999, current: 1099, annualImpact: 1200 });
    const after = (await loadSnapshot())!;
    expect(after.subscriptions[0].priceHistory).toHaveLength(2);
    const month = toISODate(new Date()).slice(0, 7);
    expect(configResolver(after)(month).envelopes.find((e) => e.id === 'abonnements')!.target).toBe(1100);
  });
});
