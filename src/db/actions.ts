import { addMonths, monthIndex, monthOf, toISODate } from '../engine/dates';
import {
  DEFAULT_ACCOUNTS,
  DEFAULT_ENVELOPES,
  DEFAULT_GOALS,
  DEFAULT_INCOMES,
  DEFAULT_RULES,
  defaultSubscriptions,
} from '../engine/defaults';
import type { IncomeRise } from '../engine/income';
import { reconcileTransfers } from '../engine/reconcile';
import { learnRule, type BankTransaction } from '../engine/revolutCsv';
import { exceptionId, habitualAmount, withScheduleChange } from '../engine/income';
import { floorOf, levelOf } from '../engine/plan';
import { lastPriceChange, withNewPrice, type PriceChange } from '../engine/subscriptions';
import type {
  Account,
  Cents,
  Envelope,
  ExpectedIncome,
  Goal,
  IncomeException,
  IncomeReason,
  ISODate,
  Month,
  ProvisionUse,
  Reading,
  Receipt,
  Review,
  Rules,
  Subscription,
  SubscriptionStatus,
} from '../engine/types';
import { goalCurrent } from './derive';
import { buildLedger, currentConfig, loadSnapshot } from './ledger';
import { db, TABLES, type Settings, type TableName } from './schema';

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const todayISO = (): ISODate => toISODate(new Date());

const ALL = TABLES.map((t) => db.table(t));

/** Crée la configuration par défaut au tout premier lancement. */
export async function seedDefaults(): Promise<void> {
  await db.transaction('rw', ALL, async () => {
    if (await db.settings.get('settings')) return;
    await db.settings.put({
      id: 'settings',
      rules: structuredClone(DEFAULT_RULES),
      theme: 'dark',
      onboarded: false,
      installedAt: todayISO(),
      cushionCelebrated: false,
      dismissedAlerts: [],
      reminderDay: 1,
      reminderHour: 19,
      subscriptionsModel: true,
      planModel: true,
    });
    await db.accounts.bulkPut(structuredClone(DEFAULT_ACCOUNTS));
    await db.subscriptions.bulkPut(defaultSubscriptions(todayISO()).map((sub, i) => ({ ...sub, createdAt: Date.now() + i })));
    await db.envelopes.bulkPut(structuredClone(DEFAULT_ENVELOPES));
    await db.incomes.bulkPut(structuredClone(DEFAULT_INCOMES));
    await db.goals.bulkPut(structuredClone(DEFAULT_GOALS).map((g, i) => ({ ...g, createdAt: Date.now() + i })));
  });
}

/**
 * Recalcule tout (moteur pur), met à jour les allocations et aligne les virements
 * en conservant ceux qui sont cochés.
 */
export async function sync(): Promise<void> {
  await db.transaction('rw', ALL, async () => {
    const snap = await loadSnapshot();
    if (!snap) return;
    const ledger = buildLedger(snap);
    const { upsert, remove } = reconcileTransfers(ledger.targets, snap.transfers, Date.now(), uid);
    if (remove.length) await db.transfers.bulkDelete(remove);
    if (upsert.length) await db.transfers.bulkPut(upsert);
    await db.allocations.clear();
    await db.allocations.bulkPut(
      snap.receipts.map((r) => ({ receiptId: r.id, month: r.month, lines: ledger.allocations[r.id] ?? [] })),
    );
    // Objectifs atteints : on date le premier jour d'atteinte.
    const today = todayISO();
    for (const goal of snap.goals) {
      if (goal.achievedAt) continue;
      const current = goalCurrent(goal, snap, ledger, today);
      if (current >= goal.target) await db.goals.update(goal.id, { achievedAt: today });
    }
  });
}

async function settings(): Promise<Settings> {
  const s = await db.settings.get('settings');
  if (!s) throw new Error('Réglages introuvables');
  return s;
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  await db.settings.update('settings', patch);
}

async function configSources() {
  const [envelopes, s, subscriptions] = await Promise.all([db.envelopes.toArray(), settings(), db.subscriptions.toArray()]);
  return { envelopes, settings: s, subscriptions };
}

/** Fige la configuration budgétaire d'un mois, si ce n'est pas déjà fait. */
async function ensureBudget(month: Month): Promise<void> {
  if (await db.budgets.get(month)) return;
  await db.budgets.put({ month, config: structuredClone(currentConfig(await configSources(), month)) });
}

