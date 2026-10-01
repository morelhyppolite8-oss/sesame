import { balanceAt, investedAt } from './balances';
import { addMonths, daysBetween, monthIndex, monthLabel, monthOf, ofMonth } from './dates';
import { detectIncomeRise, habitualAmount, incomeStatuses, significantVariance } from './income';
import type { MonthPlan } from './plan';
import { formatEUR, formatEUR0 } from './money';
import type { LedgerOutput, MonthLedger } from './recompute';
import { lastPriceChange, nextYearlyCharge, upcomingCharges } from './subscriptions';
import type { Account, Cents, ExpectedIncome, IncomeException, ISODate, Month, Reading, Receipt, Review, Subscription, Transfer } from './types';

/** Épargne d'un mois : financements des enveloppes `épargne` et reliquats non reportés. */
export function savedInMonth(ledger: MonthLedger): Cents {
  const savingsIds = ledger.config.envelopes.filter((e) => e.kind === 'epargne').map((e) => e.id);
  const allocated = savingsIds.reduce((a, id) => a + (ledger.funded[id] ?? 0) - (ledger.carryIn[id] ?? 0), 0);
  return allocated + (ledger.leftovers?.toSavings ?? 0);
}

export function savingsTarget(ledger: MonthLedger): Cents {
  return ledger.config.envelopes.filter((e) => e.kind === 'epargne' && !e.archived).reduce((a, e) => a + e.target, 0);
}

export const savingsRate = (ledger: MonthLedger): number =>
  ledger.received > 0 ? savedInMonth(ledger) / ledger.received : 0;

/** Manque de financement du mois, par enveloppe (objectif − financé). */
export function missingFunding(ledger: MonthLedger): { envelopeId: string; missing: Cents }[] {
  return ledger.config.envelopes
    .filter((e) => !e.archived)
    .sort((a, b) => a.priority - b.priority)
    .map((e) => ({ envelopeId: e.id, missing: Math.max(0, e.target - (ledger.funded[e.id] ?? 0)) }))
    .filter((m) => m.missing > 0);
}

export interface HealthIndicators {
  savingsRateMonth: number;
  savingsRateAverage: number;
  targetRate: number;
  cushion: Cents;
  cushionTarget: Cents;
  monthlySpending: Cents;
  cushionMonths: number;
  streak: number;
  within48h: number;
  transfersConsidered: number;
  score: number;
  label: string;
}

export interface HealthInput {
  ledger: LedgerOutput;
  transfers: Transfer[];
  reviews: Review[];
  readings: Reading[];
  today: ISODate;
  /** Solde projeté du matelas aujourd'hui. */
  cushion: Cents;
  cushionTarget: Cents;
  currentMonthLedger?: MonthLedger;
}

export function streakOf(months: MonthLedger[], currentMonth: Month): number {
  const sorted = [...months].sort((a, b) => monthIndex(b.month) - monthIndex(a.month));
  let streak = 0;
  let expected = addMonths(currentMonth, -1);
  for (const m of sorted) {
    if (monthIndex(m.month) > monthIndex(currentMonth)) continue;
    const met = savingsTarget(m) > 0 && savedInMonth(m) >= savingsTarget(m);
    // Le mois en cours n'est pas terminé : il compte s'il est atteint, sans casser la série sinon.
    if (m.month === currentMonth) {
      if (met) streak += 1;
      continue;
    }
    if (m.month !== expected || !met) break;
    streak += 1;
    expected = addMonths(m.month, -1);
  }
  return streak;
}

