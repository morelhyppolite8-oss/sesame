import { useState } from 'react';
import { clearIncomeException, setIncomeException } from '../db/actions';
import { monthLabel, ofMonth } from '../engine/dates';
import { incomeStatuses, type IncomeStatus } from '../engine/income';
import { formatEUR } from '../engine/money';
import { estimateWithholding, REASON_LABELS, workingDays } from '../engine/plan';
import type { Cents, IncomeReason, Month } from '../engine/types';
import { useData } from '../state/data';
import { haptic } from '../state/haptics';
import { useUI } from '../state/ui';
import { Amount } from './Amount';
import { AmountInput } from './AmountInput';
import { Button, Field, inputClass, Pill, Select } from './kit';

const EDITABLE_REASONS: IncomeReason[] = ['prorata', 'sans-solde', 'absence', 'maladie', 'prime', 'regularisation', 'autre'];
const ordinal = (n: number) => (n === 1 ? '1er' : `${n}e`);

function Withholding({ status, month, onUse }: { status: IncomeStatus; month: Month; onUse: (amount: Cents) => void }) {
  const habitual = status.habitual ?? 0;
  const [days, setDays] = useState(1);
  const [workDays, setWorkDays] = useState(workingDays(month));
  const [proposal, setProposal] = useState<Cents | null>(null);
  const computed = estimateWithholding(habitual, days, workDays);
  const value = proposal ?? computed;
  return (
    <div className="mt-3 rounded-2xl border border-line p-4">
      <p className="text-sm text-ink">Estimer une retenue</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`days-${status.income.id}`} className="mb-1.5 block text-[0.8125rem] text-muted">Jours non payés</label>
          <input id={`days-${status.income.id}`} type="number" inputMode="numeric" min={0} max={31} value={days} onChange={(e) => { setDays(Math.max(0, Number(e.target.value) || 0)); setProposal(null); }} className={inputClass} />
        </div>
        <div>
          <label htmlFor={`workdays-${status.income.id}`} className="mb-1.5 block text-[0.8125rem] text-muted">Jours ouvrés ({monthLabel(month, false)})</label>
          <input id={`workdays-${status.income.id}`} type="number" inputMode="numeric" min={1} max={31} value={workDays} onChange={(e) => { setWorkDays(Math.max(1, Number(e.target.value) || 1)); setProposal(null); }} className={inputClass} />
        </div>
      </div>
      <Field label={`Proposition : ${formatEUR(habitual, { compact: true })} × ${Math.max(0, workDays - days)} / ${workDays}`} htmlFor={`proposal-${status.income.id}`}>
        <AmountInput id={`proposal-${status.income.id}`} value={value} onChange={(v) => setProposal(v ?? 0)} />
      </Field>
      <p className="-mt-2 mb-3 text-xs leading-relaxed text-muted">
        C’est une estimation, à ajuster avec ta fiche de paie. Les congés payés ne réduisent normalement pas le salaire.
      </p>
      <Button variant="secondary" full onClick={() => onUse(value)}>Utiliser {formatEUR(value, { compact: true })}</Button>
    </div>
  );
}