/**
 * Après un changement de réglages ou d'abonnements : applique la nouvelle configuration
 * au mois en cours et aux suivants. Les mois passés gardent leur configuration figée.
 */
async function refreshBudgetsFromCurrentMonth(): Promise<void> {
  const [sources, budgets] = await Promise.all([configSources(), db.budgets.toArray()]);
  const current = monthOf(todayISO());
  const touched = budgets.filter((b) => monthIndex(b.month) >= monthIndex(current));
  await db.budgets.bulkPut(touched.map((b) => ({ month: b.month, config: structuredClone(currentConfig(sources, b.month)) })));
}

/**
 * Migration vers le modèle « Abonnements + Marge pour imprévus » (remplace l'enveloppe Fixe),
 * avec les abonnements par défaut. Idempotente ; s'applique aussi à une ancienne sauvegarde importée.
 */
export async function ensureSubscriptionsModel(): Promise<void> {
  let migrated = false;
  await db.transaction('rw', ALL, async () => {
    const s = await db.settings.get('settings');
    if (!s || s.subscriptionsModel) return;
    const envelopes = await db.envelopes.toArray();
    if (!envelopes.some((e) => e.auto === 'subscriptions')) {
      const fixe = envelopes.find((e) => e.id === 'fixe' && !e.archived);
      const added = fixe ? 2 : 1;
      for (const e of envelopes) if (e.id !== 'fixe') await db.envelopes.update(e.id, { priority: e.priority + added });
      const defaults = DEFAULT_ENVELOPES.filter((e) => e.id === 'abonnements' || (fixe && e.id === 'marge'));
      await db.envelopes.bulkPut(structuredClone(defaults).map((e, i) => ({ ...e, priority: i + 1 })));
      if (fixe) await db.envelopes.update('fixe', { archived: true });
    }
    if ((await db.subscriptions.count()) === 0) {
      await db.subscriptions.bulkPut(defaultSubscriptions(s.installedAt).map((sub, i) => ({ ...sub, createdAt: Date.now() + i })));
    }
    await db.settings.update('settings', { subscriptionsModel: true });
    migrated = true;
  });
  if (migrated) await afterConfigChange();
}

async function afterConfigChange() {
  await refreshBudgetsFromCurrentMonth();
  await sync();
}

// ─── Abonnements ──────────────────────────────────────────────────────

/**
 * Enregistre un abonnement. Un changement de montant est ajouté à l'historique des prix ;
 * l'objectif de l'enveloppe Abonnements est mis à jour à partir du mois en cours.
 * Renvoie le changement de prix éventuel, pour l'afficher.
 */
export async function saveSubscription(input: Subscription): Promise<PriceChange | null> {
  const previous = await db.subscriptions.get(input.id);
  const today = todayISO();
  let record: Subscription = { ...input };
  if (previous) {
    record = { ...input, amount: previous.amount, priceHistory: previous.priceHistory };
    record = withNewPrice(record, input.amount, today);
  } else if (!record.priceHistory.length) {
    record.priceHistory = [{ date: record.startDate, amount: record.amount }];
  }
  await db.subscriptions.put(record);
  await afterConfigChange();
  return previous && previous.amount !== input.amount ? lastPriceChange(record) : null;
}

export async function setSubscriptionStatus(id: string, status: SubscriptionStatus): Promise<void> {
  await db.subscriptions.update(id, status === 'actif' ? { status, statusSince: undefined } : { status, statusSince: todayISO() });
  await afterConfigChange();
}

export async function deleteSubscription(id: string): Promise<void> {
  await db.subscriptions.delete(id);
  await afterConfigChange();
}

// ─── Premier lancement ────────────────────────────────────────────────

/** Configuration saisie dans l'assistant du premier lancement. */
export interface SetupData {
  pinHash: string;
  pinSalt: string;
  accounts: Account[];
  balances: Record<string, { value: Cents; invested?: Cents }>;
  incomes: ExpectedIncome[];
  envelopes: Envelope[];
  subscriptions: Subscription[];
  goals: Goal[];
  rules: Rules;
}

