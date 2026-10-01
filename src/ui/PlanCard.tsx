import { useState } from 'react';
import { boostFromCushion, setMonthTarget } from '../db/actions';
import { ofMonth } from '../engine/dates';
import type { IncomeState } from '../engine/income';
import { formatEUR } from '../engine/money';
import { LEVEL_LABELS, reductionReason, type MonthPlan, type PlanItem } from '../engine/plan';
import type { Cents, Month } from '../engine/types';
import { useData } from '../state/data';
import { haptic } from '../state/haptics';
import { navigate } from '../state/router';
import { monthPlan, monthView } from '../state/selectors';
import { useUI } from '../state/ui';
import { Amount } from './Amount';
import { AmountInput } from './AmountInput';
import { Icon } from './Icon';
import { IncomeMonthEditor } from './IncomeMonthEditor';
import { Button, Card, Field, Pill, Select, Sheet } from './kit';

const signed = (cents: Cents) => formatEUR(cents, { compact: true, sign: true }).replace('-', '−');

export function PlanBanner({ plan }: { plan: MonthPlan }) {
  const tone = plan.status === 'serre' ? 'border-negative/40 text-negative' : plan.status === 'confortable' ? 'border-positive/40 text-positive' : 'border-gold/40 text-gold';
  const text = plan.status === 'serre' ? `Mois serré : ${signed(plan.delta)}` : plan.status === 'confortable' ? `Mois confortable : ${signed(plan.delta)}` : 'Mois normal';
  return (
    <p role="status" className={`amount inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${tone}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {text}
    </p>
  );
}

const STATE_LABELS: Record<IncomeState, { text: string; tone: 'positive' | 'gold' | 'muted' | 'negative' }> = {
  recu: { text: 'Reçu', tone: 'positive' },
  partiel: { text: 'En partie', tone: 'gold' },
  attente: { text: 'Attendu', tone: 'muted' },
  retard: { text: 'En retard', tone: 'negative' },
  annule: { text: 'Ne viendra pas', tone: 'muted' },
};

/** Liste des enveloppes du plan : objectif normal barré quand il est réduit, objectif adapté, explication. */
export function PlanItems({ plan, items = plan.items, onEdit }: { plan: MonthPlan; items?: PlanItem[]; onEdit?: (item: PlanItem) => void }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((item) => {
        const reduced = item.adapted < item.normal;
        const reason = reductionReason(plan, item);
        const content = (
          <>
            <span className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-[0.9375rem] text-ink">{item.envelope.name}</span>
              <span className="shrink-0 text-sm tabular">
                {reduced && <Amount cents={item.normal} compact className="mr-2 text-muted line-through" />}
                <Amount cents={item.adapted} compact className={reduced ? 'text-gold' : 'text-ink'} />
              </span>
            </span>
            <span className="mt-0.5 block text-xs text-muted">
              {LEVEL_LABELS[item.level]}
              {item.fixed && ' · fixé pour ce mois'}
              {reason && <> · {reason}</>}
            </span>
          </>
        );
        return (
          <li key={item.envelope.id}>
            {onEdit ? (
              <button type="button" onClick={() => onEdit(item)} className="block w-full py-2.5 text-left" aria-label={`Ajuster ${item.envelope.name} pour ce mois`}>
                {content}
              </button>
            ) : (
              <div className="py-2.5">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Simulateur « Et si je reçois… » : aucun enregistrement. */
export function WhatIf({ month }: { month: Month }) {
  const data = useData();
  const incomes = data.snap.incomes.filter((i) => !i.archived && i.amount !== null);
  const [incomeId, setIncomeId] = useState(incomes.find((i) => i.id === 'salaire')?.id ?? incomes[0]?.id ?? '');
  const status = monthView(data, month).statuses.find((s) => s.income.id === incomeId);
  const base = status?.habitual ?? 0;
  const [amount, setAmount] = useState<Cents>(status?.planned ?? base);
  const plan = monthPlan(data, month, { incomeId, amount });
  const max = Math.max(base * 2, amount, 200_000);
  return (
    <div>
      <p className="mb-4 text-sm leading-relaxed text-muted">Rien n’est enregistré : fais varier le montant et regarde ton budget {ofMonth(month)} s’adapter.</p>
      <Field label="Revenu" htmlFor="whatif-income">
        <Select id="whatif-income" value={incomeId} onChange={(e) => { setIncomeId(e.target.value); const s = monthView(data, month).statuses.find((x) => x.income.id === e.target.value); setAmount(s?.planned ?? s?.habitual ?? 0); }}>
          {incomes.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </Select>
      </Field>
      <div className="mb-2 flex items-baseline justify-between">
        <label htmlFor="whatif-range" className="text-[0.8125rem] text-muted">Et si je reçois…</label>
        <span className="font-serif text-3xl text-ink"><Amount cents={amount} compact /></span>
      </div>
      <input
        id="whatif-range"
        type="range"
        min={0}
        max={max}
        step={1000}
        value={amount}
        onChange={(e) => setAmount(Number(e.target.value))}
        className="h-11 w-full cursor-pointer accent-[var(--gold)]"
        aria-valuetext={formatEUR(amount, { compact: true })}
      />
      <div className="mt-1 mb-4 flex flex-wrap gap-2">
        {[75000, 80000, 85000, base].filter((v, i, arr) => v > 0 && arr.indexOf(v) === i).map((v) => (
          <button key={v} type="button" onClick={() => setAmount(v)} className={`min-h-11 rounded-full border px-4 text-sm ${amount === v ? 'border-gold bg-gold-soft text-gold' : 'border-line-strong text-muted'}`}>
            {formatEUR(v, { compact: true })}
          </button>
        ))}
      </div>
      <Field label="Montant exact" htmlFor="whatif-amount">
        <AmountInput id="whatif-amount" value={amount} onChange={(v) => setAmount(v ?? 0)} />
      </Field>
      {plan && (
        <div className="mt-2 rounded-2xl border border-line p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <PlanBanner plan={plan} />
            <span className="text-xs text-muted">revenu prévu <Amount cents={plan.planned} compact className="text-ink" /></span>
          </div>
          <PlanItems plan={plan} />
          {plan.essentialMissing > 0 && (
            <p className="mt-2 text-sm text-negative">Il manquerait {formatEUR(plan.essentialMissing, { compact: true })} pour couvrir l’essentiel.</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Carte « Plan du mois » en haut de l'écran Mois. */
export function PlanCard({ month }: { month: Month }) {
  const data = useData();
  const { toast } = useUI();
  const view = monthView(data, month);
  const plan = view.ledger.plan ?? monthPlan(data, month);
  const [incomeSheet, setIncomeSheet] = useState<string | null>(null);
  const [whatIf, setWhatIf] = useState(false);
  const [editing, setEditing] = useState<PlanItem | null>(null);
  const [target, setTarget] = useState<Cents | null>(null);
  const [showAll, setShowAll] = useState(false);
  if (!plan) return null;
  const reduced = plan.items.filter((i) => i.adapted < i.normal || i.fixed);
  const shown = showAll ? plan.items : reduced;

  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow">Plan du mois</p>
        <PlanBanner plan={plan} />
      </div>
      <p className="mt-3 text-sm text-muted">
        <Amount cents={plan.planned} compact className="font-serif text-3xl text-ink" /> prévus
        <span className="ml-1">pour un budget normal de <Amount cents={plan.normal} compact className="text-ink" /></span>
      </p>

      <ul className="mt-4 divide-y divide-line border-t border-line">
        {view.statuses.map((s) => (
          <li key={s.income.id}>
            <button type="button" onClick={() => setIncomeSheet(s.income.id)} className="flex min-h-12 w-full items-center gap-3 py-2 text-left" aria-label={`Modifier ${s.income.name} ${ofMonth(month)}`}>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.9375rem] text-ink">
                  {s.income.name}
                  {s.exception && <Icon name="sparkle" size={13} className="ml-1.5 inline text-gold" aria-hidden="true" />}
                </span>
                <span className="block text-xs text-muted">
                  {s.state === 'partiel' ? <>reçu <Amount cents={s.received} compact /> + <Amount cents={s.planned - s.received} compact /> attendus</> : s.expected === null && !s.receivedCount ? 'montant libre' : null}
                </span>
              </span>
              <Pill tone={STATE_LABELS[s.state].tone}>{s.expected === null && s.state === 'attente' ? 'Libre' : STATE_LABELS[s.state].text}</Pill>
              <Amount cents={s.planned} compact className="w-20 text-right text-ink" />
              <Icon name="edit" size={15} className="text-faint" />
            </button>
          </li>
        ))}
        {plan.planned - view.statuses.reduce((a, s) => a + s.planned, 0) > 0 && (
          <li className="flex min-h-12 items-center justify-between py-2 text-[0.9375rem]">
            <span className="text-ink">Autres encaissements</span>
            <Amount cents={plan.planned - view.statuses.reduce((a, s) => a + s.planned, 0)} compact className="text-ink" />
          </li>
        )}
      </ul>

      <div className="mt-4 border-t border-line pt-3">
        <div className="flex items-center justify-between">
          <p className="eyebrow">{showAll ? 'Tout le plan' : reduced.length ? 'Enveloppes adaptées' : 'Enveloppes'}</p>
          <button type="button" className="min-h-11 text-sm text-gold" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Réduire' : 'Tout le plan'}
          </button>
        </div>
        {shown.length > 0 ? (
          <PlanItems plan={plan} items={shown} onEdit={(item) => { setEditing(item); setTarget(item.adapted); }} />
        ) : (
          <p className="pb-1 text-sm text-muted">Tous les objectifs sont à leur niveau normal.</p>
        )}
      </div>

      {plan.essentialMissing > 0 && (
        <div className="mt-4 rounded-2xl border border-negative/40 p-4">
          <p className="text-[0.9375rem] text-ink">Il manque <Amount cents={plan.essentialMissing} compact className="text-negative" /> pour couvrir l’essentiel.</p>
          <p className="mt-1 text-sm text-muted">C’est le rôle de ton matelas de précaution. Le virement sera ajouté à tes virements à faire.</p>
          <div className="mt-3">
            <Button
              variant="secondary"
              full
              onClick={async () => {
                const id = await boostFromCushion(month, plan.essentialMissing);
                haptic('success');
                toast('Renfort du matelas enregistré.');
                navigate(`/repartition/${id}`);
              }}
            >
              Virer {formatEUR(plan.essentialMissing, { compact: true })} depuis le matelas
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Button variant="secondary" onClick={() => setWhatIf(true)}>Et si je reçois…</Button>
        <Button variant="secondary" icon="chart" onClick={() => navigate(`/previsions?mois=${month}`)}>Prévisions</Button>
      </div>

      <Sheet open={incomeSheet !== null} onClose={() => setIncomeSheet(null)} title={`Revenus ${ofMonth(month)}`}>
        {incomeSheet && <IncomeMonthEditor month={month} incomeId={incomeSheet} />}
      </Sheet>
      <Sheet open={whatIf} onClose={() => setWhatIf(false)} title="Et si je reçois…">
        {whatIf && <WhatIf month={month} />}
      </Sheet>
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing ? `${editing.envelope.name} ${ofMonth(month)}` : ''}>
        {editing && (
          <>
            <p className="mb-4 text-sm leading-relaxed text-muted">
              Fixe l’objectif de cette enveloppe pour ce mois seulement. L’adaptation se fera sur les autres enveloppes.
            </p>
            <Field label="Objectif du mois" htmlFor="month-target">
              <AmountInput id="month-target" value={target} onChange={setTarget} />
            </Field>
            <div className="grid gap-3">
              <Button full disabled={target === null} onClick={async () => { await setMonthTarget(month, editing.envelope.id, target); toast('Objectif du mois enregistré.'); setEditing(null); }}>Fixer pour ce mois</Button>
              {editing.fixed && (
                <Button variant="ghost" full onClick={async () => { await setMonthTarget(month, editing.envelope.id, null); toast('Adaptation automatique rétablie.'); setEditing(null); }}>Revenir à l’adaptation automatique</Button>
              )}
            </div>
          </>
        )}
      </Sheet>
    </Card>
  );
}
