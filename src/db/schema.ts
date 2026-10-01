import Dexie, { type EntityTable } from 'dexie';
import type { BankTransaction, CsvRule } from '../engine/revolutCsv';
import type {
  Account,
  AllocLine,
  BudgetConfig,
  Envelope,
  ExpectedIncome,
  Goal,
  IncomeException,
  ISODate,
  Month,
  MonthTarget,
  ProvisionUse,
  Reading,
  Receipt,
  Review,
  Rules,
  Subscription,
  Transfer,
} from '../engine/types';

export type Theme = 'dark' | 'ivory';

export interface Settings {
  id: 'settings';
  rules: Rules;
  theme: Theme;
  onboarded: boolean;
  installedAt: ISODate;
  pinHash?: string;
  pinSalt?: string;
  lastBackupAt?: ISODate;
  cushionCelebrated: boolean;
  dismissedAlerts: string[];
  reminderDay: number;
  reminderHour: number;
  /** Mois pour lequel la revue a déjà été proposée automatiquement. */
  reviewPromptedFor?: Month;
  /** Données passées au modèle Abonnements + Marge (remplace l'enveloppe Fixe). */
  subscriptionsModel?: boolean;
  /** Niveaux et planchers des enveloppes initialisés. */
  planModel?: boolean;
}

export interface AllocationRecord {
  receiptId: string;
  month: Month;
  lines: AllocLine[];
}

export interface BudgetSnapshot {
  month: Month;
  config: BudgetConfig;
}

export class HyppoDB extends Dexie {
  settings!: EntityTable<Settings, 'id'>;
  accounts!: EntityTable<Account, 'id'>;
  readings!: EntityTable<Reading, 'id'>;
  envelopes!: EntityTable<Envelope, 'id'>;
  incomes!: EntityTable<ExpectedIncome, 'id'>;
  receipts!: EntityTable<Receipt, 'id'>;
  allocations!: EntityTable<AllocationRecord, 'receiptId'>;
  transfers!: EntityTable<Transfer, 'id'>;
  provisionUses!: EntityTable<ProvisionUse, 'id'>;
  goals!: EntityTable<Goal, 'id'>;
  reviews!: EntityTable<Review, 'month'>;
  budgets!: EntityTable<BudgetSnapshot, 'month'>;
  csvRules!: EntityTable<CsvRule, 'id'>;
  bankTransactions!: EntityTable<BankTransaction, 'id'>;
  subscriptions!: EntityTable<Subscription, 'id'>;
  incomeExceptions!: EntityTable<IncomeException, 'id'>;
  monthTargets!: EntityTable<MonthTarget, 'id'>;

  constructor(name = 'hyppo-patrimoine') {
    super(name);
    this.version(1).stores({
      settings: 'id',
      accounts: 'id, order',
      readings: 'id, accountId, date',
      envelopes: 'id, priority',
      incomes: 'id',
      receipts: 'id, date, month',
      allocations: 'receiptId, month',
      transfers: 'id, key, done, month',
      provisionUses: 'id, envelopeId, date',
      goals: 'id',
      reviews: 'month',
      budgets: 'month',
      csvRules: 'id, pattern',
      bankTransactions: 'id, month',
    });
    this.version(2).stores({ subscriptions: 'id, status' });
    this.version(3).stores({ incomeExceptions: 'id, incomeId, month', monthTargets: 'id, month' });
  }
}

export const db = new HyppoDB();

export const TABLES = [
  'settings', 'accounts', 'readings', 'envelopes', 'incomes', 'receipts', 'allocations', 'transfers',
  'provisionUses', 'goals', 'reviews', 'budgets', 'csvRules', 'bankTransactions', 'subscriptions',
  'incomeExceptions', 'monthTargets',
] as const;

export type TableName = (typeof TABLES)[number];
