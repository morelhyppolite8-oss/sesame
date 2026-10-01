import { motion } from 'framer-motion';
import { answerIncomeVariance, setTransferDone, setTransfersDone } from '../db/actions';
import { habitualAmount, significantVariance } from '../engine/income';
import { REASON_LABELS } from '../engine/plan';
import type { IncomeReason } from '../engine/types';
import { formatDate, ofMonth } from '../engine/dates';
import { formatEUR } from '../engine/money';
import type { AllocLine, Transfer } from '../engine/types';
import { useData } from '../state/data';
import { haptic } from '../state/haptics';
import { navigate } from '../state/router';
import { monthView } from '../state/selectors';
import { useUI } from '../state/ui';
import { Amount } from '../ui/Amount';
import { Icon } from '../ui/Icon';
import { Button, Card, CheckCircle, EmptyState, GoldLine, IconButton, Page, ProgressBar, SectionTitle, Select } from '../ui/kit';
import { useState } from 'react';
import { withArticle } from '../ui/TransferLabel';

const ease = [0.22, 1, 0.36, 1] as const;

interface Group {
  accountId: string;
  total: number;
  lines: AllocLine[];
  transfers: Transfer[];
}

const VARIANCE_REASONS: IncomeReason[] = ['prorata', 'sans-solde', 'absence', 'maladie', 'prime', 'regularisation', 'autre'];

/** « X € au lieu de Y € : exceptionnel ou nouveau salaire habituel ? » */
function VarianceQuestion({ receiptId, received, expected, name }: { receiptId: string; received: number; expected: number; name: string }) {
  const { toast } = useUI();
  const [reason, setReason] = useState<IncomeReason | ''>('');
  const answer = async (choice: 'exceptional' | 'durable') => {
    await answerIncomeVariance(receiptId, choice, reason || undefined);
    haptic('success');
    toast(choice === 'exceptional' ? 'Noté : seul ce mois est concerné.' : `Noté : ${formatEUR(received, { compact: true })} devient ton montant habituel.`);
  };
  return (
    <Card className="mb-2 border-gold/40">
      <p className="font-serif text-xl leading-snug text-ink">
        <Amount cents={received} compact /> au lieu de <Amount cents={expected} compact />.
      </p>
      <p className="mt-1 text-sm leading-relaxed text-muted">C’est exceptionnel ce mois-ci, ou c’est ton nouveau {name.toLowerCase()} habituel ?</p>
      <div className="mt-3">
        <label htmlFor="variance-reason" className="mb-1.5 block text-[0.8125rem] text-muted">Motif (facultatif)</label>
        <Select id="variance-reason" value={reason} onChange={(e) => setReason(e.target.value as IncomeReason | '')}>
          <option value="">Sans motif</option>
          {VARIANCE_REASONS.map((r) => (
            <option key={r} value={r}>{REASON_LABELS[r]}</option>
          ))}
        </Select>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={() => answer('exceptional')}>Exceptionnel</Button>
        <Button onClick={() => answer('durable')}>Nouveau {name.toLowerCase()}</Button>
      </div>
    </Card>
  );
}

