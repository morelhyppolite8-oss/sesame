import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { completeReview, reopenReview, saveReviewDraft, setSubscriptionStatus, setTransferDone } from '../db/actions';
import { addMonths, monthLabel, monthOf, ofMonth } from '../engine/dates';
import { missingFunding, savedInMonth, savingsTarget } from '../engine/health';
import { monthlyReviewIcs } from '../engine/ics';
import { formatEUR, formatPct } from '../engine/money';
import { adviceFor, computeLeftovers } from '../engine/review';
import { spendingByEnvelope } from '../engine/revolutCsv';
import { annualCost, monthCharges, subscriptionConsumption } from '../engine/subscriptions';
import type { Cents, Review as ReviewT, Subscription } from '../engine/types';
import { useData } from '../state/data';
import { appUrl, downloadFile } from '../state/files';
import { haptic } from '../state/haptics';
import { goBack, navigate } from '../state/router';
import { cushionView, monthLedger } from '../state/selectors';
import { useUI } from '../state/ui';
import { Amount } from '../ui/Amount';
import { AmountInput } from '../ui/AmountInput';
import { Icon } from '../ui/Icon';
import { Button, Card, CheckCircle, EmptyState, GoldLine, IconButton, Segmented, Toggle } from '../ui/kit';
import { SubscriptionIcon } from '../ui/SubscriptionIcon';
import { TransferLabel } from '../ui/TransferLabel';

const ease = [0.22, 1, 0.36, 1] as const;
const STEPS = ['Virements', 'Abonnements', 'Dépenses', 'Reliquats', 'Note', 'Bilan'];