/**
 * Enregistre la configuration personnelle (uniquement dans IndexedDB, sur cet appareil)
 * et termine le premier lancement. Les références vers des comptes ou enveloppes supprimés sont réparées.
 */
export async function completeSetup(data: SetupData): Promise<void> {
  const today = todayISO();
  const accountIds = new Set(data.accounts.map((a) => a.id));
  const firstCurrent = data.accounts.find((a) => a.type === 'courant' || a.type === 'revolut')?.id ?? data.accounts[0]?.id ?? '';
  const fixAccount = (id: string | null | undefined) => (id && accountIds.has(id) ? id : firstCurrent);
  const envelopes = data.envelopes.map((e, i) => ({
    ...e,
    priority: i + 1,
    accountId: e.kind === 'epargne' && !e.accountId ? null : fixAccount(e.accountId),
    ...(e.spendAccountId ? { spendAccountId: fixAccount(e.spendAccountId) } : {}),
  }));
  const envelopeIds = new Set(envelopes.map((e) => e.id));
  const savingsEnvelope = envelopes.find((e) => e.kind === 'epargne') ?? envelopes[0];
  const livret = data.accounts.find((a) => a.id === data.rules.savings.cushionAccountId) ?? data.accounts.find((a) => a.type === 'livretA' || a.type === 'ldds') ?? data.accounts[0];
  const surplus = data.rules.surplus.filter((r) => envelopeIds.has(r.envelopeId));
  const rules: Rules = {
    savings: {
      cushionAccountId: livret?.id ?? '',
      cushionTarget: data.rules.savings.cushionTarget,
      phase2: data.rules.savings.phase2.filter((p) => accountIds.has(p.accountId) && p.weight > 0),
    },
    surplus: surplus.length ? surplus : savingsEnvelope ? [{ envelopeId: savingsEnvelope.id, pct: 100 }] : [],
    leftoverEnvelopeId: envelopeIds.has(data.rules.leftoverEnvelopeId) ? data.rules.leftoverEnvelopeId : savingsEnvelope?.id ?? '',
  };
  await db.transaction('rw', ALL, async () => {
    for (const t of ['accounts', 'envelopes', 'incomes', 'subscriptions', 'goals', 'readings', 'budgets'] as const) await db.table(t).clear();
    await db.accounts.bulkPut(data.accounts.map((a, i) => ({ ...a, order: i })));
    await db.envelopes.bulkPut(envelopes);
    await db.incomes.bulkPut(data.incomes.map((i) => ({ ...i, accountId: fixAccount(i.accountId) })));
    await db.subscriptions.bulkPut(
      data.subscriptions.map((sub, i) => ({
        ...sub,
        accountId: fixAccount(sub.accountId),
        startDate: sub.startDate || today,
        priceHistory: sub.priceHistory.length ? sub.priceHistory : [{ date: sub.startDate || today, amount: sub.amount }],
        createdAt: sub.createdAt || Date.now() + i,
      })),
    );
    await db.goals.bulkPut(
      data.goals.map((g, i) => ({
        ...g,
        link: g.link.type === 'account' && !accountIds.has(g.link.id) ? { type: 'savings' as const } : g.link.type === 'envelope' && !envelopeIds.has(g.link.id) ? { type: 'savings' as const } : g.link,
        createdAt: g.createdAt || Date.now() + i,
      })),
    );
    await db.readings.bulkPut(
      data.accounts.map((a) => ({
        id: uid(),
        accountId: a.id,
        date: today,
        value: data.balances[a.id]?.value ?? 0,
        ...(data.balances[a.id]?.invested !== undefined ? { invested: data.balances[a.id].invested } : {}),
      })),
    );
    await db.settings.update('settings', {
      rules,
      onboarded: true,
      pinHash: data.pinHash,
      pinSalt: data.pinSalt,
      installedAt: today,
      subscriptionsModel: true,
      planModel: true,
    });
  });
  await sync();
}

// ─── Encaissements ────────────────────────────────────────────────────

export type ReceiptInput = Omit<Receipt, 'id' | 'createdAt'>;

export async function addReceipt(input: ReceiptInput): Promise<string> {
  const id = uid();
  await ensureBudget(input.month);
  await db.receipts.add({ ...input, id, createdAt: Date.now() });
  await sync();
  return id;
}

