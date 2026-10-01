import { useMemo, useState } from 'react';
import { deleteSubscription, saveSubscription, setSubscriptionStatus, uid } from '../db/actions';
import { addMonths, monthLabel, monthOf, monthRange, monthShort } from '../engine/dates';
import { formatEUR, formatPct } from '../engine/money';
import {
  annualCost,
  CATEGORY_LABELS,
  FREQUENCY_LABELS,
  monthlyCostSeries,
  monthlyEquivalent,
  SUBSCRIPTION_COLORS,
  SUGGESTIONS,
} from '../engine/subscriptions';
import type { Subscription, SubscriptionCategory, SubscriptionFrequency, SubscriptionStatus } from '../engine/types';
import { useData } from '../state/data';
import { haptic } from '../state/haptics';
import { navigate } from '../state/router';
import { useUI } from '../state/ui';
import { Amount } from '../ui/Amount';
import { AmountInput } from '../ui/AmountInput';
import { DataTable, DonutChart, EvolutionChart } from '../ui/charts';
import { Button, Card, EmptyState, Field, IconButton, Page, PageHeader, Pill, SectionTitle, Segmented, Select, Sheet, TextInput } from '../ui/kit';
import { SubscriptionIcon } from '../ui/SubscriptionIcon';

const CATEGORY_ORDER: SubscriptionCategory[] = ['divertissement', 'outils', 'cloud', 'sport', 'presse', 'autre'];
/** Couleur fixe par catégorie (palette validée), jamais selon le rang. */
export const categoryColor = (c: SubscriptionCategory) => `var(--cat-${CATEGORY_ORDER.indexOf(c) + 1})`;

const STATUS_LABELS: Record<SubscriptionStatus, string> = { actif: 'Actif', pause: 'En pause', resilie: 'Résilié' };
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

type Filter = 'actif' | 'pause' | 'resilie' | 'tous';

export function scheduleLabel(sub: Subscription): string {
  if (sub.frequency === 'weekly') return 'chaque semaine';
  if (!sub.day) return '';
  if (sub.frequency === 'yearly') return `le ${sub.day} ${MONTHS[(sub.month ?? Number(sub.startDate.slice(5, 7))) - 1]}`;
  return `le ${sub.day}`;
}

function blank(today: string, accountId: string): Subscription {
  return {
    id: uid(),
    name: '',
    color: SUBSCRIPTION_COLORS[0],
    amount: 0,
    priceHistory: [],
    frequency: 'monthly',
    accountId,
    category: 'divertissement',
    startDate: today,
    status: 'actif',
    createdAt: Date.now(),
  };
}

