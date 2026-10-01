import { uid } from '../../db/actions';
import { isInvestment } from '../../engine/balances';
import { formatEUR } from '../../engine/money';
import { LEVEL_LABELS, levelOf } from '../../engine/plan';
import { FREQUENCY_LABELS, monthlyEquivalent, subscriptionsTarget, SUGGESTIONS } from '../../engine/subscriptions';
import type {
  Account,
  AccountType,
  Cents,
  Envelope,
  EnvelopeKind,
  EnvelopeLevel,
  ExpectedIncome,
  Goal,
  Rules,
  Subscription,
  SubscriptionFrequency,
} from '../../engine/types';
import { Amount } from '../../ui/Amount';
import { AmountInput } from '../../ui/AmountInput';
import { Icon } from '../../ui/Icon';
import { Button, Field, IconButton, Select, TextInput } from '../../ui/kit';
import { SubscriptionIcon } from '../../ui/SubscriptionIcon';

export interface Draft {
  incomes: ExpectedIncome[];
  accounts: Account[];
  balances: Record<string, { value: Cents; invested?: Cents }>;
  envelopes: Envelope[];
  subscriptions: Subscription[];
  goals: Goal[];
  rules: Rules;
}

export type SetDraft = (update: (d: Draft) => Draft) => void;

const TYPE_LABELS: Record<AccountType, string> = {
  courant: 'Compte courant',
  revolut: 'Compte de dépenses (Revolut…)',
  livretA: 'Livret A',
  ldds: 'LDDS',
  pea: 'PEA',
  av: 'Assurance-vie',
  cto: 'Compte-titres',
};
const KIND_LABELS: Record<EnvelopeKind, string> = { depense: 'Dépense', provision: 'Provision', epargne: 'Épargne' };