export async function updateReceipt(id: string, patch: Partial<ReceiptInput>): Promise<void> {
  if (patch.month) await ensureBudget(patch.month);
  await db.receipts.update(id, patch);
  await sync();
}

export async function deleteReceipt(id: string): Promise<void> {
  await db.receipts.delete(id);
  await sync();
}

// ─── Virements ────────────────────────────────────────────────────────

export async function setTransferDone(id: string, done: boolean): Promise<void> {
  await db.transfers.update(id, done ? { done: true, doneAt: new Date().toISOString() } : { done: false, doneAt: undefined });
  await sync();
}

export async function setTransfersDone(ids: string[]): Promise<void> {
  const doneAt = new Date().toISOString();
  await db.transaction('rw', db.transfers, async () => {
    for (const id of ids) await db.transfers.update(id, { done: true, doneAt });
  });
  await sync();
}

// ─── Provisions ───────────────────────────────────────────────────────

export async function addProvisionUse(input: Omit<ProvisionUse, 'id' | 'createdAt'>): Promise<string> {
  const id = uid();
  await db.provisionUses.add({ ...input, id, createdAt: Date.now() });
  await sync();
  return id;
}

export async function deleteProvisionUse(id: string): Promise<void> {
  await db.provisionUses.delete(id);
  await sync();
}

// ─── Revue mensuelle ──────────────────────────────────────────────────

export async function saveReviewDraft(review: Review): Promise<void> {
  await db.reviews.put(review);
}

export async function completeReview(review: Review): Promise<void> {
  await ensureBudget(review.month);
  await db.reviews.put({ ...review, completedAt: review.completedAt ?? todayISO() });
  await sync();
}

export async function reopenReview(month: Month): Promise<void> {
  await db.reviews.update(month, { completedAt: undefined, snapshot: undefined, step: 0 });
  await sync();
}

// ─── Relevés et patrimoine ────────────────────────────────────────────

export async function addReadings(readings: Omit<Reading, 'id'>[]): Promise<void> {
  await db.readings.bulkAdd(readings.map((r) => ({ ...r, id: uid() })));
  await sync();
}

export async function deleteReading(id: string): Promise<void> {
  await db.readings.delete(id);
  await sync();
}

// ─── Objectifs ────────────────────────────────────────────────────────

export async function saveGoal(goal: Omit<Goal, 'id' | 'createdAt'> & { id?: string; createdAt?: number }): Promise<void> {
  const record: Goal = { ...goal, id: goal.id ?? uid(), createdAt: goal.createdAt ?? Date.now() };
  if (record.achievedAt === undefined) delete record.achievedAt;
  await db.goals.put(record);
  await sync();
}

export async function deleteGoal(id: string): Promise<void> {
  await db.goals.delete(id);
}

// ─── Réglages : enveloppes, comptes, revenus, règles ──────────────────

export async function saveEnvelope(env: Envelope): Promise<void> {
  await db.envelopes.put(env);
  await afterConfigChange();
}

export async function archiveEnvelope(id: string): Promise<void> {
  const s = await settings();
  const rules = s.rules;
  if (rules.leftoverEnvelopeId === id) throw new Error("Cette enveloppe reçoit les reliquats : change d'abord la règle.");
  await db.envelopes.update(id, { archived: true });
  await db.settings.update('settings', { rules: { ...rules, surplus: rules.surplus.filter((r) => r.envelopeId !== id) } });
  await afterConfigChange();
}

export async function restoreEnvelope(id: string): Promise<void> {
  await db.envelopes.update(id, { archived: false });
  await afterConfigChange();
}

export async function reorderEnvelopes(ids: string[]): Promise<void> {
  await db.transaction('rw', db.envelopes, async () => {
    for (const [i, id] of ids.entries()) await db.envelopes.update(id, { priority: i + 1 });
  });
  await afterConfigChange();
}

export async function saveAccount(account: Account): Promise<void> {
  await db.accounts.put(account);
  await sync();
}

/**
 * Enregistre un revenu attendu. Un nouveau montant par défaut s'applique à partir de `fromMonth`
 * (le mois en cours par défaut), sans jamais réécrire les mois passés. Tout est recalculé aussitôt.
 */