function SubscriptionEditor({ initial, isNew, onClose }: { initial: Subscription; isNew: boolean; onClose: () => void }) {
  const { snap } = useData();
  const { toast } = useUI();
  const [draft, setDraft] = useState<Subscription>(initial);
  const [confirm, setConfirm] = useState<'cancel' | 'delete' | null>(null);
  const set = (patch: Partial<Subscription>) => setDraft((d) => ({ ...d, ...patch }));
  const increase = !isNew && draft.amount > initial.amount;
  const impact = annualCost({ frequency: draft.frequency, amount: draft.amount }) - annualCost({ frequency: draft.frequency, amount: initial.amount });
  const accounts = snap.accounts.filter((a) => !a.archived && (a.type === 'courant' || a.type === 'revolut'));

  const save = async () => {
    const change = await saveSubscription({ ...draft, name: draft.name.trim(), icon: draft.icon?.trim() || undefined });
    haptic('success');
    if (change && change.current > change.previous) toast(`Hausse enregistrée : ${formatEUR(change.annualImpact, { compact: true })} de plus par an.`);
    else toast(isNew ? 'Abonnement ajouté. Ton budget est à jour.' : 'Abonnement enregistré.');
    onClose();
  };

  return (
    <>
      {isNew && (
        <div className="mb-5">
          <p className="mb-2 text-[0.8125rem] text-muted">Suggestions (montants indicatifs, modifiables)</p>
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 scrollbar-none">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.name}
                type="button"
                aria-pressed={draft.name === s.name}
                onClick={() => set({ name: s.name, amount: s.amount, frequency: s.frequency, category: s.category, color: s.color })}
                className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full border py-1 pr-4 pl-1.5 text-sm transition ${draft.name === s.name ? 'border-gold bg-gold-soft text-gold' : 'border-line-strong text-ink'}`}
              >
                <SubscriptionIcon sub={s} size={28} />
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <Field label="Nom" htmlFor="sub-name">
        <TextInput id="sub-name" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Netflix, salle de sport…" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Montant" htmlFor="sub-amount">
          <AmountInput id="sub-amount" value={draft.amount} onChange={(v) => set({ amount: v ?? 0 })} />
        </Field>
        <Field label="Fréquence" htmlFor="sub-freq">
          <Select id="sub-freq" value={draft.frequency} onChange={(e) => set({ frequency: e.target.value as SubscriptionFrequency })}>
            {(Object.keys(FREQUENCY_LABELS) as SubscriptionFrequency[]).map((f) => (
              <option key={f} value={f}>{FREQUENCY_LABELS[f].adjective}</option>
            ))}
          </Select>
        </Field>
      </div>
      {increase && (
        <p className="-mt-2 mb-4 rounded-xl border border-gold/30 bg-gold-soft px-3 py-2 text-xs leading-relaxed text-ink" role="status">
          Hausse de prix : {formatEUR(initial.amount)} → {formatEUR(draft.amount)}, soit {formatEUR(impact, { compact: true })} de plus par an.
        </p>
      )}
      {draft.frequency !== 'weekly' && (
        <div className={`grid gap-3 ${draft.frequency === 'monthly' ? 'grid-cols-1' : 'grid-cols-2'}`}>
          <Field label="Jour de prélèvement" htmlFor="sub-day" hint={draft.frequency === 'monthly' ? 'Si le mois est plus court, le prélèvement tombe le dernier jour.' : undefined}>
            <Select id="sub-day" value={draft.day ?? ''} onChange={(e) => set({ day: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">À compléter</option>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </Select>
          </Field>
          {draft.frequency !== 'monthly' && (
            <Field label={draft.frequency === 'yearly' ? 'Mois' : 'Premier mois'} htmlFor="sub-month">
              <Select id="sub-month" value={draft.month ?? Number(draft.startDate.slice(5, 7))} onChange={(e) => set({ month: Number(e.target.value) })}>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Compte débité" htmlFor="sub-account">
          <Select id="sub-account" value={draft.accountId} onChange={(e) => set({ accountId: e.target.value })}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Catégorie" htmlFor="sub-cat">
          <Select id="sub-cat" value={draft.category} onChange={(e) => set({ category: e.target.value as SubscriptionCategory })}>
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="mb-4">
        <p className="mb-1.5 text-[0.8125rem] text-muted">Couleur et initiale</p>
        <div className="flex items-center gap-3">
          <SubscriptionIcon sub={{ ...draft, name: draft.name || '?' }} size={44} />
          <div className="flex flex-1 flex-wrap gap-1" role="radiogroup" aria-label="Couleur">
            {SUBSCRIPTION_COLORS.map((c, i) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={draft.color === c}
                aria-label={`Couleur ${i + 1}`}
                onClick={() => set({ color: c })}
                className="flex h-9 w-9 items-center justify-center rounded-full"
              >
                <span className={`h-6 w-6 rounded-full ${draft.color === c ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : ''}`} style={{ background: c }} />
              </button>
            ))}
          </div>
          <label htmlFor="sub-icon" className="sr-only">Icône ou initiales</label>
          <TextInput id="sub-icon" value={draft.icon ?? ''} maxLength={2} onChange={(e) => set({ icon: e.target.value })} placeholder={draft.name.charAt(0).toUpperCase() || 'A'} className="w-16 text-center" />
        </div>
      </div>
      <details className="mb-5 rounded-xl border border-line px-4">
        <summary className="flex min-h-12 cursor-pointer items-center text-sm text-muted">Dates, lien et note</summary>
        <div className="pb-2">
          <Field label="Date de début" htmlFor="sub-start">
            <TextInput id="sub-start" type="date" value={draft.startDate} onChange={(e) => e.target.value && set({ startDate: e.target.value })} />
          </Field>
          <Field label="Fin de l’essai gratuit (facultatif)" htmlFor="sub-trial">
            <TextInput id="sub-trial" type="date" value={draft.trialEnd ?? ''} onChange={(e) => set({ trialEnd: e.target.value || undefined })} />
          </Field>
          <Field label="Fin d’engagement (facultatif)" htmlFor="sub-commit">
            <TextInput id="sub-commit" type="date" value={draft.commitmentEnd ?? ''} onChange={(e) => set({ commitmentEnd: e.target.value || undefined })} />
          </Field>
          <Field label="Lien de gestion ou de résiliation" htmlFor="sub-url">
            <TextInput id="sub-url" type="url" inputMode="url" value={draft.url ?? ''} onChange={(e) => set({ url: e.target.value || undefined })} placeholder="https://" />
          </Field>
          <Field label="Note" htmlFor="sub-note">
            <TextInput id="sub-note" value={draft.note ?? ''} onChange={(e) => set({ note: e.target.value || undefined })} />
          </Field>
        </div>
      </details>
      <div className="grid gap-3">
        <Button full disabled={!draft.name.trim() || draft.amount <= 0} onClick={save}>
          {isNew ? 'Ajouter l’abonnement' : 'Enregistrer'}
        </Button>
        {!isNew && (
          <div className="grid grid-cols-2 gap-3">
            {draft.status === 'actif' ? (
              <Button variant="secondary" onClick={async () => { await setSubscriptionStatus(draft.id, 'pause'); toast('Abonnement en pause.'); onClose(); }}>Mettre en pause</Button>
            ) : (
              <Button variant="secondary" onClick={async () => { await setSubscriptionStatus(draft.id, 'actif'); toast('Abonnement réactivé.'); onClose(); }}>Réactiver</Button>
            )}
            {draft.status !== 'resilie' ? (
              <Button variant="danger" onClick={() => setConfirm('cancel')}>Résilier</Button>
            ) : (
              <Button variant="danger" onClick={() => setConfirm('delete')}>Supprimer</Button>
            )}
          </div>
        )}
      </div>
      {confirm && (
        <div className="mt-4 rounded-2xl border border-negative/40 p-4" role="alertdialog" aria-label="Confirmation">
          <p className="text-sm leading-relaxed text-ink">
            {confirm === 'cancel'
              ? `Résilier ${draft.name} ? Tu économises ${formatEUR(annualCost(initial), { compact: true })} par an. ${draft.url ? 'Le lien de résiliation va s’ouvrir.' : ''}`
              : `Supprimer définitivement ${draft.name} de l’historique ?`}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => setConfirm(null)}>Annuler</Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (confirm === 'cancel') {
                  if (draft.url) window.open(draft.url, '_blank', 'noopener,noreferrer');
                  await setSubscriptionStatus(draft.id, 'resilie');
                  toast(`${draft.name} résilié. ${formatEUR(annualCost(initial), { compact: true })} d’économie par an.`);
                } else {
                  await deleteSubscription(draft.id);
                  toast('Abonnement supprimé.');
                }
                onClose();
              }}
            >
              Confirmer
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

export default function Subscriptions({ query }: { query: URLSearchParams }) {
  const data = useData();
  const { snap, today } = data;
  const [filter, setFilter] = useState<Filter>('actif');
  const editId = query.get('edit');
  const [editing, setEditing] = useState<{ sub: Subscription; isNew: boolean } | null>(() => {
    const found = snap.subscriptions.find((s) => s.id === editId);
    if (found) return { sub: found, isNew: false };
    if (query.get('nouveau')) return { sub: blank(today, snap.accounts.find((a) => a.type === 'courant')?.id ?? snap.accounts[0]?.id ?? ''), isNew: true };
    return null;
  });

  const active = snap.subscriptions.filter((s) => s.status === 'actif');
  const monthly = active.reduce((a, s) => a + monthlyEquivalent(s), 0);
  const yearly = active.reduce((a, s) => a + annualCost(s), 0);
  const incomes = snap.incomes.filter((i) => !i.archived).reduce((a, i) => a + (i.amount ?? 0), 0);
  const list = snap.subscriptions
    .filter((s) => filter === 'tous' || s.status === filter)
    .sort((a, b) => monthlyEquivalent(b) - monthlyEquivalent(a));

  const byCategory = CATEGORY_ORDER.map((c) => ({
    key: c,
    label: CATEGORY_LABELS[c],
    value: Math.round(active.filter((s) => s.category === c).reduce((a, s) => a + monthlyEquivalent(s), 0)),
    color: categoryColor(c),
  })).filter((d) => d.value > 0);

  const series = useMemo(() => {
    const first = [...snap.subscriptions.map((s) => s.startDate), today].sort()[0];
    const from = monthOf(first) < addMonths(monthOf(today), -11) ? addMonths(monthOf(today), -11) : monthOf(first);
    return monthlyCostSeries(snap.subscriptions, monthRange(from, monthOf(today)));
  }, [snap.subscriptions, today]);

  const defaultAccount = snap.accounts.find((a) => a.type === 'courant')?.id ?? snap.accounts[0].id;

  return (
    <Page>
      <PageHeader
        eyebrow="Prélèvements"
        title="Abonnements"
        back
        backTo="/"
        actions={
<IconButton icon="plus" label="Ajouter un abonnement" onClick={() => setEditing({ sub: blank(today, defaultAccount), isNew: true })} />
        }
      />

      <Card>
        <p className="font-serif text-[1.75rem] leading-snug text-ink">
          Tes abonnements te coûtent <Amount cents={Math.round(yearly / 100) * 100} compact className="text-gold" /> par an.
        </p>
        <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
          <div>
            <dt className="eyebrow">Par mois</dt>
            <dd className="mt-1.5 font-serif text-2xl text-ink"><Amount cents={Math.round(monthly)} animated /></dd>
          </div>
          <div>
            <dt className="eyebrow">Revenus</dt>
            <dd className="mt-1.5 font-serif text-2xl text-ink">{formatPct(incomes > 0 ? monthly / incomes : 0, 1)}</dd>
          </div>
          <div>
            <dt className="eyebrow">Actifs</dt>
            <dd className="mt-1.5 font-serif text-2xl text-ink">{active.length}</dd>
          </div>
        </dl>
      </Card>

      {byCategory.length > 0 && (
        <>
          <SectionTitle>Par catégorie</SectionTitle>
          <Card>
            <div className="flex flex-col items-center gap-5 sm:flex-row">
              <DonutChart
                data={byCategory}
                label={`Répartition mensuelle par catégorie : ${byCategory.map((c) => `${c.label} ${formatEUR(c.value)}`).join(', ')}`}
                center={
                  <>
                    <span className="font-serif text-2xl text-ink"><Amount cents={Math.round(monthly)} compact /></span>
                    <span className="text-xs text-muted">par mois</span>
                  </>
                }
              />
              <ul className="w-full flex-1 space-y-2.5">
                {byCategory.map((c) => (
                  <li key={c.key} className="flex items-center gap-3 text-sm">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                    <span className="flex-1 text-ink">{c.label}</span>
                    <Amount cents={c.value} className="text-ink" />
                    <span className="w-10 text-right text-xs text-muted">{formatPct(monthly > 0 ? c.value / monthly : 0)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <DataTable caption="Coût mensuel par catégorie" columns={['Catégorie', 'Par mois']} rows={byCategory.map((c) => [c.label, c.value])} />
          </Card>
        </>
      )}

      <SectionTitle>Coût mensuel dans le temps</SectionTitle>
      <Card>
        {series.length < 2 ? (
          <p className="text-sm leading-relaxed text-muted">La courbe apparaîtra dès le mois prochain. Elle montrera l’effet de chaque ajout, hausse ou résiliation.</p>
        ) : (
          <>
            <EvolutionChart data={series.map((p) => ({ label: monthShort(p.month), value: p.total }))} label="Évolution du coût mensuel des abonnements" seriesLabel="Coût mensuel" height="h-40" />
            <DataTable caption="Coût mensuel des abonnements" columns={['Mois', 'Coût']} rows={series.map((p) => [monthLabel(p.month), p.total])} />
          </>
        )}
      </Card>

      <SectionTitle>Tes abonnements</SectionTitle>
      <Segmented
        label="Filtrer par statut"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'actif', label: 'Actifs' },
          { value: 'pause', label: 'En pause' },
          { value: 'resilie', label: 'Résiliés' },
          { value: 'tous', label: 'Tous' },
        ]}
      />
      <Card className="mt-3 divide-y divide-line py-0">
        {list.length === 0 ? (
          <EmptyState icon="receipt" title="Rien ici" body={filter === 'actif' ? 'Aucun abonnement actif. Ajoute le premier en quelques secondes.' : 'Aucun abonnement avec ce statut.'} />
        ) : (
          list.map((s) => (
            <button key={s.id} type="button" onClick={() => setEditing({ sub: s, isNew: false })} className="flex min-h-16 w-full items-center gap-3 py-3 text-left transition active:opacity-70" aria-label={`Modifier l’abonnement ${s.name}`}>
              <SubscriptionIcon sub={s} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[0.9375rem] text-ink">{s.name}</span>
                  {s.status !== 'actif' && <Pill tone={s.status === 'pause' ? 'muted' : 'negative'}>{STATUS_LABELS[s.status]}</Pill>}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[0.8125rem] text-muted">
                  {FREQUENCY_LABELS[s.frequency].adjective}
                  {scheduleLabel(s) ? ` · ${scheduleLabel(s)}` : ''} · {data.accountName(s.accountId)}
                  {!s.day && s.frequency !== 'weekly' && s.status === 'actif' && <Pill tone="gold">à compléter</Pill>}
                </span>
              </span>
              <span className="text-right">
                <Amount cents={s.amount} className="block font-serif text-lg text-ink" />
                <span className="text-xs text-muted">/ {FREQUENCY_LABELS[s.frequency].per}</span>
              </span>
            </button>
          ))
        )}
      </Card>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Button icon="plus" onClick={() => setEditing({ sub: blank(today, defaultAccount), isNew: true })}>Ajouter</Button>
        <Button variant="secondary" icon="month" onClick={() => navigate('/calendrier')}>Calendrier</Button>
      </div>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing?.isNew ? 'Nouvel abonnement' : editing?.sub.name ?? ''}>
        {editing && <SubscriptionEditor key={editing.sub.id} initial={editing.sub} isNew={editing.isNew} onClose={() => setEditing(null)} />}
      </Sheet>
      <p className="sr-only" aria-live="polite">{list.length} abonnements affichés</p>
    </Page>
  );
}
