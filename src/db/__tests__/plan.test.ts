import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { addMonths, monthOf, toISODate } from '../../engine/dates';
import { habitualAmount, plannedIncome } from '../../engine/income';
import { addReceipt, answerIncomeVariance, saveIncome, seedDefaults, setIncomeException } from '../actions';
import { loadSnapshot } from '../ledger';
import { db, TABLES } from '../schema';

const current = monthOf(toISODate(new Date()));

beforeEach(async () => {
  for (const t of TABLES) await db.table(t).clear();
  await seedDefaults();
  await db.settings.update('settings', { onboarded: true });
});

const salary = async () => (await db.incomes.get('salaire'))!;

describe('Revenus attendus : effet immédiat, sans réécrire le passé (exemple)', () => {
  it('modifier le salaire attendu recalcule aussitôt les répartitions du mois', async () => {
    const id = await addReceipt({ amount: 80000, date: `${current}-02`, month: current, source: 'Revenus variables', incomeId: 'variable', accountId: 'courant' });
    const line = async (env: string) => (await db.allocations.get(id))!.lines.filter((l) => l.envelopeId === env).reduce((a, l) => a + l.amount, 0);
    expect(await line('marge')).toBe(5000);
    expect(await line('epargne')).toBe(8000);
    // 600 € attendus au lieu de 1 600 € : P = 1 400 €, la Marge descend à 12 €.
    await saveIncome({ ...(await salary()), amount: 60000 });
    expect(await line('marge')).toBe(1200);
    expect(await line('epargne')).toBe(11800);
  });

  it('un changement de valeur par défaut à partir du mois prochain laisse les mois précédents intacts', async () => {
    const next = addMonths(current, 1);
    await saveIncome({ ...(await salary()), amount: 170000 }, next);
    const s = await salary();
    expect(habitualAmount(s, current)).toBe(160000);
    expect(habitualAmount(s, next)).toBe(170000);
  });

  it('« Exceptionnel » ne touche que ce mois ; « Nouveau salaire » change le montant habituel', async () => {
    const id = await addReceipt({ amount: 150000, date: `${current}-27`, month: current, source: 'Salaire', incomeId: 'salaire', accountId: 'courant' });
    await answerIncomeVariance(id, 'exceptional', 'absence');
    let snap = (await loadSnapshot())!;
    expect(snap.incomeExceptions).toEqual([expect.objectContaining({ month: current, amount: 150000, reason: 'absence' })]);
    expect(habitualAmount(snap.incomes.find((i) => i.id === 'salaire')!, addMonths(current, 1))).toBe(160000);

    const id2 = await addReceipt({ amount: 150000, date: `${current}-28`, month: addMonths(current, 1), source: 'Salaire', incomeId: 'salaire', accountId: 'courant' });
    await answerIncomeVariance(id2, 'durable');
    snap = (await loadSnapshot())!;
    expect(habitualAmount(snap.incomes.find((i) => i.id === 'salaire')!, addMonths(current, 2))).toBe(150000);
    expect(habitualAmount(snap.incomes.find((i) => i.id === 'salaire')!, current)).toBe(160000);
  });

  it('une exception de mois est prise en compte par le revenu prévu', async () => {
    const m = addMonths(current, 2);
    await setIncomeException({ incomeId: 'salaire', month: m, amount: 140000, reason: 'sans-solde' });
    const snap = (await loadSnapshot())!;
    expect(plannedIncome(snap.incomes, snap.incomeExceptions, snap.receipts, m)).toBe(140000);
    expect(plannedIncome(snap.incomes, snap.incomeExceptions, snap.receipts, addMonths(m, 1))).toBe(160000);
  });
});