function StepTitle({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="pt-6 pb-5 text-center">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-3 font-serif text-[2.25rem] leading-tight text-ink">{title}</h1>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}

function RowCard({ children, onRemove, label }: { children: React.ReactNode; onRemove?: () => void; label: string }) {
  return (
    <div className="card relative mb-3 p-4 pt-3">
      {onRemove && <IconButton icon="trash" label={`Retirer ${label || 'cette ligne'}`} className="absolute top-1 right-1" onClick={onRemove} />}
      {children}
    </div>
  );
}

const replaceAt = <T,>(list: T[], i: number, value: T) => list.map((x, k) => (k === i ? value : x));
const removeAt = <T,>(list: T[], i: number) => list.filter((_, k) => k !== i);

// ─── Revenus ──────────────────────────────────────────────────────────

export function IncomesStep({ draft, set }: { draft: Draft; set: SetDraft }) {
  const update = (i: number, patch: Partial<ExpectedIncome>) => set((d) => ({ ...d, incomes: replaceAt(d.incomes, i, { ...d.incomes[i], ...patch }) }));
  const total = draft.incomes.reduce((a, i) => a + (i.amount ?? 0), 0);
  return (
    <>
      <StepTitle eyebrow="Tes revenus" title="Ce que tu reçois" body="Les montants proposés sont des exemples : remplace-les par les tiens. Laisse le montant vide pour un revenu variable (primes, commissions)." />
      {draft.incomes.map((inc, i) => (
        <RowCard key={inc.id} label={inc.name} onRemove={draft.incomes.length > 1 ? () => set((d) => ({ ...d, incomes: removeAt(d.incomes, i) })) : undefined}>
          <Field label="Nom" htmlFor={`inc-name-${i}`}>
            <TextInput id={`inc-name-${i}`} value={inc.name} onChange={(e) => update(i, { name: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Montant par mois" htmlFor={`inc-amount-${i}`}>
              <AmountInput id={`inc-amount-${i}`} value={inc.amount} allowEmpty placeholder="Variable" onChange={(v) => update(i, { amount: v })} />
            </Field>
            <Field label="Versements" htmlFor={`inc-inst-${i}`}>
              <Select id={`inc-inst-${i}`} value={inc.installments} onChange={(e) => update(i, { installments: Number(e.target.value) })}>
                {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} par mois</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Arrive à partir du" htmlFor={`inc-ws-${i}`}>
              <Select id={`inc-ws-${i}`} value={inc.windowStart ?? ''} onChange={(e) => update(i, e.target.value ? { windowStart: Number(e.target.value), windowEnd: inc.windowEnd ?? Number(e.target.value) } : { windowStart: undefined, windowEnd: undefined })}>
                <option value="">Date libre</option>
                {Array.from({ length: 31 }, (_, k) => k + 1).map((d) => <option key={d} value={d}>{d}</option>)}
              </Select>
            </Field>
            <Field label="Jusqu’au" htmlFor={`inc-we-${i}`}>
              <Select id={`inc-we-${i}`} value={inc.windowEnd ?? ''} disabled={inc.windowStart === undefined} onChange={(e) => update(i, { windowEnd: Number(e.target.value) })}>
                <option value="">—</option>
                {Array.from({ length: 31 }, (_, k) => k + 1).map((d) => <option key={d} value={d}>{d}</option>)}
              </Select>
            </Field>
          </div>
        </RowCard>
      ))}
      <Button variant="secondary" full icon="plus" onClick={() => set((d) => ({ ...d, incomes: [...d.incomes, { id: uid(), name: '', amount: null, installments: 1, accountId: d.accounts[0]?.id ?? '' }] }))}>
        Ajouter un revenu
      </Button>
      <p className="mt-4 text-center text-sm text-muted">Revenus attendus : <Amount cents={total} compact className="text-ink" /> par mois</p>
    </>
  );
}

// ─── Comptes ──────────────────────────────────────────────────────────

export function AccountsStep({ draft, set }: { draft: Draft; set: SetDraft }) {
  const update = (i: number, patch: Partial<Account>) => set((d) => ({ ...d, accounts: replaceAt(d.accounts, i, { ...d.accounts[i], ...patch }) }));
  const setBalance = (id: string, patch: { value?: Cents; invested?: Cents }) =>
    set((d) => ({ ...d, balances: { ...d.balances, [id]: { ...{ value: 0 }, ...d.balances[id], ...patch } } }));
  return (
    <>
      <StepTitle eyebrow="Tes comptes" title="Soldes de départ" body="Garde les comptes que tu utilises, renomme-les, et saisis leur solde du jour. Laisse 0 si un compte est vide." />
      {draft.accounts.map((a, i) => (
        <RowCard key={a.id} label={a.name} onRemove={draft.accounts.length > 1 ? () => set((d) => ({ ...d, accounts: removeAt(d.accounts, i) })) : undefined}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nom" htmlFor={`acc-name-${i}`}>
              <TextInput id={`acc-name-${i}`} value={a.name} onChange={(e) => update(i, { name: e.target.value })} />
            </Field>
            <Field label="Type" htmlFor={`acc-type-${i}`}>
              <Select id={`acc-type-${i}`} value={a.type} onChange={(e) => update(i, { type: e.target.value as AccountType })}>
                {(Object.keys(TYPE_LABELS) as AccountType[]).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Solde du jour" htmlFor={`bal-${a.id}`}>
            <AmountInput id={`bal-${a.id}`} value={draft.balances[a.id]?.value ?? 0} onChange={(v) => setBalance(a.id, { value: v ?? 0 })} />
          </Field>
          {isInvestment(a.type) && (draft.balances[a.id]?.value ?? 0) > 0 && (
            <Field label="Dont versé (pour la plus-value)" htmlFor={`inv-${a.id}`}>
              <AmountInput id={`inv-${a.id}`} value={draft.balances[a.id]?.invested ?? draft.balances[a.id]?.value ?? 0} onChange={(v) => setBalance(a.id, { invested: v ?? 0 })} />
            </Field>
          )}
          {(a.type === 'pea' || a.type === 'av') && (
            <Field label="Date d’ouverture (facultatif)" htmlFor={`open-${a.id}`} hint={a.type === 'pea' ? 'Pour la date des 5 ans.' : 'Pour la date des 8 ans.'}>
              <TextInput id={`open-${a.id}`} type="date" value={a.openedAt ?? ''} onChange={(e) => update(i, { openedAt: e.target.value || undefined })} />
            </Field>
          )}
        </RowCard>
      ))}
      <Button variant="secondary" full icon="plus" onClick={() => set((d) => ({ ...d, accounts: [...d.accounts, { id: uid(), name: 'Nouveau compte', type: 'courant', order: d.accounts.length }] }))}>
        Ajouter un compte
      </Button>
    </>
  );
}

// ─── Enveloppes ───────────────────────────────────────────────────────

export function EnvelopesStep({ draft, set, month }: { draft: Draft; set: SetDraft; month: string }) {
  const update = (i: number, patch: Partial<Envelope>) => set((d) => ({ ...d, envelopes: replaceAt(d.envelopes, i, { ...d.envelopes[i], ...patch }) }));
  const move = (i: number, delta: number) =>
    set((d) => {
      const list = [...d.envelopes];
      const j = i + delta;
      if (j < 0 || j >= list.length) return d;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...d, envelopes: list };
    });
  const subsTarget = subscriptionsTarget(draft.subscriptions, month);
  const targetOf = (e: Envelope) => (e.auto === 'subscriptions' ? subsTarget : e.target);
  const total = draft.envelopes.reduce((a, e) => a + targetOf(e), 0);
  const income = draft.incomes.reduce((a, i) => a + (i.amount ?? 0), 0);
  return (
    <>
      <StepTitle
        eyebrow="Ton budget"
        title="Tes enveloppes"
        body="Chaque euro reçu remplit les enveloppes de haut en bas. Mois serré : les Flexibles baissent d’abord jusqu’à leur plancher, puis les Importants ; les Essentiels ne sont jamais réduits."
      />
      {draft.envelopes.map((e, i) => (
        <RowCard key={e.id} label={e.name} onRemove={() => set((d) => ({ ...d, envelopes: removeAt(d.envelopes, i) }))}>
          <div className="mb-2 flex items-center gap-1 pr-10">
            <span className="mr-1 text-xs text-muted">Priorité {i + 1}</span>
            <IconButton icon="chevronLeft" label={`Monter ${e.name}`} className="rotate-90" disabled={i === 0} onClick={() => move(i, -1)} />
            <IconButton icon="chevronRight" label={`Descendre ${e.name}`} className="rotate-90" disabled={i === draft.envelopes.length - 1} onClick={() => move(i, 1)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nom" htmlFor={`env-name-${i}`}>
              <TextInput id={`env-name-${i}`} value={e.name} onChange={(ev) => update(i, { name: ev.target.value })} />
            </Field>
            <Field label="Type" htmlFor={`env-kind-${i}`}>
              <Select id={`env-kind-${i}`} value={e.kind} disabled={e.auto === 'subscriptions'} onChange={(ev) => update(i, { kind: ev.target.value as EnvelopeKind, accountId: ev.target.value === 'epargne' ? null : e.accountId ?? draft.accounts[0]?.id })}>
                {(Object.keys(KIND_LABELS) as EnvelopeKind[]).map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Objectif / mois" htmlFor={`env-target-${i}`}>
              {e.auto === 'subscriptions' ? (
                <p className="flex min-h-12 items-center text-sm text-muted">Calculé : <Amount cents={subsTarget} compact className="ml-1 text-ink" /></p>
              ) : (
                <AmountInput id={`env-target-${i}`} value={e.target} onChange={(v) => update(i, { target: v ?? 0 })} />
              )}
            </Field>
            <Field label="Compte" htmlFor={`env-acc-${i}`}>
              <Select id={`env-acc-${i}`} value={e.accountId ?? ''} disabled={e.auto === 'subscriptions'} onChange={(ev) => update(i, { accountId: ev.target.value || null })}>
                {e.kind === 'epargne' && <option value="">Selon les phases</option>}
                {draft.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Niveau" htmlFor={`env-level-${i}`}>
              <Select id={`env-level-${i}`} value={levelOf(e)} onChange={(ev) => update(i, { level: ev.target.value as EnvelopeLevel })}>
                {(Object.keys(LEVEL_LABELS) as EnvelopeLevel[]).map((l) => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
              </Select>
            </Field>
            <Field label="Plancher" htmlFor={`env-floor-${i}`}>
              {levelOf(e) === 'essentiel' ? (
                <p className="flex min-h-12 items-center text-sm text-muted">Jamais réduit</p>
              ) : (
                <AmountInput id={`env-floor-${i}`} value={e.floor ?? 0} onChange={(v) => update(i, { floor: v ?? 0 })} />
              )}
            </Field>
          </div>
        </RowCard>
      ))}
      <Button
        variant="secondary"
        full
        icon="plus"
        onClick={() => set((d) => ({ ...d, envelopes: [...d.envelopes, { id: uid(), name: '', kind: 'depense', accountId: d.accounts[0]?.id ?? null, target: 0, priority: d.envelopes.length + 1, level: 'flexible', floor: 0 }] }))}
      >
        Ajouter une enveloppe
      </Button>
      <p className="mt-4 text-center text-sm text-muted">
        Budget : <Amount cents={total} compact className="text-ink" /> pour <Amount cents={income} compact className="text-ink" /> de revenus attendus
        {income > total && <> · <Amount cents={income - total} compact className="text-gold" /> iront en surplus</>}
        {income < total && <> · le budget s’adaptera (−<Amount cents={total - income} compact />)</>}
      </p>
    </>
  );
}

// ─── Abonnements ──────────────────────────────────────────────────────

export function SubscriptionsStep({ draft, set, today }: { draft: Draft; set: SetDraft; today: string }) {
  const update = (i: number, patch: Partial<Subscription>) => set((d) => ({ ...d, subscriptions: replaceAt(d.subscriptions, i, { ...d.subscriptions[i], ...patch }) }));
  const account = draft.accounts.find((a) => a.type === 'courant')?.id ?? draft.accounts[0]?.id ?? '';
  const add = (base: Partial<Subscription>) =>
    set((d) => ({
      ...d,
      subscriptions: [
        ...d.subscriptions,
        { id: uid(), name: '', color: '#C9A96E', amount: 0, priceHistory: [], frequency: 'monthly', accountId: account, category: 'autre', startDate: today, status: 'actif', createdAt: 0, ...base },
      ],
    }));
  const monthly = draft.subscriptions.reduce((a, s) => a + monthlyEquivalent(s), 0);
  return (
    <>
      <StepTitle eyebrow="Prélèvements" title="Tes abonnements" body="Ils forment l’enveloppe Abonnements, calculée automatiquement. Touche une suggestion puis ajuste le montant et le jour, ou passe : tu pourras les ajouter plus tard." />
      <div className="-mx-6 mb-4 flex gap-2 overflow-x-auto px-6 pb-1 scrollbar-none">
        {SUGGESTIONS.map((s) => (
          <button key={s.name} type="button" onClick={() => add({ name: s.name, amount: s.amount, frequency: s.frequency, category: s.category, color: s.color })} className="flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-line-strong py-1 pr-4 pl-1.5 text-sm text-ink">
            <SubscriptionIcon sub={s} size={28} />
            {s.name}
          </button>
        ))}
      </div>
      {draft.subscriptions.map((s, i) => (
        <RowCard key={s.id} label={s.name} onRemove={() => set((d) => ({ ...d, subscriptions: removeAt(d.subscriptions, i) }))}>
          <div className="grid grid-cols-2 gap-3 pr-8">
            <Field label="Nom" htmlFor={`sub-name-${i}`}>
              <TextInput id={`sub-name-${i}`} value={s.name} onChange={(e) => update(i, { name: e.target.value })} />
            </Field>
            <Field label="Montant" htmlFor={`sub-amount-${i}`}>
              <AmountInput id={`sub-amount-${i}`} value={s.amount} onChange={(v) => update(i, { amount: v ?? 0 })} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Fréquence" htmlFor={`sub-freq-${i}`}>
              <Select id={`sub-freq-${i}`} value={s.frequency} onChange={(e) => update(i, { frequency: e.target.value as SubscriptionFrequency })}>
                {(Object.keys(FREQUENCY_LABELS) as SubscriptionFrequency[]).map((f) => <option key={f} value={f}>{FREQUENCY_LABELS[f].adjective}</option>)}
              </Select>
            </Field>
            <Field label="Jour" htmlFor={`sub-day-${i}`}>
              <Select id={`sub-day-${i}`} value={s.day ?? ''} onChange={(e) => update(i, { day: e.target.value ? Number(e.target.value) : undefined })}>
                <option value="">À compléter</option>
                {Array.from({ length: 31 }, (_, k) => k + 1).map((d) => <option key={d} value={d}>{d}</option>)}
              </Select>
            </Field>
            <Field label="Compte" htmlFor={`sub-acc-${i}`}>
              <Select id={`sub-acc-${i}`} value={s.accountId} onChange={(e) => update(i, { accountId: e.target.value })}>
                {draft.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
          </div>
        </RowCard>
      ))}
      <Button variant="secondary" full icon="plus" onClick={() => add({})}>Ajouter un abonnement</Button>
      <p className="mt-4 text-center text-sm text-muted">
        {draft.subscriptions.length ? <>Total : <Amount cents={Math.round(monthly)} className="text-ink" /> par mois</> : 'Aucun abonnement pour l’instant.'}
      </p>
    </>
  );
}

// ─── Épargne et objectifs ─────────────────────────────────────────────

export function SavingsStep({ draft, set }: { draft: Draft; set: SetDraft }) {
  const savings = draft.rules.savings;
  const setSavings = (patch: Partial<Rules['savings']>) => set((d) => ({ ...d, rules: { ...d.rules, savings: { ...d.rules.savings, ...patch } } }));
  const invest = draft.accounts.filter((a) => a.id !== savings.cushionAccountId && a.type !== 'courant' && a.type !== 'revolut');
  const weightOf = (id: string) => savings.phase2.find((p) => p.accountId === id)?.weight ?? 0;
  const totalWeight = invest.reduce((a, acc) => a + weightOf(acc.id), 0);
  const updateGoal = (i: number, patch: Partial<Goal>) => set((d) => ({ ...d, goals: replaceAt(d.goals, i, { ...d.goals[i], ...patch } as Goal) }));
  return (
    <>
      <StepTitle eyebrow="Épargne" title="Matelas et objectifs" body="Phase 1 : l’épargne remplit d’abord ton matelas de précaution. Phase 2 : elle se répartit sur tes placements, selon les parts que tu choisis." />
      <div className="card mb-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Compte du matelas" htmlFor="cushion-account">
            <Select id="cushion-account" value={savings.cushionAccountId} onChange={(e) => setSavings({ cushionAccountId: e.target.value })}>
              {draft.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field label="Matelas cible" htmlFor="cushion-target">
            <AmountInput id="cushion-target" value={savings.cushionTarget} onChange={(v) => setSavings({ cushionTarget: v ?? 0 })} />
          </Field>
        </div>
        {invest.length > 0 && (
          <>
            <p className="mb-2 text-[0.8125rem] text-muted">Phase 2 : parts de chaque placement</p>
            {invest.map((a) => (
              <div key={a.id} className="mb-2 grid grid-cols-[1fr_6rem] items-center gap-3">
                <label htmlFor={`w-${a.id}`} className="text-sm text-ink">{a.name}</label>
                <div className="relative">
                  <TextInput
                    id={`w-${a.id}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    value={weightOf(a.id)}
                    onChange={(e) => {
                      const w = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                      setSavings({ phase2: [...savings.phase2.filter((p) => p.accountId !== a.id), ...(w > 0 ? [{ accountId: a.id, weight: w }] : [])] });
                    }}
                    className="pr-8 text-right"
                  />
                  <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-muted">%</span>
                </div>
              </div>
            ))}
            <p className={`text-xs ${totalWeight === 100 ? 'text-muted' : 'text-gold'}`}>Total : {totalWeight} %{totalWeight !== 100 && ' (les parts sont appliquées au prorata)'}</p>
          </>
        )}
      </div>
      <p className="eyebrow mt-6 mb-3 px-1">Objectifs</p>
      {draft.goals.map((g, i) => (
        <RowCard key={g.id} label={g.name} onRemove={() => set((d) => ({ ...d, goals: removeAt(d.goals, i) }))}>
          <div className="grid grid-cols-2 gap-3 pr-8">
            <Field label="Nom" htmlFor={`goal-name-${i}`}>
              <TextInput id={`goal-name-${i}`} value={g.name} onChange={(e) => updateGoal(i, { name: e.target.value })} />
            </Field>
            <Field label="Montant cible" htmlFor={`goal-target-${i}`}>
              <AmountInput id={`goal-target-${i}`} value={g.target} onChange={(v) => updateGoal(i, { target: v ?? 0 })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date cible" htmlFor={`goal-date-${i}`}>
              <TextInput id={`goal-date-${i}`} type="date" value={g.date ?? ''} onChange={(e) => updateGoal(i, { date: e.target.value || undefined })} />
            </Field>
            <Field label="Suivi" htmlFor={`goal-link-${i}`}>
              <Select
                id={`goal-link-${i}`}
                value={g.link.type === 'savings' ? 'savings' : `${g.link.type}:${g.link.id}`}
                onChange={(e) => {
                  const [type, id] = e.target.value.split(':');
                  updateGoal(i, { link: type === 'savings' ? { type: 'savings' } : type === 'account' ? { type: 'account', id } : { type: 'envelope', id } });
                }}
              >
                <option value="savings">Toute mon épargne</option>
                {draft.accounts.map((a) => <option key={a.id} value={`account:${a.id}`}>{a.name}</option>)}
                {draft.envelopes.filter((e) => e.kind !== 'depense').map((e) => <option key={e.id} value={`envelope:${e.id}`}>{e.name}</option>)}
              </Select>
            </Field>
          </div>
        </RowCard>
      ))}
      <Button variant="secondary" full icon="plus" onClick={() => set((d) => ({ ...d, goals: [...d.goals, { id: uid(), name: '', target: 0, link: { type: 'savings' }, createdAt: 0 }] }))}>
        Ajouter un objectif
      </Button>
    </>
  );
}

// ─── Récapitulatif ────────────────────────────────────────────────────

export function SummaryStep({ draft, month }: { draft: Draft; month: string }) {
  const income = draft.incomes.reduce((a, i) => a + (i.amount ?? 0), 0);
  const subsTarget = subscriptionsTarget(draft.subscriptions, month);
  const budget = draft.envelopes.reduce((a, e) => a + (e.auto === 'subscriptions' ? subsTarget : e.target), 0);
  const balances = Object.values(draft.balances).reduce((a, b) => a + b.value, 0);
  const rows: [string, React.ReactNode][] = [
    ['Revenus attendus', <Amount key="i" cents={income} compact />],
    ['Budget mensuel', <Amount key="b" cents={budget} compact />],
    ['Enveloppes', `${draft.envelopes.length}`],
    ['Abonnements', draft.subscriptions.length ? `${draft.subscriptions.length} · ${formatEUR(subsTarget, { compact: true })} / mois` : 'aucun'],
    ['Comptes', `${draft.accounts.length} · ${formatEUR(balances, { compact: true })} au total`],
    ['Matelas cible', <Amount key="m" cents={draft.rules.savings.cushionTarget} compact />],
    ['Objectifs', `${draft.goals.length}`],
  ];
  return (
    <>
      <StepTitle eyebrow="Récapitulatif" title="Tout est prêt" body="Ta configuration reste uniquement sur cet appareil. Tout reste modifiable dans les Réglages." />
      <div className="card divide-y divide-line px-5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex min-h-12 items-center justify-between gap-3 py-2 text-[0.9375rem]">
            <span className="text-muted">{label}</span>
            <span className="text-right text-ink">{value}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 flex items-start gap-2 px-1 text-xs leading-relaxed text-muted">
        <Icon name="shield" size={14} className="mt-0.5 shrink-0 text-gold" />
        Aucune donnée n’est envoyée sur internet. Pense à exporter une sauvegarde de temps en temps (Réglages → Données).
      </p>
    </>
  );
}