export async function saveIncome(income: ExpectedIncome, fromMonth?: Month): Promise<void> {
  const previous = await db.incomes.get(income.id);
  let record = income;
  const current = monthOf(todayISO());
  const from = fromMonth ?? current;
  if (previous && income.amount !== null && previous.amount !== null) {
    record = habitualAmount(previous, from) !== income.amount
      ? withScheduleChange({ ...income, amount: previous.amount, schedule: previous.schedule }, from, income.amount, current)
      : { ...income, schedule: previous.schedule, amount: previous.amount };
  }
  await db.incomes.put(record);
  await sync();
}

/** Changement durable : nouveau montant habituel à partir d'un mois choisi. */
export async function setDurableIncome(incomeId: string, from: Month, amount: Cents): Promise<void> {
  const income = await db.incomes.get(incomeId);
  if (!income) return;
  await db.incomes.put(withScheduleChange(income, from, amount, monthOf(todayISO())));
  await sync();
}

/** Montant attendu pour un mois précis (exception), sans toucher aux autres mois. */
export async function setIncomeException(input: Omit<IncomeException, 'id'>): Promise<void> {
  await db.incomeExceptions.put({ ...input, id: exceptionId(input.incomeId, input.month) });
  await sync();
}

/** Rétablit le montant habituel d'un mois. */
export async function clearIncomeException(incomeId: string, month: Month): Promise<void> {
  await db.incomeExceptions.delete(exceptionId(incomeId, month));
  await sync();
}

/**
 * Réponse à « exceptionnel ou nouveau salaire ? » après un encaissement différent de l'attendu.
 * Exceptionnel : seul ce mois est concerné. Nouveau salaire : nouveau montant habituel dès ce mois.
 */
export async function answerIncomeVariance(receiptId: string, choice: 'exceptional' | 'durable', reason?: IncomeReason): Promise<void> {
  const receipt = await db.receipts.get(receiptId);
  if (!receipt?.incomeId) return;
  const received = (await db.receipts.where('month').equals(receipt.month).toArray())
    .filter((r) => r.incomeId === receipt.incomeId && !r.internal)
    .reduce((a, r) => a + r.amount, 0);
  if (choice === 'exceptional') {
    await db.incomeExceptions.put({ id: exceptionId(receipt.incomeId, receipt.month), incomeId: receipt.incomeId, month: receipt.month, amount: received, reason: reason ?? 'autre' });
  } else {
    const income = await db.incomes.get(receipt.incomeId);
    if (income) await db.incomes.put(withScheduleChange(income, receipt.month, received, monthOf(todayISO())));
    await db.incomeExceptions.delete(exceptionId(receipt.incomeId, receipt.month));
  }
  await db.receipts.update(receiptId, { varianceAnswered: true });
  await sync();
}

/** Objectif fixé à la main pour une enveloppe et un mois (`null` : revenir à l'adaptation automatique). */
export async function setMonthTarget(month: Month, envelopeId: string, target: Cents | null): Promise<void> {
  const id = `${month}:${envelopeId}`;
  if (target === null) await db.monthTargets.delete(id);
  else await db.monthTargets.put({ id, month, envelopeId, target });
  await sync();
}

/** Renfort depuis le matelas pour couvrir l'essentiel : un encaissement interne, pas un revenu. */
export async function boostFromCushion(month: Month, amount: Cents): Promise<string> {
  const s = await settings();
  return addReceipt({
    amount,
    date: todayISO() < `${month}-01` ? `${month}-01` : todayISO(),
    month,
    source: 'Renfort du matelas',
    accountId: s.rules.savings.cushionAccountId,
    internal: true,
    note: 'Pour couvrir l’essentiel',
  });
}

/** Initialise les niveaux et planchers des enveloppes existantes. */
export async function ensurePlanModel(): Promise<void> {
  let migrated = false;
  await db.transaction('rw', ALL, async () => {
    const s = await db.settings.get('settings');
    if (!s || s.planModel) return;
    for (const e of await db.envelopes.toArray()) {
      if (e.level === undefined || e.floor === undefined) await db.envelopes.update(e.id, { level: levelOf(e), floor: floorOf(e) });
    }
    await db.settings.update('settings', { planModel: true });
    migrated = true;
  });
  if (migrated) await afterConfigChange();
}

export async function saveRules(rules: Rules): Promise<void> {
  await db.settings.update('settings', { rules });
  await afterConfigChange();
}