export function computeHealth(input: HealthInput): HealthIndicators {
  const currentMonth = monthOf(input.today);
  const months = Object.values(input.ledger.months).filter((m) => monthIndex(m.month) <= monthIndex(currentMonth));
  const current = input.currentMonthLedger ?? input.ledger.months[currentMonth];
  const withIncome = months.filter((m) => m.received > 0).slice(-12);
  const savingsRateAverage = withIncome.length
    ? withIncome.reduce((a, m) => a + savingsRate(m), 0) / withIncome.length
    : 0;
  const reference = current ?? months[months.length - 1];
  const budgetTotal = reference ? reference.config.envelopes.filter((e) => !e.archived).reduce((a, e) => a + e.target, 0) : 0;
  const targetRate = reference && budgetTotal > 0 ? savingsTarget(reference) / budgetTotal : 0.3;

  const spendingTargets = reference
    ? reference.config.envelopes.filter((e) => e.kind === 'depense' && !e.archived).reduce((a, e) => a + e.target, 0)
    : 0;
  const recentReviews = input.reviews.filter((r) => r.completedAt).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 3);
  const actualSpending = recentReviews.map((r) => Object.values(r.spent).reduce((a, b) => a + b, 0)).filter((v) => v > 0);
  const monthlySpending = actualSpending.length
    ? Math.round(actualSpending.reduce((a, b) => a + b, 0) / actualSpending.length)
    : spendingTargets;
  const cushionMonths = monthlySpending > 0 ? input.cushion / monthlySpending : 0;

  const streak = streakOf(months, currentMonth);

  const considered = input.transfers.filter((t) => !t.isAdjustment && (t.done || daysBetween(t.date, input.today) > 2));
  const fast = considered.filter((t) => t.done && t.doneAt && daysBetween(t.date, t.doneAt.slice(0, 10)) <= 2);
  const within48h = considered.length ? fast.length / considered.length : 1;

  const rate = current && current.received > 0 ? savingsRate(current) : savingsRateAverage;
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  const score = Math.round(
    35 * clamp(targetRate > 0 ? savingsRateAverage / targetRate : 0) +
    30 * clamp(cushionMonths / 3) +
    15 * clamp(streak / 6) +
    20 * clamp(within48h),
  );
  const label = score >= 80 ? 'Solide' : score >= 60 ? 'Sur de bons rails' : score >= 40 ? 'En construction' : 'Les fondations';

  return {
    savingsRateMonth: rate,
    savingsRateAverage,
    targetRate,
    cushion: input.cushion,
    cushionTarget: input.cushionTarget,
    monthlySpending,
    cushionMonths,
    streak,
    within48h,
    transfersConsidered: considered.length,
    score,
    label,
  };
}

export type AlertLevel = 'info' | 'attention' | 'celebration';

export interface Alert {
  id: string;
  level: AlertLevel;
  title: string;
  body: string;
  action?: { label: string; route?: string; command?: string; payload?: unknown };
  dismissible: boolean;
}

export interface AlertInput {
  today: ISODate;
  ledger: LedgerOutput;
  incomes: ExpectedIncome[];
  receipts: Receipt[];
  transfers: Transfer[];
  reviews: Review[];
  accounts: Account[];
  readings: Reading[];
  cushion: Cents;
  cushionTarget: Cents;
  cushionCelebrated: boolean;
  lastBackupAt?: ISODate;
  installedAt: ISODate;
  dismissed: string[];
  /** Dépenses importées du mois en cours, par enveloppe. */
  importedSpending?: Record<string, Cents>;
  accountName: (id: string) => string;
  envelopeName: (id: string) => string;
  subscriptions?: Subscription[];
  /** Financement de l'enveloppe Abonnements ce mois-ci. */
  subscriptionsFunding?: { funded: Cents; target: Cents };
  incomeExceptions?: IncomeException[];
  /** Plan du mois en cours. */
  currentPlan?: MonthPlan | null;
  /** Plans des trois prochains mois. */
  upcomingPlans?: { month: Month; plan: MonthPlan | null }[];
  cushionAccountName?: string;
}

const shortName = (name: string) => name.split(',')[0].trim().toLowerCase();

