import { euros } from './money';
import { applySubscriptions } from './subscriptions';
import type { Account, BudgetConfig, Envelope, ExpectedIncome, Goal, Month, Rules, Subscription } from './types';

/*
 * Configuration d'EXEMPLE, générique : elle sert de point de départ à l'assistant du premier lancement.
 * Les vraies valeurs sont saisies par l'utilisateur et ne vivent que dans son navigateur (IndexedDB).
 */

export const DEFAULT_ACCOUNTS: Account[] = [
  { id: 'courant', name: 'Compte courant', type: 'courant', order: 0 },
  { id: 'depenses', name: 'Compte de dépenses', type: 'revolut', order: 1 },
  { id: 'livretA', name: 'Livret A', type: 'livretA', ceiling: euros(22_950), order: 2 },
  { id: 'ldds', name: 'LDDS', type: 'ldds', ceiling: euros(12_000), order: 3 },
  { id: 'pea', name: 'PEA', type: 'pea', depositCeiling: euros(150_000), order: 4 },
  { id: 'av', name: 'Assurance-vie', type: 'av', order: 5 },
  { id: 'cto', name: 'CTO', type: 'cto', order: 6 },
];

export const DEFAULT_ENVELOPES: Envelope[] = [
  { id: 'abonnements', name: 'Abonnements', kind: 'depense', accountId: 'courant', target: 0, priority: 1, auto: 'subscriptions', level: 'essentiel', floor: 0, detail: 'Calculé depuis tes abonnements' },
  { id: 'logement', name: 'Logement et charges', kind: 'depense', accountId: 'courant', target: euros(330), priority: 2, level: 'essentiel', floor: 0 },
  { id: 'courses', name: 'Courses', kind: 'depense', accountId: 'depenses', target: euros(340), priority: 3, level: 'essentiel', floor: 0 },
  { id: 'marge', name: 'Marge pour imprévus', kind: 'depense', accountId: 'courant', target: euros(50), priority: 4, level: 'flexible', floor: 0 },
  { id: 'epargne', name: 'Épargne', kind: 'epargne', accountId: null, target: euros(500), priority: 5, level: 'important', floor: euros(80), detail: 'Selon les règles de phase' },
  { id: 'vacances', name: 'Provision vacances', kind: 'provision', accountId: 'ldds', target: euros(90), priority: 6, level: 'important', floor: euros(40), openingBalance: 0, spendAccountId: 'depenses' },
  { id: 'vetements', name: 'Provision vêtements', kind: 'provision', accountId: 'ldds', target: euros(40), priority: 7, level: 'flexible', floor: 0, openingBalance: 0, spendAccountId: 'depenses' },
  { id: 'sorties', name: 'Sorties, restos, loisirs', kind: 'depense', accountId: 'depenses', target: euros(250), priority: 8, level: 'flexible', floor: euros(80) },
];

/** Aucun abonnement par défaut : l'assistant propose des suggestions. */
export function defaultSubscriptions(_startDate: string): Subscription[] {
  return [];
}

export const DEFAULT_SUBSCRIPTIONS: Subscription[] = [];

export const DEFAULT_RULES: Rules = {
  savings: {
    cushionAccountId: 'livretA',
    cushionTarget: euros(3_000),
    phase2: [
      { accountId: 'pea', weight: 70 },
      { accountId: 'av', weight: 20 },
      { accountId: 'cto', weight: 10 },
    ],
  },
  surplus: [
    { envelopeId: 'epargne', pct: 80 },
    { envelopeId: 'sorties', pct: 20 },
  ],
  leftoverEnvelopeId: 'epargne',
};

export const DEFAULT_INCOMES: ExpectedIncome[] = [
  { id: 'salaire', name: 'Salaire', amount: euros(1_600), installments: 1, windowStart: 25, windowEnd: 5, accountId: 'courant' },
  { id: 'variable', name: 'Revenus variables', amount: null, installments: 1, accountId: 'courant' },
];

export const DEFAULT_GOALS: Goal[] = [
  { id: 'matelas', name: 'Matelas de précaution', target: euros(3_000), link: { type: 'account', id: 'livretA' }, createdAt: 0 },
];

export const defaultConfig = (month: Month = '2026-10', subscriptions: Subscription[] = DEFAULT_SUBSCRIPTIONS): BudgetConfig =>
  structuredClone({ envelopes: applySubscriptions(DEFAULT_ENVELOPES, subscriptions, month), rules: DEFAULT_RULES });