export default function Split({ receiptId }: { receiptId: string }) {
  const data = useData();
  const { toast } = useUI();
  const receipt = data.snap.receipts.find((r) => r.id === receiptId);
  if (!receipt) {
    return (
      <Page>
        <EmptyState title="Encaissement introuvable" body="Il a peut-être été supprimé." action={<Button onClick={() => navigate('/')}>Retour à l’accueil</Button>} />
      </Page>
    );
  }
  const lines = data.ledger.allocations[receipt.id] ?? [];
  const income = receipt.incomeId ? data.snap.incomes.find((i) => i.id === receipt.incomeId) : undefined;
  const habitual = income && income.installments === 1 ? habitualAmount(income, receipt.month) : null;
  const monthReceived = data.snap.receipts
    .filter((r) => r.month === receipt.month && r.incomeId === receipt.incomeId && !r.internal)
    .reduce((a, r) => a + r.amount, 0);
  const hasException = data.snap.incomeExceptions.some((e) => e.incomeId === receipt.incomeId && e.month === receipt.month);
  const variance =
    income && habitual && !receipt.internal && !receipt.varianceAnswered && !hasException && significantVariance(monthReceived, habitual)
      ? { received: monthReceived, expected: habitual, name: income.name }
      : null;
  const view = monthView(data, receipt.month);
  const envName = (id: string) => view.ledger.config.envelopes.find((e) => e.id === id)?.name ?? data.envelopeName(id);

  const groups = new Map<string, Group>();
  for (const l of lines) {
    const g = groups.get(l.accountId) ?? { accountId: l.accountId, total: 0, lines: [], transfers: [] };
    g.total += l.amount;
    g.lines.push(l);
    groups.set(l.accountId, g);
  }
  for (const t of data.snap.transfers) {
    if (t.origin !== 'receipt' || t.refId !== receipt.id) continue;
    const accountId = t.key.split(':')[2];
    groups.get(accountId)?.transfers.push(t);
  }
  const staying = groups.get(receipt.accountId);
  const outgoing = [...groups.values()].filter((g) => g.accountId !== receipt.accountId);
  const allDone = outgoing.every((g) => g.transfers.length > 0 && g.transfers.every((t) => t.done));
  const pendingIds = outgoing.flatMap((g) => g.transfers.filter((t) => !t.done).map((t) => t.id));

  const byEnvelope = new Map<string, number>();
  for (const l of lines) byEnvelope.set(l.envelopeId, (byEnvelope.get(l.envelopeId) ?? 0) + l.amount);

  const lineLabel = (l: AllocLine) => `${envName(l.envelopeId)}${l.pocket ? ` · pocket « ${l.pocket} »` : ''}`;

  const recap = () => {
    const out = [
      `Encaissement : ${formatEUR(receipt.amount, { compact: true })} (${receipt.source}, ${formatDate(receipt.date)})`,
      '',
      'Virements à faire :',
      ...outgoing.map((g) => `• ${formatEUR(g.total, { compact: true })} → ${data.accountName(g.accountId)} (${g.lines.map((l) => `${lineLabel(l)} ${formatEUR(l.amount, { compact: true })}`).join(', ')})`),
    ];
    if (staying) out.push('', `Reste sur ${data.accountName(receipt.accountId)} : ${formatEUR(staying.total, { compact: true })} (${staying.lines.map((l) => envName(l.envelopeId)).join(', ')})`);
    return out.join('\n');
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(recap());
      haptic();
      toast('Récapitulatif copié.');
    } catch {
      toast('Copie impossible sur cet appareil.');
    }
  };

  const toggle = async (g: Group, done: boolean) => {
    const targets = done ? g.transfers.filter((t) => !t.done) : g.transfers.filter((t) => t.done && !t.isAdjustment);
    if (done) {
      haptic('success');
      await setTransfersDone(targets.map((t) => t.id));
    } else {
      for (const t of targets) await setTransferDone(t.id, false);
    }
  };

  return (
    <Page>
      <header className="safe-top flex items-center justify-between pt-2">
        <IconButton icon="x" label="Fermer" className="-ml-3" onClick={() => navigate('/', { replace: true })} />
        <p className="eyebrow">Répartition</p>
        <IconButton icon="copy" label="Copier le récapitulatif" className="-mr-3" onClick={copy} />
      </header>

      <div className="pt-6 pb-8 text-center">
        <motion.p layoutId="income-amount" className="amount font-serif text-[3.75rem] leading-none text-ink tabular">
          {formatEUR(receipt.amount, { compact: true })}
        </motion.p>
        <p className="mt-3 text-sm text-muted">
          {receipt.source} · {formatDate(receipt.date)} · budget {ofMonth(receipt.month)}
        </p>
      </div>

      {variance && <VarianceQuestion receiptId={receipt.id} received={variance.received} expected={variance.expected} name={variance.name} />}

      <SectionTitle>{outgoing.length ? 'Tes virements' : 'Aucun virement à faire'}</SectionTitle>
      <div className="space-y-3">
        {outgoing.map((g, i) => {
          const done = g.transfers.length > 0 && g.transfers.every((t) => t.done);
          const adjustment = g.transfers.find((t) => !t.done && t.isAdjustment);
          return (
            <motion.article
              key={g.accountId}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.08, duration: 0.5, ease }}
              className={`card p-4 transition ${done ? 'border-gold/30' : ''}`}
            >
              <div className="flex items-start gap-2">
                <CheckCircle
                  checked={done}
                  label={`Virement vers ${data.accountName(g.accountId)} fait`}
                  onChange={(v) => toggle(g, v)}
                />
                <div className="min-w-0 flex-1 pt-2">
                  <p className={`text-[1.0625rem] text-ink ${done ? 'line-through decoration-gold/60' : ''}`}>
                    Vire <Amount cents={g.total} compact className="font-medium" /> vers {withArticle(data.account(g.accountId))}
                  </p>
                  {adjustment && (
                    <p className="mt-1 text-[0.8125rem] text-gold">
                      Ajustement à régulariser : vire {formatEUR(adjustment.amount, { compact: true })} {adjustment.adjustmentKind === 'retour' ? `de retour vers ${data.accountName(adjustment.toAccountId)}` : `de plus vers ${data.accountName(adjustment.toAccountId)}`}
                    </p>
                  )}
                  <ul className="mt-2 space-y-1">
                    {g.lines.map((l, j) => (
                      <li key={j} className="flex justify-between gap-3 text-[0.8125rem] text-muted">
                        <span className="truncate">{lineLabel(l)}</span>
                        <Amount cents={l.amount} compact />
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </motion.article>
          );
        })}
        {staying && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + outgoing.length * 0.08, duration: 0.5, ease }}
            className="rounded-[1.25rem] border border-dashed border-line-strong p-4"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center text-muted">
                <Icon name="check" size={18} />
              </span>
              <div className="min-w-0 flex-1 pt-2">
                <p className="text-[0.9375rem] text-ink">
                  <Amount cents={staying.total} compact /> restent sur ton {data.accountName(receipt.accountId)}
                </p>
                <p className="mt-1 text-[0.8125rem] text-muted">Rien à faire : {staying.lines.map((l) => envName(l.envelopeId)).join(', ')}.</p>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {outgoing.length > 0 && (
        <div className="mt-6">
          {allDone ? (
            <div className="text-center">
              <GoldLine />
              <p className="mt-2 font-serif text-xl text-ink">Tout est en place.</p>
            </div>
          ) : (
            pendingIds.length > 1 && (
              <Button
                variant="secondary"
                full
                icon="check"
                onClick={async () => {
                  haptic('success');
                  await setTransfersDone(pendingIds);
                }}
              >
                Tout marquer comme fait
              </Button>
            )
          )}
        </div>
      )}

      <SectionTitle>Détail par enveloppe</SectionTitle>
      <Card className="divide-y divide-line py-1">
        {[...byEnvelope.entries()].map(([envId, amount]) => {
          const progress = view.envelopes.find((e) => e.envelope.id === envId);
          return (
            <div key={envId} className="py-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[0.9375rem] text-ink">{envName(envId)}</span>
                <span className="text-[0.9375rem] text-gold">
                  +<Amount cents={amount} compact />
                </span>
              </div>
              {progress && (
                <>
                  <div className="mt-2">
                    <ProgressBar value={progress.funded} max={progress.target} label={`${envName(envId)} : financé sur objectif`} height={3} />
                  </div>
                  <p className="mt-1.5 text-xs text-muted">
                    <Amount cents={progress.funded} compact /> sur <Amount cents={progress.target} compact /> ce mois-ci
                  </p>
                </>
              )}
            </div>
          );
        })}
      </Card>

      <p className="mt-5 px-1 text-sm leading-relaxed text-muted">
        {view.missing > 0 ? (
          <>Il manque encore <Amount cents={view.missing} compact className="text-ink" /> pour financer tout le mois. Les prochains encaissements s’en chargeront.</>
        ) : (
          'Toutes les enveloppes du mois sont remplies.'
        )}
      </p>

      <div className="mt-8 grid gap-3">
        <Button full onClick={() => navigate('/', { replace: true })}>Terminé</Button>
        <Button variant="secondary" full icon="copy" onClick={copy}>Copier le récapitulatif</Button>
      </div>
    </Page>
  );
}
