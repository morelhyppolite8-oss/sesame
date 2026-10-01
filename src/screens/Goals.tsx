import { useState } from 'react';
import { deleteGoal, saveGoal } from '../db/actions';
import { goalCurrent } from '../db/derive';
import { monthLabel, monthIndex, monthOf } from '../engine/dates';
import { averagePace, goalProgress, type GoalProgress } from '../engine/goals';
import { savedInMonth } from '../engine/health';
import { formatPct } from '../engine/money';
import type { Cents, Goal, GoalLink } from '../engine/types';
import { useData, type AppData } from '../state/data';
import { navigate } from '../state/router';
import { provisionsView } from '../state/selectors';
import { useUI } from '../state/ui';
import { Amount } from '../ui/Amount';
import { AmountInput } from '../ui/AmountInput';
import { Button, Card, EmptyState, Field, GoldLine, IconButton, Page, PageHeader, ProgressBar, SectionTitle, Select, Sheet, TextInput } from '../ui/kit';

function monthlyPace(data: AppData, goal: Goal): Cents {
  const current = monthOf(data.today);
  const months = Object.values(data.ledger.months)
    .filter((m) => m.received > 0 && monthIndex(m.month) <= monthIndex(current))
    .sort((a, b) => a.month.localeCompare(b.month));
  const link = goal.link;
  if (link.type === 'envelope') {
    const env = data.envelope(link.id);
    const values = months.map((m) => (m.funded[link.id] ?? 0) - (m.carryIn[link.id] ?? 0));
    return averagePace(values, env?.target ?? 0);
  }
  if (link.type === 'account') {
    const values = months.map((m) =>
      data.ledger.flows.filter((f) => f.accountId === link.id && f.date.startsWith(m.month) && f.amount > 0).reduce((a, f) => a + f.amount, 0),
    );
    const savingsEnv = data.snap.envelopes.find((e) => e.kind === 'epargne');
    const fallback = link.id === data.snap.settings.rules.savings.cushionAccountId ? savingsEnv?.target ?? 0 : 0;
    return averagePace(values, fallback);
  }
  return averagePace(months.map(savedInMonth), data.snap.envelopes.filter((e) => e.kind === 'epargne').reduce((a, e) => a + e.target, 0));
}

function linkKey(link: GoalLink): string {
  return link.type === 'savings' ? 'savings' : `${link.type}:${link.id}`;
}

function parseLink(key: string): GoalLink {
  if (key === 'savings') return { type: 'savings' };
  const [type, id] = key.split(':');
  return type === 'envelope' ? { type: 'envelope', id } : { type: 'account', id };
}