function IncomeRow({ status, month }: { status: IncomeStatus; month: Month }) {
  const { toast } = useUI();
  const ex = status.exception;
  const [amount, setAmount] = useState<Cents | null>(ex?.amount ?? status.expected ?? status.habitual ?? 0);
  const [reason, setReason] = useState<IncomeReason>(ex?.reason && ex.reason !== 'ne-viendra-pas' ? ex.reason : 'autre');
  const [estimate, setEstimate] = useState(false);
  const multi = status.income.installments > 1 && status.habitual !== null;
  const received = status.receivedCount > 0 && status.state === 'recu';

  const save = async (value: Cents, why: IncomeReason, installments?: Cents[]) => {
    await setIncomeException({ incomeId: status.income.id, month, amount: value, reason: why, ...(installments ? { installments } : {}) });
    haptic('success');
    toast(`${status.income.name} ${ofMonth(month)} : ${formatEUR(value, { compact: true })}. Le plan est recalculé.`);
  };

  const toggleInstallment = async (index: number) => {
    const per = Math.round((status.habitual ?? 0) / status.income.installments);
    const current = status.exception?.installments ?? Array.from({ length: status.income.installments }, () => per);
    const next = current.map((v, i) => (i === index ? (v > 0 ? 0 : per) : v));
    const total = next.reduce((a, b) => a + b, 0);
    if (next.every((v) => v === per)) {
      await clearIncomeException(status.income.id, month);
      toast('Montant habituel rétabli.');
    } else await save(total, 'ne-viendra-pas', next);
  };

  return (
    <div className="py-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[0.9375rem] text-ink">{status.income.name}</p>
        <span className="text-xs text-muted">
          {status.habitual === null ? 'montant libre' : <>habituel <Amount cents={status.habitual} compact /></>}
        </span>
      </div>
      {received ? (
        <p className="mt-2 text-sm text-muted">
          Reçu : <Amount cents={status.received} className="text-ink" />. Le montant réel fait foi.
        </p>
      ) : (
        <>
          {ex && (
            <p className="mt-1 flex items-center gap-2 text-xs text-gold">
              <Pill tone="gold">{REASON_LABELS[ex.reason ?? 'autre']}</Pill> exception {ofMonth(month)}
            </p>
          )}
          <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-2">
            <Field label={`Montant attendu ${ofMonth(month)}`} htmlFor={`exp-${status.income.id}-${month}`}>
              <AmountInput id={`exp-${status.income.id}-${month}`} value={amount} onChange={setAmount} />
            </Field>
            <div className="mb-4">
              <Button aria-label={`Valider le montant de ${status.income.name}`} onClick={() => amount !== null && save(amount, reason)} disabled={amount === null || (amount === (status.expected ?? 0) && reason === (ex?.reason ?? 'autre'))}>OK</Button>
            </div>
          </div>
          <Field label="Motif" htmlFor={`reason-${status.income.id}-${month}`}>
            <Select id={`reason-${status.income.id}-${month}`} value={reason} onChange={(e) => setReason(e.target.value as IncomeReason)}>
              {EDITABLE_REASONS.map((r) => (
                <option key={r} value={r}>{REASON_LABELS[r]}</option>
              ))}
            </Select>
          </Field>
          {multi && (
            <div className="mb-3 space-y-2" role="group" aria-label={`Versements de ${status.income.name}`}>
              {Array.from({ length: status.income.installments }, (_, i) => {
                const per = Math.round((status.habitual ?? 0) / status.income.installments);
                const on = (ex?.installments?.[i] ?? per) > 0 && !(ex && !ex.installments && ex.amount === 0);
                return (
                  <div key={i} className="flex min-h-11 items-center justify-between gap-3 text-sm">
                    <span className={on ? 'text-ink' : 'text-muted line-through'}>{ordinal(i + 1)} versement · <Amount cents={per} compact /></span>
                    <button type="button" className="min-h-11 text-gold" onClick={() => toggleInstallment(i)} disabled={i < status.receivedCount}>
                      {i < status.receivedCount ? 'reçu' : on ? 'Ne viendra pas' : 'Viendra finalement'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {status.expected !== 0 && (
              <Button variant="secondary" onClick={() => save(0, 'ne-viendra-pas', multi ? Array(status.income.installments).fill(0) : undefined)}>Ne viendra pas</Button>
            )}
            {ex && (
              <Button variant="ghost" onClick={async () => { await clearIncomeException(status.income.id, month); setAmount(status.habitual ?? 0); toast('Montant habituel rétabli.'); }}>
                Rétablir le montant habituel
              </Button>
            )}
            {!multi && status.habitual !== null && status.habitual > 0 && (
              <Button variant="ghost" aria-expanded={estimate} onClick={() => setEstimate((v) => !v)}>Estimer une retenue</Button>
            )}
          </div>
          {estimate && (
            <Withholding
              status={status}
              month={month}
              onUse={(v) => {
                setAmount(v);
                setReason('sans-solde');
                setEstimate(false);
                save(v, 'sans-solde');
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

/** Revenus attendus d'un mois : montant du mois, motif, versements, « ne viendra pas », retenue. */
export function IncomeMonthEditor({ month, incomeId }: { month: Month; incomeId?: string }) {
  const data = useData();
  const statuses = incomeStatuses(data.snap.incomes, data.snap.receipts, month, data.today, data.snap.incomeExceptions)
    .filter((s) => !incomeId || s.income.id === incomeId)
    .sort((a, b) => (b.habitual ?? -1) - (a.habitual ?? -1));
  return (
    <div className="divide-y divide-line">
      {statuses.map((s) => (
        <IncomeRow key={`${s.income.id}-${month}-${s.exception?.amount ?? 'h'}-${s.receivedCount}`} status={s} month={month} />
      ))}
    </div>
  );
}
