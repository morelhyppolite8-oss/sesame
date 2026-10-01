/*
 * Tests publics du moteur, sur la configuration d'EXEMPLE (aucune donnée personnelle).
 * Budget d'exemple : Abonnements (calculé) · Logement 330 · Courses 340 · Marge 50 · Épargne 500
 * · Vacances 90 · Vêtements 40 · Sorties 250 = 1 600 €.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { allocateReceipt, routeSavingsCents, totalsByAccount, totalsByEnvelope } from '../allocation';
import { defaultConfig, DEFAULT_INCOMES } from '../defaults';
import { subscriptionsIcs } from '../ics';
import { expectedFor, habitualAmount, incomeStatuses, plannedIncome, withScheduleChange } from '../income';
import { euros, formatEUR, largestRemainder, parseAmount } from '../money';
import { adaptBudget, estimateWithholding, levelOf, workingDays, type MonthPlan } from '../plan';
import { recomputeLedger } from '../recompute';
import { reconcileTransfers } from '../reconcile';
import { annualCost, chargesInMonth, lastPriceChange, subscriptionsTarget, withNewPrice } from '../subscriptions';
import type { ExpectedIncome, IncomeException, Receipt, Subscription, Transfer } from '../types';

const config = defaultConfig();
const byEnv = (lines: Parameters<typeof totalsByEnvelope>[0]) =>
  Object.fromEntries(Object.entries(totalsByEnvelope(lines)).map(([k, v]) => [k, v / 100]));
const byAcc = (lines: Parameters<typeof totalsByAccount>[0]) =>
  Object.fromEntries(Object.entries(totalsByAccount(lines)).map(([k, v]) => [k, v / 100]));
const planOf = (plan: MonthPlan) => Object.fromEntries(plan.items.map((i) => [i.envelope.id, i.adapted / 100]));
const sumOf = (plan: MonthPlan) => plan.items.reduce((a, i) => a + i.adapted, 0);

let seq = 0;
const receipt = (date: string, amount: number, incomeId?: string): Receipt => ({
  id: `r${++seq}`, amount: euros(amount), date, source: incomeId ?? 'Autre', incomeId, month: date.slice(0, 7), createdAt: seq, accountId: 'courant',
});
const sub = (patch: Partial<Subscription>): Subscription => ({
  id: `s${++seq}`, name: 'Service', color: '#C9A96E', amount: 999, priceHistory: [{ date: '2026-01-01', amount: patch.amount ?? 999 }],
  frequency: 'monthly', accountId: 'courant', category: 'divertissement', startDate: '2026-01-01', status: 'actif', createdAt: 0, ...patch,
});

describe('Montants', () => {
  it('format fr-FR, saisie libre, plus fort reste', () => {
    expect(formatEUR(euros(1250)).replace(/[  ]/g, ' ')).toBe('1 250,00 €');
    expect(parseAmount('1 250,50')).toBe(125050);
    expect(largestRemainder([233.1, 66.6, 33.3], 333)).toEqual([233, 67, 33]);
  });
});

describe('Répartition en cascade (exemple)', () => {
  it('par priorité, puis surplus 80/20 ; virements par compte', () => {
    const receipts = [receipt('2026-11-02', 500, 'variable'), receipt('2026-11-27', 1600, 'salaire')];
    const ledger = recomputeLedger({ receipts, reviews: [], provisionUses: [], readings: [], configFor: () => config, incomes: DEFAULT_INCOMES });
    expect(byEnv(ledger.allocations[receipts[0].id])).toEqual({ logement: 330, courses: 170 });
    expect(byEnv(ledger.allocations[receipts[1].id])).toEqual({ courses: 170, marge: 50, epargne: 900, vacances: 90, vetements: 40, sorties: 350 });
    expect(ledger.targets.filter((t) => t.refId === receipts[0].id).map((t) => [t.toAccountId, t.amount / 100])).toEqual([['depenses', 170]]);
    expect(ledger.months['2026-11'].plan!.status).toBe('confortable');
  });

  it('transition de phase et prorata 70/20/10', () => {
    expect(routeSavingsCents(euros(500), config.rules.savings, euros(2900)).map((r) => [r.accountId, r.amount / 100])).toEqual([['livretA', 100], ['pea', 280], ['av', 80], ['cto', 40]]);
    const funded = { logement: euros(330), courses: euros(340), marge: euros(50), vacances: euros(90), vetements: euros(40), sorties: euros(250) };
    const { lines } = allocateReceipt(euros(333), { config, funded, cushionBalance: euros(5000), receivingAccountId: 'courant' });
    expect(byAcc(lines)).toEqual({ pea: 233, av: 67, cto: 33 });
  });

  it('propriété : la somme des lignes égale toujours le montant reçu', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5_000_000 }), fc.integer({ min: 0, max: 600_000 }), (amount, cushion) => {
        const { lines } = allocateReceipt(amount, { config, funded: {}, cushionBalance: cushion, receivingAccountId: 'courant' });
        return lines.reduce((a, l) => a + l.amount, 0) === amount && lines.filter((l) => l.accountId !== 'courant').every((l) => l.amount % 100 === 0);
      }),
      { numRuns: 1500 },
    );
  });
});

describe('Budget adaptatif (exemple)', () => {
  it('niveaux de l’exemple', () => {
    expect(config.envelopes.filter((e) => levelOf(e) === 'essentiel').map((e) => e.id)).toEqual(['abonnements', 'logement', 'courses']);
  });
  it('P = 1 400 € : seuls les Flexibles baissent', () => {
    const plan = adaptBudget(config, euros(1400));
    expect(planOf(plan)).toMatchObject({ logement: 330, courses: 340, epargne: 500, vacances: 90, marge: 12, vetements: 9, sorties: 119 });
    expect(sumOf(plan)).toBe(euros(1400));
    expect(plan.status).toBe('serre');
  });
  it('P = 1 100 € : Flexibles à leurs planchers, puis les Importants', () => {
    const plan = adaptBudget(config, euros(1100));
    expect(planOf(plan)).toMatchObject({ marge: 0, vetements: 0, sorties: 80, epargne: 286, vacances: 64, logement: 330, courses: 340 });
    expect(sumOf(plan)).toBe(euros(1100));
  });
  it('P = 500 € : l’essentiel par priorité, il manque 170 €', () => {
    const plan = adaptBudget(config, euros(500));
    expect(planOf(plan)).toMatchObject({ logement: 330, courses: 170, epargne: 0, sorties: 0 });
    expect(plan.essentialMissing).toBe(euros(170));
  });
  it('P = 1 900 € : objectifs normaux, mois confortable', () => {
    const plan = adaptBudget(config, euros(1900));
    expect(plan.status).toBe('confortable');
    expect(plan.delta).toBe(euros(300));
    expect(planOf(plan).sorties).toBe(250);
  });
  it('propriété : somme = P, Essentiels intacts tant que P les couvre, jamais négatif', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 400_000 }), (P) => {
        const plan = adaptBudget(config, P);
        const essentials = plan.items.filter((i) => i.level === 'essentiel');
        const covered = P >= essentials.reduce((a, i) => a + i.normal, 0);
        return (P >= plan.normal ? sumOf(plan) === plan.normal : sumOf(plan) === P)
          && (!covered || essentials.every((i) => i.adapted === i.normal))
          && plan.items.every((i) => i.adapted >= 0 && i.adapted <= i.normal);
      }),
      { numRuns: 2000 },
    );
  });
  it('recalcul après coup : un encaissement déjà viré et un revenu revu à la baisse → ajustement', () => {
    const early = receipt('2026-11-02', 800, 'variable');
    const run = (exceptions: IncomeException[]) =>
      recomputeLedger({ receipts: [early], reviews: [], provisionUses: [], readings: [], configFor: () => config, incomes: DEFAULT_INCOMES, incomeExceptions: exceptions });
    let n = 0;
    const done: Transfer[] = reconcileTransfers(run([]).targets, [], 0, () => `t${++n}`).upsert.map((t) => ({ ...t, done: true, doneAt: '2026-11-02T10:00:00Z' }));
    expect(done.find((t) => t.toAccountId === 'livretA')!.amount).toBe(euros(80));
    const lower: IncomeException[] = [{ id: 'salaire:2026-11', incomeId: 'salaire', month: '2026-11', amount: euros(300) }];
    const second = reconcileTransfers(run(lower).targets, done, 1, () => `t${++n}`);
    expect(second.upsert).toEqual(expect.arrayContaining([expect.objectContaining({ isAdjustment: true, adjustmentKind: 'plus', toAccountId: 'livretA', amount: euros(50) })]));
  });
});

describe('Revenus mois par mois (exemple)', () => {
  const salary = DEFAULT_INCOMES[0];
  it('exception d’un mois, sans toucher aux autres', () => {
    const ex: IncomeException[] = [{ id: 'salaire:2027-02', incomeId: 'salaire', month: '2027-02', amount: euros(1450), reason: 'absence' }];
    expect(plannedIncome(DEFAULT_INCOMES, ex, [], '2027-02')).toBe(euros(1450));
    expect(plannedIncome(DEFAULT_INCOMES, ex, [], '2027-03')).toBe(euros(1600));
  });
  it('changement durable sans réécrire le passé ; l’exception reste prioritaire', () => {
    const changed = withScheduleChange(salary, '2027-09', euros(1750), '2026-11');
    expect(habitualAmount(changed, '2027-08')).toBe(euros(1600));
    expect(habitualAmount(changed, '2027-09')).toBe(euros(1750));
    const ex: IncomeException[] = [{ id: 'salaire:2027-10', incomeId: 'salaire', month: '2027-10', amount: euros(1500) }];
    expect(expectedFor(changed, '2027-10', ex).amount).toBe(euros(1500));
  });
  it('reçu en partie : reçu + reste attendu ; « ne viendra pas »', () => {
    const twice: ExpectedIncome[] = [{ id: 'aide', name: 'Aide', amount: euros(300), installments: 2, accountId: 'courant' }];
    expect(plannedIncome(twice, [], [receipt('2026-11-03', 150, 'aide')], '2026-11')).toBe(euros(300));
    const skip: IncomeException[] = [{ id: 'aide:2026-11', incomeId: 'aide', month: '2026-11', amount: euros(150), installments: [euros(150), 0], reason: 'ne-viendra-pas' }];
    expect(plannedIncome(twice, skip, [], '2026-11')).toBe(euros(150));
    expect(incomeStatuses(twice, [], '2026-11', '2026-11-02', [{ ...skip[0], amount: 0, installments: undefined }])[0].state).toBe('annule');
  });
  it('reçu inférieur : le réel remplace l’attendu', () => {
    expect(plannedIncome(DEFAULT_INCOMES, [], [receipt('2026-11-27', 1480, 'salaire')], '2026-11')).toBe(euros(1480));
  });
  it('estimation de retenue sur jours ouvrés', () => {
    expect(estimateWithholding(euros(1600), 2, 21)).toBe(euros(1448));
    expect(workingDays('2027-01')).toBe(20);
  });
});

describe('Abonnements (exemple)', () => {
  it('objectif = équivalents mensuels arrondis à l’euro supérieur', () => {
    const subs = [sub({ amount: 999 }), sub({ amount: 450 })];
    expect(subscriptionsTarget(subs, '2026-11')).toBe(euros(15));
    expect(subscriptionsTarget([...subs, sub({ frequency: 'yearly', amount: euros(60), month: 3, day: 10 })], '2026-11')).toBe(euros(20));
    expect(annualCost(sub({ amount: 999 }))).toBe(11988);
  });
  it('le 31 tombe le dernier jour des mois plus courts', () => {
    const s = sub({ day: 31 });
    expect(chargesInMonth(s, '2027-04').map((c) => c.date)).toEqual(['2027-04-30']);
    expect(chargesInMonth(s, '2028-02').map((c) => c.date)).toEqual(['2028-02-29']);
  });
  it('versé sur le compte réellement débité', () => {
    const subs = [sub({ amount: 1500, accountId: 'depenses' })];
    const { lines } = allocateReceipt(euros(15), { config: defaultConfig('2026-11', subs), funded: {}, cushionBalance: 0, receivingAccountId: 'courant' });
    expect(byAcc(lines)).toEqual({ depenses: 15 });
  });
  it('hausse de prix et export .ics', () => {
    const s = withNewPrice(sub({ amount: 999, day: 12 }), 1099, '2026-11-02');
    expect(lastPriceChange(s)).toMatchObject({ previous: 999, current: 1099, annualImpact: 1200 });
    const { ics, count } = subscriptionsIcs([sub({ day: 31 })], '2026-11-02', () => 'Compte courant', new Date('2026-11-02T00:00:00Z'));
    expect(count).toBe(1);
    expect(ics).toContain('RRULE:FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1');
  });
});