function GoalCard({ p, onEdit }: { p: GoalProgress; onEdit: () => void }) {
  const { goal } = p;
  return (
    <Card as="article">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-serif text-2xl leading-tight text-ink">{goal.name}</h3>
          <p className="mt-1 text-xs text-muted">
            {goal.date ? `Pour ${monthLabel(monthOf(goal.date))}` : 'Sans date cible'}
          </p>
        </div>
        <IconButton icon="edit" label={`Modifier l’objectif ${goal.name}`} className="-mt-2 -mr-3" onClick={onEdit} />
      </div>
      {p.reached && <GoldLine className="mt-3" />}
      <div className="mt-4 flex items-baseline justify-between">
        <p className="font-serif text-3xl text-ink"><Amount cents={p.current} compact animated /></p>
        <p className="text-sm text-muted">sur <Amount cents={goal.target} compact /></p>
      </div>
      <div className="mt-3">
        <ProgressBar value={p.current} max={goal.target} label={`${goal.name} : ${formatPct(p.ratio)}`} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
        {p.reached ? (
          <p className="col-span-2 text-gold">Objectif atteint{goal.achievedAt ? ` le ${new Date(`${goal.achievedAt}T12:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}. Bravo.</p>
        ) : (
          <>
            <div>
              <p className="text-xs text-muted">Au rythme actuel</p>
              <p className="mt-1 text-ink">{p.estimatedMonth ? <span className="capitalize">{monthLabel(p.estimatedMonth)}</span> : 'Pas encore de rythme'}</p>
            </div>
            <div>
              <p className="text-xs text-muted">{goal.date ? 'Pour tenir la date' : 'Reste'}</p>
              <p className={`mt-1 ${p.onTrack === false ? 'text-gold' : 'text-ink'}`}>
                {goal.date && p.requiredMonthly !== undefined ? <><Amount cents={p.requiredMonthly} compact /> / mois</> : <Amount cents={p.remaining} compact />}
              </p>
            </div>
            {p.onTrack === false && (
              <p className="col-span-2 text-xs leading-relaxed text-muted">
                Il faudrait un peu plus que ton rythme actuel. Tu peux ajuster l’objectif mensuel de l’enveloppe, ou décaler la date.
              </p>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

export default function Goals() {
  const data = useData();
  const { toast } = useUI();
  const [editing, setEditing] = useState<Partial<Goal> | null>(null);
  const progress = data.snap.goals
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((g) => goalProgress(g, goalCurrent(g, data.snap, data.ledger, data.today), monthlyPace(data, g), data.today));
  const provisions = provisionsView(data);
  const linkOptions = [
    { key: 'savings', label: 'Toute mon épargne (livrets et placements)' },
    ...data.snap.envelopes.filter((e) => !e.archived && e.kind !== 'depense').map((e) => ({ key: `envelope:${e.id}`, label: `Enveloppe · ${e.name}` })),
    ...data.snap.accounts.filter((a) => !a.archived).map((a) => ({ key: `account:${a.id}`, label: `Compte · ${a.name}` })),
  ];

  return (
    <Page>
      <PageHeader eyebrow="Cap" title="Objectifs" actions={<IconButton icon="plus" label="Nouvel objectif" onClick={() => setEditing({ name: '', target: 0, link: { type: 'savings' } })} />} />

      <button type="button" onClick={() => navigate('/provisions')} className="card mb-6 flex w-full items-center justify-between gap-4 p-5 text-left transition active:scale-[0.99]">
        <div>
          <p className="eyebrow">Provisions</p>
          <p className="mt-2 font-serif text-3xl text-ink"><Amount cents={provisions.reduce((a, p) => a + p.balance, 0)} compact /></p>
          <p className="mt-1 text-xs text-muted">{provisions.map((p) => p.envelope.name.replace('Provision ', '')).join(' · ')}</p>
        </div>
        <span className="text-sm text-gold">Gérer</span>
      </button>

      {progress.length === 0 ? (
        <Card>
          <EmptyState icon="target" title="Aucun objectif" body="Un objectif donne un sens à chaque virement. Crée le premier." action={<Button onClick={() => setEditing({ name: '', target: 0, link: { type: 'savings' } })}>Créer un objectif</Button>} />
        </Card>
      ) : (
        <div className="space-y-4">
          {progress.map((p) => (
            <GoalCard key={p.goal.id} p={p} onEdit={() => setEditing(p.goal)} />
          ))}
        </div>
      )}

      <SectionTitle>Nouveau cap</SectionTitle>
      <Button variant="secondary" full icon="plus" onClick={() => setEditing({ name: '', target: 0, link: { type: 'savings' } })}>Créer un objectif</Button>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? 'Modifier l’objectif' : 'Nouvel objectif'}>
        {editing && (
          <>
            <Field label="Nom" htmlFor="goal-name">
              <TextInput id="goal-name" value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Voyage au Japon" />
            </Field>
            <Field label="Montant cible" htmlFor="goal-target">
              <AmountInput id="goal-target" value={editing.target ?? 0} onChange={(v) => setEditing({ ...editing, target: v ?? 0 })} />
            </Field>
            <Field label="Date cible (facultatif)" htmlFor="goal-date">
              <TextInput id="goal-date" type="date" value={editing.date ?? ''} onChange={(e) => setEditing({ ...editing, date: e.target.value || undefined })} />
            </Field>
            <Field label="Suivi à partir de" htmlFor="goal-link">
              <Select id="goal-link" value={linkKey(editing.link ?? { type: 'savings' })} onChange={(e) => setEditing({ ...editing, link: parseLink(e.target.value) })}>
                {linkOptions.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </Select>
            </Field>
            <div className="mt-2 grid gap-3">
              <Button
                full
                disabled={!editing.name?.trim() || !editing.target}
                onClick={async () => {
                  await saveGoal({ ...(editing as Goal), name: editing.name!.trim(), achievedAt: editing.id ? editing.achievedAt : undefined });
                  setEditing(null);
                  toast('Objectif enregistré.');
                }}
              >
                Enregistrer
              </Button>
              {editing.id && (
                <Button
                  variant="danger"
                  full
                  onClick={async () => {
                    await deleteGoal(editing.id!);
                    setEditing(null);
                    toast('Objectif supprimé.');
                  }}
                >
                  Supprimer
                </Button>
              )}
            </div>
          </>
        )}
      </Sheet>
    </Page>
  );
}
