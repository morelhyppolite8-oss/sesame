/** Montant en centimes d'euro, toujours entier. */
export type Cents = number;
/** Date au format AAAA-MM-JJ. */
export type ISODate = string;
/** Mois budgétaire au format AAAA-MM. */
export type Month = string;

export type AccountType = 'courant' | 'revolut' | 'livretA' | 'ldds' | 'pea' | 'av' | 'cto';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  openedAt?: ISODate;
  /** Plafond de solde (livrets). */
  ceiling?: Cents;
  /** Plafond de versements (PEA). */
  depositCeiling?: Cents;
  order: number;
  archived?: boolean;
}

/** Relevé manuel d'un compte : solde (ou valeur) et, pour les placements, montant versé cumulé. */
export interface Reading {
  id: string;
  accountId: string;
  date: ISODate;
  value: Cents;
  invested?: Cents;
}

export type EnvelopeKind = 'depense' | 'provision' | 'epargne';

export interface Envelope {
  id: string;
  name: string;
  kind: EnvelopeKind;
  /** Compte de destination. `null` pour l'Épargne : le compte dépend des règles de phase. */
  accountId: string | null;
  pocket?: string;
  target: Cents;
  priority: number;
  detail?: string;
  /** Provisions : solde de départ. */
  openingBalance?: Cents;
  /** Provisions : compte crédité lors d'une utilisation. */
  spendAccountId?: string;
  /** Objectif calculé automatiquement (enveloppe Abonnements). */
  auto?: 'subscriptions';
  /** Répartition de l'enveloppe entre plusieurs comptes, au prorata des poids. */
  accountSplit?: { accountId: string; weight: number }[];
  /** Niveau de protection quand le mois est serré. */
  level?: EnvelopeLevel;
  /** Montant minimum avant de descendre sous le plancher (dernier recours). */
  floor?: Cents;
  archived?: boolean;
}

export type EnvelopeLevel = 'essentiel' | 'important' | 'flexible';

export interface ExpectedIncome {
  id: string;
  name: string;
  /** `null` : aucun montant attendu (commissions). */
  amount: Cents | null;
  installments: number;
  windowStart?: number;
  windowEnd?: number;
  accountId: string;
  /** Montants habituels datés : le dernier dont le mois de départ est atteint s'applique. */
  schedule?: { from: Month; amount: Cents }[];
  archived?: boolean;
}

export type IncomeReason =
  | 'prorata'
  | 'sans-solde'
  | 'absence'
  | 'maladie'
  | 'prime'
  | 'regularisation'
  | 'ne-viendra-pas'
  | 'autre';

/** Montant attendu d'un revenu pour un mois précis. */
export interface IncomeException {
  /** `${incomeId}:${month}` */
  id: string;
  incomeId: string;
  month: Month;
  /** Total attendu pour le mois (0 : ne viendra pas). */
  amount: Cents;
  /** Détail par versement, pour les revenus en plusieurs fois. */
  installments?: Cents[];
  reason?: IncomeReason;
  note?: string;
}

/** Objectif fixé à la main pour une enveloppe et un mois. */
export interface MonthTarget {
  /** `${month}:${envelopeId}` */
  id: string;
  month: Month;
  envelopeId: string;
  target: Cents;
}

export type SubscriptionFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type SubscriptionCategory = 'divertissement' | 'outils' | 'cloud' | 'sport' | 'presse' | 'autre';
export type SubscriptionStatus = 'actif' | 'pause' | 'resilie';

export interface Subscription {
  id: string;
  name: string;
  /** Emoji ou initiales ; à défaut, l'initiale du nom. */
  icon?: string;
  color: string;
  amount: Cents;
  priceHistory: { date: ISODate; amount: Cents }[];
  frequency: SubscriptionFrequency;
  /** Jour de prélèvement (1 à 31). Absent : « à compléter ». */
  day?: number;
  /** Mois de prélèvement (1 à 12) pour un abonnement annuel ; mois de référence pour un trimestriel. */
  month?: number;
  accountId: string;
  category: SubscriptionCategory;
  startDate: ISODate;
  commitmentEnd?: ISODate;
  trialEnd?: ISODate;
  status: SubscriptionStatus;
  /** Date du dernier changement de statut (pause ou résiliation). */
  statusSince?: ISODate;
  url?: string;
  note?: string;
  createdAt: number;
}

export interface Receipt {
  id: string;
  amount: Cents;
  date: ISODate;
  source: string;
  incomeId?: string;
  month: Month;
  note?: string;
  createdAt: number;
  accountId: string;
  /** Renfort venu d'un compte d'épargne (matelas) : pas un revenu. */
  internal?: boolean;
  /** Question « exceptionnel ou nouveau salaire ? » déjà traitée. */
  varianceAnswered?: boolean;
}

export interface SavingsRules {
  cushionAccountId: string;
  cushionTarget: Cents;
  phase2: { accountId: string; weight: number }[];
}

export interface SurplusRule {
  envelopeId: string;
  pct: number;
}

export interface Rules {
  savings: SavingsRules;
  surplus: SurplusRule[];
  /** Enveloppe qui reçoit les reliquats non reportés. */
  leftoverEnvelopeId: string;
}

/** Configuration budgétaire figée pour un mois. */
export interface BudgetConfig {
  envelopes: Envelope[];
  rules: Rules;
}

export interface AllocLine {
  envelopeId: string;
  accountId: string;
  pocket?: string;
  amount: Cents;
}

export interface ProvisionUse {
  id: string;
  envelopeId: string;
  amount: Cents;
  date: ISODate;
  reason: string;
  fromAccountId: string;
  toAccountId: string;
  createdAt: number;
}

export interface Review {
  month: Month;
  /** Dépenses réelles par enveloppe `dépense`. */
  spent: Record<string, Cents>;
  /** Reliquat reporté au mois suivant, par enveloppe. */
  carry: Record<string, boolean>;
  note: string;
  step: number;
  /** Décisions de l'étape Abonnements. */
  subscriptionDecisions?: Record<string, 'keep' | 'cancel'>;
  completedAt?: ISODate;
  snapshot?: ReviewSnapshot;
}

export interface ReviewSnapshot {
  received: Cents;
  saved: Cents;
  savingsRate: number;
  leftovers: Cents;
  overspent: Cents;
  cushion: Cents;
  advice: string;
  /** Économie annuelle grâce aux résiliations décidées pendant la revue. */
  subscriptionSavings?: Cents;
}

export type GoalLink =
  | { type: 'envelope'; id: string }
  | { type: 'account'; id: string }
  | { type: 'savings' };

export interface Goal {
  id: string;
  name: string;
  target: Cents;
  date?: ISODate;
  link: GoalLink;
  createdAt: number;
  achievedAt?: ISODate;
}

export type TransferOrigin = 'receipt' | 'review' | 'provision';

export interface TransferLine {
  label: string;
  amount: Cents;
  envelopeId?: string;
}

/** Virement souhaité, calculé par le moteur. */
export interface TransferTarget {
  key: string;
  origin: TransferOrigin;
  refId: string;
  month: Month;
  date: ISODate;
  fromAccountId: string;
  toAccountId: string;
  amount: Cents;
  lines: TransferLine[];
}

/** Virement enregistré, avec son statut « fait ». */
export interface Transfer extends TransferTarget {
  id: string;
  done: boolean;
  doneAt?: string;
  isAdjustment: boolean;
  /** Ajustement : complément dans le sens d'origine, ou retour. */
  adjustmentKind?: 'plus' | 'retour';
  createdAt: number;
}

export interface Flow {
  date: ISODate;
  accountId: string;
  amount: Cents;
}