function planAlerts(input: AlertInput): Alert[] {
  const alerts: Alert[] = [];
  const month = monthOf(input.today);
  const plan = input.currentPlan;
  if (plan && plan.essentialMissing > 0) {
    alerts.push({
      id: `essential-${month}-${plan.essentialMissing}`,
      level: 'attention',
      title: `Il manque ${formatEUR(plan.essentialMissing, { compact: true })} pour couvrir l’essentiel`,
      body: `Le revenu prévu ne suffit pas pour tes dépenses essentielles. C’est exactement le rôle de ton matelas : vire ${formatEUR(plan.essentialMissing, { compact: true })} depuis ${input.cushionAccountName ?? 'le Livret A'}.`,
      action: { label: 'Utiliser le matelas', command: 'cushion-boost', payload: { month, amount: plan.essentialMissing } },
      dismissible: false,
    });
  }
  for (const { month: m, plan: p } of input.upcomingPlans ?? []) {
    if (!p || p.status !== 'serre') continue;
    const reduced = p.items
      .filter((i) => i.level === 'flexible' && i.adapted < i.normal)
      .sort((a, b) => b.normal - b.adapted - (a.normal - a.adapted))[0];
    const label = monthLabel(m);
    alerts.push({
      id: `tight-${m}-${p.delta}`,
      level: 'info',
      title: `${label.charAt(0).toUpperCase()}${label.slice(1)} sera serré (${formatEUR(p.delta, { compact: true })})`,
      body: reduced
        ? `Tes ${shortName(reduced.envelope.name)} passeront à ${formatEUR(reduced.adapted, { compact: true })} au lieu de ${formatEUR(reduced.normal, { compact: true })}, pour protéger l’essentiel.`
        : `Le revenu prévu est inférieur au budget habituel de ${formatEUR(-p.delta, { compact: true })}.`,
      action: { label: 'Voir les prévisions', route: `/previsions?mois=${m}` },
      dismissible: true,
    });
  }
  // Exception oubliée : un mois passé reçu à un montant différent, sans motif.
  const installMonth = monthOf(input.installedAt);
  for (let k = 1; k <= 3; k++) {
    const m = addMonths(month, -k);
    if (m < installMonth) break;
    for (const income of input.incomes.filter((i) => !i.archived && i.installments === 1)) {
      const habitual = habitualAmount(income, m);
      if (habitual === null || habitual === 0) continue;
      const received = input.receipts.filter((r) => r.month === m && r.incomeId === income.id && !r.internal);
      if (!received.length) continue;
      const total = received.reduce((a, r) => a + r.amount, 0);
      const exception = input.incomeExceptions?.find((e) => e.incomeId === income.id && e.month === m);
      if (!significantVariance(total, habitual) || exception?.reason) continue;
      alerts.push({
        id: `forgotten-${income.id}-${m}`,
        level: 'info',
        title: `${income.name} ${ofMonth(m)} : un motif ?`,
        body: `${formatEUR(total, { compact: true })} reçus au lieu de ${formatEUR(habitual, { compact: true })}. Ajouter le motif (prorata, absence, prime…) rendra ta rétrospective plus juste.`,
        action: { label: 'Ajouter un motif', route: `/previsions?mois=${m}` },
        dismissible: true,
      });
    }
  }
  return alerts;
}

const dayOf = (date: ISODate) => Number(date.slice(8, 10));

function subscriptionAlerts(input: AlertInput): Alert[] {
  const subs = input.subscriptions ?? [];
  const alerts: Alert[] = [];
  const funding = input.subscriptionsFunding;
  if (funding && funding.funded < funding.target) {
    for (const c of upcomingCharges(subs, input.today, 3)) {
      alerts.push({
        id: `sub-charge-${c.sub.id}-${c.date}`,
        level: 'attention',
        title: `${c.sub.name} : prélèvement ${c.daysLeft === 0 ? 'aujourd’hui' : c.daysLeft === 1 ? 'demain' : `le ${dayOf(c.date)}`}`,
        body: `${c.sub.name} est prélevé le ${dayOf(c.date)}, pense à garder ${formatEUR(c.amount, { compact: true })} sur ${input.accountName(c.sub.accountId)}. L’enveloppe Abonnements n’est pas encore financée ce mois-ci.`,
        action: { label: 'Voir le calendrier', route: '/calendrier' },
        dismissible: true,
      });
    }
  }
  for (const sub of subs.filter((s) => s.status === 'actif')) {
    if (sub.trialEnd && sub.trialEnd >= input.today && daysBetween(input.today, sub.trialEnd) <= 3) {
      alerts.push({
        id: `trial-${sub.id}-${sub.trialEnd}`,
        level: 'attention',
        title: `Fin d’essai : ${sub.name}`,
        body: `L’essai gratuit se termine le ${dayOf(sub.trialEnd)}. Ensuite, ${formatEUR(sub.amount, { compact: true })} seront prélevés. Si tu ne comptes pas le garder, c’est le moment de résilier.`,
        action: { label: 'Gérer l’abonnement', route: `/abonnements?edit=${sub.id}` },
        dismissible: true,
      });
    }
    const renewal = nextYearlyCharge(sub, input.today);
    if (renewal && daysBetween(input.today, renewal) <= 7) {
      alerts.push({
        id: `renewal-${sub.id}-${renewal}`,
        level: 'info',
        title: `Renouvellement annuel : ${sub.name}`,
        body: `${formatEUR(sub.amount, { compact: true })} seront prélevés le ${dayOf(renewal)} sur ${input.accountName(sub.accountId)}. Toujours utile ?`,
        action: { label: 'Voir l’abonnement', route: `/abonnements?edit=${sub.id}` },
        dismissible: true,
      });
    }
    const change = lastPriceChange(sub);
    if (change && change.current > change.previous && daysBetween(change.date, input.today) <= 30) {
      alerts.push({
        id: `price-${sub.id}-${change.date}-${change.current}`,
        level: 'attention',
        title: `${sub.name} augmente`,
        body: `De ${formatEUR(change.previous)} à ${formatEUR(change.current)}, soit ${formatEUR(change.annualImpact, { compact: true })} de plus par an.`,
        action: { label: 'Voir l’abonnement', route: `/abonnements?edit=${sub.id}` },
        dismissible: true,
      });
    }
  }
  const undated = subs.filter((s) => s.status === 'actif' && !s.day && s.frequency !== 'weekly');
  if (undated.length) {
    alerts.push({
      id: `sub-undated-${undated.map((s) => s.id).join('-')}`,
      level: 'info',
      title: `${undated.length} abonnement${undated.length > 1 ? 's' : ''} à compléter`,
      body: `Indique le jour de prélèvement de ${undated.map((s) => s.name).join(', ')} pour les voir dans le calendrier et être prévenu à temps.`,
      action: { label: 'Compléter', route: '/abonnements' },
      dismissible: true,
    });
  }
  return alerts;
}