export async function applyIncomeRise(rise: IncomeRise): Promise<void> {
  const s = await settings();
  const target = (await db.envelopes.get(s.rules.leftoverEnvelopeId)) ?? (await db.envelopes.filter((e) => e.kind === 'epargne').first());
  const income = await db.incomes.get(rise.income.id);
  const current = monthOf(todayISO());
  if (income) await db.incomes.put(withScheduleChange(income, current, rise.newAmount, current));
  if (target) await db.envelopes.update(target.id, { target: target.target + rise.rise });
  await afterConfigChange();
}

export async function dismissAlert(id: string): Promise<void> {
  const s = await settings();
  await db.settings.update('settings', { dismissedAlerts: [...new Set([...s.dismissedAlerts, id])].slice(-200) });
}

// ─── Import Revolut ───────────────────────────────────────────────────

export async function saveBankTransactions(transactions: BankTransaction[]): Promise<void> {
  await db.bankTransactions.bulkPut(transactions);
}

export async function recategorize(tx: BankTransaction, envelopeId: string | null): Promise<void> {
  await db.bankTransactions.update(tx.id, { envelopeId, categorizedBy: 'manual' });
  if (!envelopeId) return;
  const rules = await db.csvRules.toArray();
  const next = learnRule(rules, tx.description, envelopeId, Date.now(), uid());
  await db.transaction('rw', db.csvRules, async () => {
    await db.csvRules.clear();
    await db.csvRules.bulkPut(next);
  });
}

export async function deleteBankMonth(month: Month): Promise<void> {
  await db.bankTransactions.where('month').equals(month).delete();
}

// ─── Sauvegarde ───────────────────────────────────────────────────────

export const BACKUP_VERSION = 1;

export interface Backup {
  app: 'hyppo-patrimoine';
  version: number;
  exportedAt: string;
  data: Record<TableName, unknown[]>;
}

export async function exportBackup(): Promise<Backup> {
  const data = {} as Record<TableName, unknown[]>;
  await db.transaction('r', ALL, async () => {
    for (const t of TABLES) data[t] = await db.table(t).toArray();
  });
  const backup: Backup = { app: 'hyppo-patrimoine', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data };
  await db.settings.update('settings', { lastBackupAt: todayISO() });
  return backup;
}

export function validateBackup(raw: unknown): Backup {
  const b = raw as Partial<Backup>;
  if (!b || typeof b !== 'object' || b.app !== 'hyppo-patrimoine') {
    throw new Error("Ce fichier n'est pas une sauvegarde Hyppo Patrimoine.");
  }
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) {
    throw new Error('Cette sauvegarde vient d’une version plus récente de l’appli.');
  }
  if (!b.data || !Array.isArray(b.data.settings) || b.data.settings.length !== 1) {
    throw new Error('Sauvegarde incomplète : réglages manquants.');
  }
  for (const t of TABLES) {
    const rows = (b.data as Record<string, unknown>)[t];
    if (rows !== undefined && !Array.isArray(rows)) throw new Error(`Sauvegarde abîmée : table « ${t} » illisible.`);
  }
  return b as Backup;
}

export async function importBackup(raw: unknown): Promise<void> {
  const backup = validateBackup(raw);
  await db.transaction('rw', ALL, async () => {
    for (const t of TABLES) {
      await db.table(t).clear();
      const rows = backup.data[t] ?? [];
      if (rows.length) await db.table(t).bulkPut(rows);
    }
  });
  await ensureSubscriptionsModel();
  await ensurePlanModel();
  await sync();
}

export async function resetAll(): Promise<void> {
  await db.transaction('rw', ALL, async () => {
    for (const t of TABLES) await db.table(t).clear();
  });
  await seedDefaults();
}

/** Mois à proposer pour la revue : le mois précédent, s'il a des encaissements et n'est pas revu. */
export async function reviewToPropose(): Promise<Month | null> {
  const s = await settings();
  const prev = addMonths(monthOf(todayISO()), -1);
  if (s.reviewPromptedFor === prev) return null;
  const [count, review] = await Promise.all([db.receipts.where('month').equals(prev).count(), db.reviews.get(prev)]);
  if (count === 0 || review?.completedAt) return null;
  return prev;
}
