import { allocateReceipt, totalsByEnvelope } from './allocation';
import { balanceAt } from './balances';
import { plannedIncome } from './income';
import { adaptBudget, type MonthPlan } from './plan';
import { addMonths, monthIndex } from './dates';
import { computeLeftovers, type LeftoverResult } from './review';
import type {
  AllocLine,
  BudgetConfig,
  Cents,
  ExpectedIncome,
  Flow,
  IncomeException,
  Month,
  ProvisionUse,
  Reading,
  Receipt,
  Review,
  TransferTarget,
} from './types';

export interface LedgerInput {
  receipts: Receipt[];
  reviews: Review[];
  provisionUses: ProvisionUse[];
  readings: Reading[];
  configFor: (month: Month) => BudgetConfig;
  /** Nom affiché d'un compte, pour les libellés de virements. */
  envelopeLabel?: (envelopeId: string, month: Month) => string;
  /** Revenus attendus : s'ils sont fournis, chaque mois adapte ses objectifs au revenu prévu. */
  incomes?: ExpectedIncome[];
  incomeExceptions?: IncomeException[];
  /** Objectifs fixés à la main, par mois puis par enveloppe. */
  monthTargets?: Record<Month, Record<string, Cents>>;
}

/** Plan d'un mois (revenu prévu, objectifs adaptés), à partir de sa configuration normale. */
export function planForMonth(
  input: Pick<LedgerInput, 'incomes' | 'incomeExceptions' | 'monthTargets' | 'receipts'>,
  config: BudgetConfig,
  month: Month,
): MonthPlan | null {
  if (!input.incomes) return null;
  const planned = plannedIncome(input.incomes, input.incomeExceptions ?? [], input.receipts, month);
  return adaptBudget(config, planned, input.monthTargets?.[month] ?? {});
}

export interface MonthLedger {
  month: Month;
  /** Configuration du mois, objectifs adaptés au revenu prévu. */
  config: BudgetConfig;
  /** Plan du mois (absent si l'adaptation n'est pas active). */
  plan?: MonthPlan;
  carryIn: Record<string, Cents>;
  /** Financé par enveloppe (reports inclus). */
  funded: Record<string, Cents>;
  received: Cents;
  receiptIds: string[];
  leftovers?: LeftoverResult;
}

export interface LedgerOutput {
  allocations: Record<string, AllocLine[]>;
  months: Record<Month, MonthLedger>;
  targets: TransferTarget[];
  flows: Flow[];
  /** Total financé par enveloppe, tous mois confondus. */
  allocatedTotals: Record<string, Cents>;
}

export const sortReceipts = (receipts: Receipt[]): Receipt[] =>
  [...receipts].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);

/**
 * Recalcule toute l'histoire, mois par mois et dans l'ordre chronologique :
 * reports du mois précédent, encaissements, puis reliquats de la revue.
 * Le solde du matelas évolue au fil de l'eau, ce qui décide de la phase d'épargne.
 */