export function computeAlerts(input: AlertInput): Alert[] {
  const alerts: Alert[] = [];
  const month = monthOf(input.today);
  const previous = addMonths(month, -1);

  // Revue du mois précédent à faire.
  const prevLedger = input.ledger.months[previous];
  const prevReview = input.reviews.find((r) => r.month === previous);
  if (prevLedger && prevLedger.receiptIds.length > 0 && !prevReview?.completedAt) {
    alerts.push({
      id: `review-${previous}`,
      level: 'info',
      title: `La revue ${ofMonth(previous)} t'attend`,
      body: 'Dix minutes pour comparer le prévu au réel et décider du sort des reliquats.',
      action: { label: 'Commencer la revue', route: `/revue/${previous}` },
      dismissible: false,
    });
  }

  // Ajustements à régulariser après un recalcul.
  const adjustments = input.transfers.filter((t) => !t.done && t.isAdjustment);
  if (adjustments.length) {
    alerts.push({
      id: `adjust-${adjustments.map((t) => `${t.id}${t.amount}`).join('-')}`,
      level: 'attention',
      title: `${adjustments.length > 1 ? `${adjustments.length} ajustements` : 'Un ajustement'} à régulariser`,
      body: 'Un recalcul a modifié des virements que tu avais déjà faits. Rien n’a été réécrit : il reste juste à régulariser la différence.',
      action: { label: 'Voir les virements', route: '/virements' },
      dismissible: false,
    });
  }

  // Célébration : matelas atteint.
  if (input.cushion >= input.cushionTarget && !input.cushionCelebrated) {
    alerts.push({
      id: 'cushion-reached',
      level: 'celebration',
      title: 'Ton matelas est complet',
      body: `${formatEUR0(input.cushionTarget)} de sécurité. Ton épargne passe en phase 2 : elle travaille désormais sur tes placements.`,
      action: { label: 'Merci', command: 'celebrate-cushion' },
      dismissible: false,
    });
  }

  // Revenus en retard.
  const installMonth = monthOf(input.installedAt);
  for (const m of [previous, month]) {
    // Pas d'alerte pour les mois antérieurs à l'installation, ni pour le mois d'installation s'il est vide.
    if (m < installMonth) continue;
    if (m === installMonth && !input.receipts.some((r) => r.month === m)) continue;
    for (const s of incomeStatuses(input.incomes, input.receipts, m, input.today, input.incomeExceptions)) {
      if (s.state !== 'retard') continue;
      if (m === previous && prevReview?.completedAt) continue;
      alerts.push({
        id: `late-${s.income.id}-${m}`,
        level: 'attention',
        title: `${s.income.name} : pas encore arrivé`,
        body: `Attendu pour ${monthLabel(m, false)}, il manque ${formatEUR(s.remaining, { compact: true })}. Rien d'inquiétant pour l'instant, garde un œil dessus.`,
        action: { label: "Je l'ai reçu", route: `/encaissement?source=${s.income.id}` },
        dismissible: true,
      });
    }
  }

  // Virements non cochés depuis plus de 3 jours.
  const stale = input.transfers.filter((t) => !t.done && daysBetween(t.date, input.today) > 3);
  if (stale.length) {
    const total = stale.reduce((a, t) => a + t.amount, 0);
    alerts.push({
      id: `stale-${stale.length}-${total}`,
      level: 'attention',
      title: `${stale.length} virement${stale.length > 1 ? 's' : ''} en suspens`,
      body: `${formatEUR(total, { compact: true })} attendent depuis plus de trois jours. Un instant suffit pour les faire.`,
      action: { label: 'Voir les virements', route: '/virements' },
      dismissible: true,
    });
  }

  // Enveloppes dépassées (relevé importé du mois en cours, puis dernière revue).
  const current = input.ledger.months[month];
  if (input.importedSpending && current) {
    for (const [envId, spent] of Object.entries(input.importedSpending)) {
      const funded = current.funded[envId] ?? 0;
      if (funded > 0 && spent > funded) {
        alerts.push({
          id: `over-${envId}-${month}`,
          level: 'attention',
          title: `${input.envelopeName(envId)} dépassée`,
          body: `${formatEUR(spent - funded, { compact: true })} au-delà de ce qui était prévu ce mois-ci.`,
          dismissible: true,
        });
      }
    }
  }
  if (prevLedger?.leftovers) {
    for (const item of prevLedger.leftovers.items.filter((i) => i.diff < 0)) {
      alerts.push({
        id: `over-${item.envelope.id}-${previous}`,
        level: 'attention',
        title: `${item.envelope.name} dépassée ${ofMonth(previous)}`,
        body: `${formatEUR(-item.diff, { compact: true })} au-delà du prévu. Le conseil de la revue peut aider ce mois-ci.`,
        dismissible: true,
      });
    }
  }

  // Hausse de revenu récurrent.
  for (const rise of detectIncomeRise(input.incomes, input.receipts, input.incomeExceptions)) {
    alerts.push({
      id: `rise-${rise.income.id}-${rise.newAmount}`,
      level: 'info',
      title: `${rise.income.name} en hausse`,
      body: `+${formatEUR(rise.rise, { compact: true })} sur les deux derniers versements. Et si toute la hausse partait en épargne ? Ton train de vie ne change pas, ton patrimoine si.`,
      action: { label: 'Envoyer la hausse en épargne', command: 'apply-rise', payload: rise },
      dismissible: true,
    });
  }

  // Plafonds.
  for (const a of input.accounts.filter((x) => !x.archived)) {
    if (a.ceiling) {
      const balance = balanceAt(a.id, input.today, input.readings, input.ledger.flows);
      if (balance >= a.ceiling * 0.9) {
        alerts.push({
          id: `ceiling-${a.id}-${Math.floor(balance / a.ceiling * 20)}`,
          level: 'attention',
          title: `${a.name} proche du plafond`,
          body: `${formatEUR0(balance)} sur ${formatEUR0(a.ceiling)}. Pense à rediriger les prochains versements.`,
          action: { label: 'Ajuster les règles', route: '/reglages/regles' },
          dismissible: true,
        });
      }
    }
    if (a.depositCeiling) {
      const invested = investedAt(a.id, input.today, input.readings, input.ledger.flows);
      if (invested >= a.depositCeiling * 0.9) {
        alerts.push({
          id: `deposit-${a.id}`,
          level: 'attention',
          title: `${a.name} proche du plafond de versements`,
          body: `${formatEUR0(invested)} versés sur ${formatEUR0(a.depositCeiling)}.`,
          dismissible: true,
        });
      }
    }
  }

  alerts.push(...planAlerts(input));
  alerts.push(...subscriptionAlerts(input));

  // Sauvegarde.
  const reference = input.lastBackupAt ?? input.installedAt;
  const age = daysBetween(reference, input.today);
  if (age > 30) {
    alerts.push({
      id: `backup-${input.today.slice(0, 7)}`,
      level: 'attention',
      title: 'Pense à sauvegarder',
      body: input.lastBackupAt
        ? `Dernière sauvegarde il y a ${age} jours. Tes données ne vivent que sur cet appareil.`
        : "Aucune sauvegarde pour l'instant. Tes données ne vivent que sur cet appareil.",
      action: { label: 'Sauvegarder maintenant', command: 'export' },
      dismissible: false,
    });
  }

  return alerts.filter((a) => !input.dismissed.includes(a.id));
}