export default function Review({ month }: { month: string }) {
  const data = useData();
  const { toast } = useUI();
  const stored = data.snap.reviews.find((r) => r.month === month);
  const ledger = monthLedger(data, month);
  const config = ledger.config;
  const spendEnvelopes = config.envelopes.filter((e) => e.kind === 'depense' && !e.archived).sort((a, b) => a.priority - b.priority);
  const imported = useMemo(() => spendingByEnvelope(data.snap.bankTransactions, month), [data.snap.bankTransactions, month]);
  const hasImport = Object.keys(imported).length > 0;

  const [draft, setDraft] = useState<ReviewT>(() => {
    const base: ReviewT = stored ?? { month, spent: {}, carry: {}, note: '', step: 0 };
    const spent = { ...base.spent };
    for (const e of spendEnvelopes) {
      if (spent[e.id] !== undefined) continue;
      if (e.auto === 'subscriptions') spent[e.id] = subscriptionConsumption(data.snap.subscriptions, month);
      else if (imported[e.id] !== undefined) spent[e.id] = imported[e.id];
    }
    return { ...base, spent };
  });
  const [mode, setMode] = useState<'reste' | 'depense'>('reste');
  const [finished, setFinished] = useState(false);
  const step = draft.completedAt ? 5 : draft.step;

  // Abonnements prélevés ce mois-ci (un par abonnement, montants cumulés).
  const monthSubs = [...monthCharges(data.snap.subscriptions, month).reduce((map, c) => {
    const e = map.get(c.sub.id) ?? { sub: c.sub, amount: 0 };
    e.amount += c.amount;
    return map.set(c.sub.id, e);
  }, new Map<string, { sub: Subscription; amount: Cents }>()).values()];
  const subscriptionSavings = monthSubs
    .filter(({ sub }) => draft.subscriptionDecisions?.[sub.id] === 'cancel')
    .reduce((a, { sub }) => a + annualCost(sub), 0);

  const decide = async (id: string, decision: 'keep' | 'cancel', undo = false) => {
    const sub = data.snap.subscriptions.find((x) => x.id === id);
    const updated = { ...draft, subscriptionDecisions: { ...draft.subscriptionDecisions, [id]: decision } };
    setDraft(updated);
    await saveReviewDraft(updated);
    if (decision === 'cancel' && sub) {
      if (sub.url) window.open(sub.url, '_blank', 'noopener,noreferrer');
      await setSubscriptionStatus(id, 'resilie');
      haptic('success');
      toast(`${sub.name} résilié : ${formatEUR(annualCost(sub), { compact: true })} d’économie par an.`);
    } else if (undo) {
      await setSubscriptionStatus(id, 'actif');
    } else haptic();
  };

  const cushion = cushionView(data);
  const preview = computeLeftovers(month, config, ledger.funded, draft, cushion.balance, data.today);
  const saved = savedInMonth(ledger) + (draft.completedAt ? 0 : preview.toSavings);
  const target = savingsTarget(ledger);
  const pending = data.snap.transfers.filter((t) => !t.done && t.month <= month);

  const previousLeftovers: Record<string, Cents[]> = {};
  for (const m of [addMonths(month, -1), addMonths(month, -2)]) {
    for (const item of data.ledger.months[m]?.leftovers?.items ?? []) {
      (previousLeftovers[item.envelope.id] ??= []).push(item.diff);
    }
  }
  const advice = adviceFor({
    month,
    items: preview.items,
    savingsTarget: target,
    savedThisMonth: saved,
    cushion: cushion.balance + (draft.completedAt ? 0 : preview.toSavings),
    cushionTarget: cushion.target,
    missingFunding: missingFunding(ledger).reduce((a, m) => a + m.missing, 0),
    previousLeftovers,
  });

  const go = async (next: number) => {
    const updated = { ...draft, step: next };
    setDraft(updated);
    await saveReviewDraft(updated);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const finish = async () => {
    const snapshot = {
      received: ledger.received,
      saved,
      savingsRate: ledger.received > 0 ? saved / ledger.received : 0,
      leftovers: preview.toSavings,
      overspent: preview.overspent,
      cushion: cushion.balance + preview.toSavings,
      advice,
      subscriptionSavings,
    };
    await completeReview({ ...draft, step: 5, snapshot });
    setDraft((d) => ({ ...d, step: 5, completedAt: data.today, snapshot }));
    setFinished(true);
    haptic('success');
  };

  const exportIcs = () => {
    const next = addMonths(monthOf(data.today), 1);
    const day = data.snap.settings.reminderDay;
    downloadFile(
      'revue-mensuelle.ics',
      monthlyReviewIcs({ firstDate: `${next}-${String(day).padStart(2, '0')}`, day, hour: data.snap.settings.reminderHour, minute: 0, url: appUrl() }),
      'text/calendar',
    );
    toast('Rappel exporté. Ouvre-le pour l’ajouter à ton calendrier.');
  };

  const setSpent = (id: string, value: Cents | null, funded: Cents) => {
    const spent = { ...draft.spent };
    if (value === null) delete spent[id];
    else spent[id] = mode === 'reste' ? funded - value : value;
    setDraft({ ...draft, spent });
  };

  if (ledger.receiptIds.length === 0 && !stored) {
    return (
      <main className="safe-top mx-auto max-w-xl px-5">
        <header className="flex items-center pt-2">
          <IconButton icon="x" label="Fermer" className="-ml-3" onClick={() => goBack('/mois')} />
        </header>
        <EmptyState icon="review" title="Rien à revoir" body={`Aucun encaissement ${ofMonth(month)}. La revue devient utile dès que le mois a vécu.`} action={<Button onClick={() => navigate('/mois', { replace: true })}>Retour au mois</Button>} />
      </main>
    );
  }

  return (
    <main className="safe-top mx-auto min-h-dvh max-w-xl px-5 pb-16">
      <header className="flex items-center justify-between pt-2">
        <IconButton icon="x" label="Fermer la revue" className="-ml-3" onClick={() => goBack('/mois')} />
        <p className="eyebrow">Revue {ofMonth(month)}</p>
        <IconButton icon="calendarPlus" label="Ajouter un rappel mensuel à mon calendrier" className="-mr-3" onClick={exportIcs} />
      </header>

      <ol className="mt-4 mb-8 grid grid-cols-6 gap-1.5" aria-label="Étapes de la revue">
        {STEPS.map((s, i) => (
          <li key={s} className="text-center" aria-current={i === step ? 'step' : undefined}>
            <span className={`block h-px transition-colors duration-500 ${i <= step ? 'bg-gold' : 'bg-line-strong'}`} />
            <span className={`mt-2 block text-[0.6875rem] ${i === step ? 'text-gold' : 'text-muted'}`}>{s}</span>
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait">
        <motion.section key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.35, ease }}>
          {step === 0 && (
            <>
              <h1 className="font-serif text-4xl leading-tight text-ink">Les virements en suspens</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted">Avant de regarder le réel, vérifions que tout ce qui était prévu a bien été fait.</p>
              <Card className="mt-6 divide-y divide-line py-1">
                {pending.length === 0 ? (
                  <EmptyState icon="check" title="Aucun" body="Tous les virements du mois sont cochés. Parfait." />
                ) : (
                  pending.map((t) => (
                    <div key={t.id} className="flex items-start gap-2 py-2">
                      <CheckCircle checked={false} label={`Marquer comme fait : ${formatEUR(t.amount)}`} onChange={() => { haptic('success'); setTransferDone(t.id, true); }} />
                      <TransferLabel transfer={t} />
                    </div>
                  ))
                )}
              </Card>
              <div className="mt-8">
                <Button full onClick={() => go(1)}>{pending.length ? 'Continuer, je les ferai plus tard' : 'Continuer'}</Button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h1 className="font-serif text-4xl leading-tight text-ink">Tes abonnements</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted">Prélevés en {monthLabel(month, false)}. Pour chacun, une seule question : tu l’utilises encore ?</p>
              <Card className="mt-6 divide-y divide-line py-0">
                {monthSubs.length === 0 ? (
                  <EmptyState icon="receipt" title="Aucun prélèvement" body="Aucun abonnement n’a été prélevé ce mois-ci." />
                ) : (
                  monthSubs.map(({ sub, amount }) => {
                    const decision = draft.subscriptionDecisions?.[sub.id];
                    return (
                      <div key={sub.id} className="py-4">
                        <div className="flex items-center gap-3">
                          <SubscriptionIcon sub={sub} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[0.9375rem] text-ink">{sub.name}</p>
                            <p className="text-xs text-muted">
                              <Amount cents={amount} /> ce mois · <Amount cents={annualCost(sub)} compact /> par an
                            </p>
                          </div>
                        </div>
                        {decision === 'cancel' ? (
                          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-gold/30 bg-gold-soft px-3 py-2 text-sm">
                            <span className="text-ink">Résilié · <Amount cents={annualCost(sub)} compact /> économisés par an</span>
                            <button type="button" className="min-h-11 text-gold" onClick={() => decide(sub.id, 'keep', true)}>Annuler</button>
                          </div>
                        ) : (
                          <div className="mt-3">
                            <p className="mb-2 text-sm text-muted">Tu l’utilises encore ?</p>
                            <div className="grid grid-cols-2 gap-2" role="group" aria-label={`Décision pour ${sub.name}`}>
                              <Button variant={decision === 'keep' ? 'primary' : 'secondary'} aria-pressed={decision === 'keep'} onClick={() => decide(sub.id, 'keep')}>Garder</Button>
                              <Button variant="danger" onClick={() => decide(sub.id, 'cancel')}>Résilier</Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </Card>
              {subscriptionSavings > 0 && (
                <p className="mt-4 px-1 font-serif text-xl text-ink">
                  Économie réalisée : <Amount cents={subscriptionSavings} compact className="text-gold" /> par an.
                </p>
              )}
              <div className="mt-6 grid grid-cols-[auto_1fr] gap-3">
                <Button variant="secondary" onClick={() => go(0)} aria-label="Étape précédente"><Icon name="back" size={18} /></Button>
                <Button full onClick={() => go(2)}>Continuer</Button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="font-serif text-4xl leading-tight text-ink">Ce qui a vraiment été dépensé</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Recopie le solde de tes pockets Revolut, ou saisis directement ce que tu as dépensé.
                {hasImport && ' Les montants ont été préremplis depuis ton relevé importé.'}
              </p>
              <div className="mt-5">
                <Segmented
                  label="Mode de saisie"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: 'reste', label: 'Ce qui reste' },
                    { value: 'depense', label: 'Ce que j’ai dépensé' },
                  ]}
                />
              </div>
              <Card className="mt-4 divide-y divide-line py-1">
                {spendEnvelopes.map((e) => {
                  const funded = ledger.funded[e.id] ?? 0;
                  const spent = draft.spent[e.id];
                  const shown = spent === undefined ? null : mode === 'reste' ? funded - spent : spent;
                  return (
                    <div key={e.id} className="py-4">
                      <div className="mb-2 flex items-baseline justify-between gap-3">
                        <label htmlFor={`spent-${e.id}`} className="text-[0.9375rem] text-ink">
                          {e.name}
                          {e.pocket && <span className="text-muted"> · pocket « {e.pocket} »</span>}
                        </label>
                        <span className="text-xs text-muted">financé <Amount cents={funded} compact /></span>
                      </div>
                      <AmountInput id={`spent-${e.id}`} allowEmpty value={shown} onChange={(v) => setSpent(e.id, v, funded)} placeholder={mode === 'reste' ? 'Solde restant' : 'Dépensé'} />
                      {imported[e.id] !== undefined && <p className="mt-1.5 text-xs text-faint">Relevé importé : <Amount cents={imported[e.id]} /> dépensés</p>}
                      {e.auto === 'subscriptions' && (
                        <p className="mt-1.5 text-xs text-faint">Prérempli depuis tes abonnements ; la part des annuels et trimestriels reste de côté pour leur échéance.</p>
                      )}
                    </div>
                  );
                })}
              </Card>
              <button type="button" onClick={() => navigate(`/import?month=${month}`)} className="mt-3 flex min-h-11 items-center gap-2 text-sm text-gold">
                <Icon name="file" size={16} /> Importer un relevé Revolut
              </button>
              <div className="mt-6 grid grid-cols-[auto_1fr] gap-3">
                <Button variant="secondary" onClick={() => go(1)} aria-label="Étape précédente"><Icon name="back" size={18} /></Button>
                <Button full onClick={() => go(3)} disabled={spendEnvelopes.some((e) => draft.spent[e.id] === undefined)}>Voir les écarts</Button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h1 className="font-serif text-4xl leading-tight text-ink">Prévu, réel, et la suite</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted">Ce qui n’a pas été dépensé part en épargne, sauf si tu préfères le garder pour le mois prochain.</p>
              <Card className="mt-6 divide-y divide-line py-1">
                {preview.items.map((item) => (
                  <div key={item.envelope.id} className="py-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-[0.9375rem] text-ink">{item.envelope.name}</p>
                      <p className={`text-sm font-medium ${item.diff > 0 ? 'text-positive' : item.diff < 0 ? 'text-negative' : 'text-muted'}`}>
                        {item.diff === 0 ? 'Pile' : <Amount cents={item.diff} compact sign />}
                      </p>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      Prévu <Amount cents={item.funded} compact /> · réel <Amount cents={item.spent ?? 0} compact />
                    </p>
                    {item.diff > 0 && (
                      <Toggle
                        checked={Boolean(draft.carry[item.envelope.id])}
                        onChange={(v) => setDraft({ ...draft, carry: { ...draft.carry, [item.envelope.id]: v } })}
                        label="Reporter au mois suivant"
                        description={draft.carry[item.envelope.id] ? 'Il restera dans l’enveloppe et comptera comme déjà financé.' : 'Sinon, il part en épargne.'}
                      />
                    )}
                    {item.diff < 0 && <p className="mt-2 text-xs leading-relaxed text-muted">Dépassement : ça arrive. On en tire une piste pour le mois prochain au bilan.</p>}
                  </div>
                ))}
              </Card>
              <p className="eyebrow mt-8 mb-3 px-1">Virements générés</p>
              <Card className="divide-y divide-line py-1">
                {preview.targets.length === 0 ? (
                  <p className="py-4 text-sm text-muted">Aucun virement : rien ne part en épargne ce mois-ci.</p>
                ) : (
                  preview.targets.map((t) => (
                    <div key={t.key} className="py-3">
                      <TransferLabel transfer={{ ...t, id: t.key, done: false, isAdjustment: false, createdAt: 0 }} showDate={false} showLines />
                    </div>
                  ))
                )}
              </Card>
              <div className="mt-6 grid grid-cols-[auto_1fr] gap-3">
                <Button variant="secondary" onClick={() => go(2)} aria-label="Étape précédente"><Icon name="back" size={18} /></Button>
                <Button full onClick={() => go(4)}>Continuer</Button>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h1 className="font-serif text-4xl leading-tight text-ink">Un mot sur ce mois</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted">Ce qui s’est passé, ce que tu veux retenir. Facultatif, mais précieux dans un an.</p>
              <label htmlFor="note" className="sr-only">Note du mois</label>
              <textarea
                id="note"
                rows={6}
                value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                placeholder="Anniversaire de Léa, premier mois en phase 2…"
                className="mt-6 w-full rounded-2xl border border-line-strong bg-surface p-4 text-[1rem] leading-relaxed text-ink placeholder:text-faint focus:border-gold focus:outline-none"
              />
              <div className="mt-6 grid grid-cols-[auto_1fr] gap-3">
                <Button variant="secondary" onClick={() => go(3)} aria-label="Étape précédente"><Icon name="back" size={18} /></Button>
                <Button full onClick={() => go(5)}>Voir le bilan</Button>
              </div>
            </>
          )}

          {step === 5 && (
            <>
              <p className="eyebrow">Bilan</p>
              <h1 className="mt-2 font-serif text-4xl leading-tight text-ink capitalize">{monthLabel(month)}</h1>
              {(finished || draft.completedAt) && <GoldLine className="mt-4" />}
              <Card className="mt-6">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-6">
                  <div>
                    <dt className="eyebrow">Reçu</dt>
                    <dd className="mt-2 font-serif text-3xl text-ink"><Amount cents={draft.snapshot?.received ?? ledger.received} compact animated /></dd>
                  </div>
                  <div>
                    <dt className="eyebrow">Épargné</dt>
                    <dd className="mt-2 font-serif text-3xl text-gold"><Amount cents={draft.snapshot?.saved ?? saved} compact animated /></dd>
                  </div>
                  <div>
                    <dt className="eyebrow">Taux d’épargne</dt>
                    <dd className="mt-2 font-serif text-3xl text-ink">{formatPct(draft.snapshot?.savingsRate ?? (ledger.received ? saved / ledger.received : 0))}</dd>
                  </div>
                  <div>
                    <dt className="eyebrow">Reliquats épargnés</dt>
                    <dd className="mt-2 font-serif text-3xl text-ink"><Amount cents={draft.snapshot?.leftovers ?? preview.toSavings} compact /></dd>
                  </div>
                </dl>
                <p className="mt-6 border-t border-line pt-4 text-sm text-muted">
                  {saved >= target ? 'Objectif d’épargne atteint.' : <>Objectif d’épargne : <Amount cents={saved} compact /> sur <Amount cents={target} compact />.</>}
                  {(draft.snapshot?.overspent ?? preview.overspent) > 0 && <> Dépassements : <Amount cents={draft.snapshot?.overspent ?? preview.overspent} compact />.</>}
                  {(draft.snapshot?.subscriptionSavings ?? subscriptionSavings) > 0 && (
                    <> Résiliations : <Amount cents={draft.snapshot?.subscriptionSavings ?? subscriptionSavings} compact className="text-gold" /> économisés par an.</>
                  )}
                </p>
              </Card>
              <Card className="mt-4 border-gold/30">
                <p className="eyebrow text-gold">Pour le mois prochain</p>
                <p className="mt-3 font-serif text-xl leading-snug text-ink">{draft.snapshot?.advice ?? advice}</p>
              </Card>
              {draft.note && (
                <Card className="mt-4">
                  <p className="eyebrow">Ta note</p>
                  <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-muted">{draft.note}</p>
                </Card>
              )}
              <div className="mt-8 grid gap-3">
                {draft.completedAt ? (
                  <>
                    <Button full onClick={() => navigate('/', { replace: true })}>Retour à l’accueil</Button>
                    <Button variant="secondary" full icon="calendarPlus" onClick={exportIcs}>Rappel mensuel dans mon calendrier</Button>
                    <Button
                      variant="ghost"
                      full
                      onClick={async () => {
                        await reopenReview(month);
                        setDraft((d) => ({ ...d, completedAt: undefined, snapshot: undefined, step: 2 }));
                        setFinished(false);
                      }}
                    >
                      Modifier la revue
                    </Button>
                  </>
                ) : (
                  <>
                    <Button full onClick={finish}>Valider la revue</Button>
                    <Button variant="secondary" full onClick={() => go(4)}>Revenir en arrière</Button>
                  </>
                )}
              </div>
            </>
          )}
        </motion.section>
      </AnimatePresence>
    </main>
  );
}