export function recomputeLedger(input: LedgerInput): LedgerOutput {
  const flows: Flow[] = [];
  const targets: TransferTarget[] = [];
  const allocations: Record<string, AllocLine[]> = {};
  const months: Record<Month, MonthLedger> = {};
  const allocatedTotals: Record<string, Cents> = {};

  for (const use of input.provisionUses) {
    flows.push({ date: use.date, accountId: use.fromAccountId, amount: -use.amount });
    flows.push({ date: use.date, accountId: use.toAccountId, amount: use.amount });
    if (use.fromAccountId !== use.toAccountId) {
      targets.push({
        key: `p:${use.id}`,
        origin: 'provision',
        refId: use.id,
        month: use.date.slice(0, 7),
        date: use.date,
        fromAccountId: use.fromAccountId,
        toAccountId: use.toAccountId,
        amount: use.amount,
        lines: [{ label: use.reason || 'Utilisation de provision', amount: use.amount, envelopeId: use.envelopeId }],
      });
    }
  }

  const reviewsByMonth = new Map(input.reviews.map((r) => [r.month, r]));
  const monthSet = new Set<Month>([
    ...input.receipts.map((r) => r.month),
    ...input.reviews.filter((r) => r.completedAt).map((r) => r.month),
  ]);
  const sorted = [...monthSet].sort((a, b) => monthIndex(a) - monthIndex(b));
  // Inclure les mois intermédiaires vides pour propager correctement les reports.
  const allMonths: Month[] = [];
  if (sorted.length) {
    for (let m = sorted[0]; monthIndex(m) <= monthIndex(sorted[sorted.length - 1]); m = addMonths(m, 1)) allMonths.push(m);
  }

  const receiptsByMonth = new Map<Month, Receipt[]>();
  for (const r of sortReceipts(input.receipts)) {
    const list = receiptsByMonth.get(r.month) ?? [];
    list.push(r);
    receiptsByMonth.set(r.month, list);
  }

  let carryIn: Record<string, Cents> = {};
  const label = input.envelopeLabel;

  for (const month of allMonths) {
    const plan = planForMonth(input, input.configFor(month), month);
    const config = plan?.config ?? input.configFor(month);
    const cushionId = config.rules.savings.cushionAccountId;
    const funded: Record<string, Cents> = { ...carryIn };
    const ledger: MonthLedger = { month, config, ...(plan ? { plan } : {}), carryIn, funded, received: 0, receiptIds: [] };

    for (const receipt of receiptsByMonth.get(month) ?? []) {
      const cushionBalance = balanceAt(cushionId, receipt.date, input.readings, flows);
      const { lines } = allocateReceipt(receipt.amount, {
        config,
        funded,
        cushionBalance,
        receivingAccountId: receipt.accountId,
      });
      allocations[receipt.id] = lines;
      // Un renfort venu du matelas n'est pas un revenu : il débite le compte d'où il vient.
      if (receipt.internal) flows.push({ date: receipt.date, accountId: receipt.accountId, amount: -receipt.amount });
      else ledger.received += receipt.amount;
      ledger.receiptIds.push(receipt.id);
      for (const [envId, amount] of Object.entries(totalsByEnvelope(lines))) {
        funded[envId] = (funded[envId] ?? 0) + amount;
        allocatedTotals[envId] = (allocatedTotals[envId] ?? 0) + amount;
      }
      const byAccount = new Map<string, TransferTarget>();
      for (const line of lines) {
        flows.push({ date: receipt.date, accountId: line.accountId, amount: line.amount });
        if (line.accountId === receipt.accountId) continue;
        const key = `r:${receipt.id}:${line.accountId}`;
        const t = byAccount.get(key) ?? {
          key,
          origin: 'receipt' as const,
          refId: receipt.id,
          month,
          date: receipt.date,
          fromAccountId: receipt.accountId,
          toAccountId: line.accountId,
          amount: 0,
          lines: [],
        };
        t.amount += line.amount;
        const name = label ? label(line.envelopeId, month) : line.envelopeId;
        t.lines.push({ label: line.pocket ? `${name} · pocket « ${line.pocket} »` : name, amount: line.amount, envelopeId: line.envelopeId });
        byAccount.set(key, t);
      }
      targets.push(...byAccount.values());
    }

    const review = reviewsByMonth.get(month);
    carryIn = {};
    if (review?.completedAt) {
      const date = review.completedAt;
      const cushionBalance = balanceAt(cushionId, date, input.readings, flows);
      const leftovers = computeLeftovers(month, config, funded, review, cushionBalance, date);
      ledger.leftovers = leftovers;
      for (const f of leftovers.flows) flows.push({ date, ...f });
      targets.push(...leftovers.targets);
      carryIn = { ...leftovers.carried };
    }
    months[month] = ledger;
  }

  return { allocations, months, targets, flows, allocatedTotals };
}
