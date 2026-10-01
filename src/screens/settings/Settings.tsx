import { Reorder, useDragControls } from 'framer-motion';
import { useRef, useState } from 'react';
import {
  archiveEnvelope,
  importBackup,
  reorderEnvelopes,
  resetAll,
  restoreEnvelope,
  saveAccount,
  saveEnvelope,
  saveIncome,
  saveRules,
  uid,
  updateSettings,
} from '../../db/actions';
import { addMonths, addYears, formatDate, monthLabel, monthOf, ofMonth, toISODate } from '../../engine/dates';
import { monthlyReviewIcs } from '../../engine/ics';
import { formatEUR, formatPct } from '../../engine/money';
import { floorOf, LEVEL_LABELS, levelOf } from '../../engine/plan';
import { habitualAmount } from '../../engine/income';
import type { Account, AccountType, Envelope, EnvelopeKind, EnvelopeLevel, ExpectedIncome, Month, Rules } from '../../engine/types';
import { downloadBackup } from '../../state/backup';
import { useData } from '../../state/data';
import { appUrl, downloadFile } from '../../state/files';
import { haptic } from '../../state/haptics';
import { navigate } from '../../state/router';
import { hashPin, verifyPin } from '../../state/security';
import { useUI } from '../../state/ui';
import { Amount } from '../../ui/Amount';
import { AmountInput } from '../../ui/AmountInput';
import { Icon } from '../../ui/Icon';
import { Button, Card, Field, IconButton, Page, PageHeader, Pill, Row, SectionTitle, Segmented, Select, Sheet, TextInput, Toggle } from '../../ui/kit';
import { PinDots, PinPad, usePinEntry } from '../../ui/PinPad';

const LEVEL_HELP =
  'Mois serré : les Flexibles baissent d’abord jusqu’à leur plancher, puis les Importants ; ensuite seulement, sous les planchers. Les Essentiels ne sont jamais réduits.';

const kindLabels: Record<EnvelopeKind, string> = { depense: 'Dépense', provision: 'Provision', epargne: 'Épargne' };
const typeLabels: Record<AccountType, string> = {
  courant: 'Compte courant',
  revolut: 'Revolut',
  livretA: 'Livret A',
  ldds: 'LDDS',
  pea: 'PEA',
  av: 'Assurance-vie',
  cto: 'Compte-titres (CTO)',
};

// ─── Accueil des réglages ─────────────────────────────────────────────

function Index() {
  const { snap, envelopesNow } = useData();
  const s = snap.settings;
  return (
    <Page>
      <PageHeader eyebrow="Tes règles" title="Réglages" />
      <SectionTitle>Budget</SectionTitle>
      <Card className="divide-y divide-line py-0">
        <Row icon="month" title="Enveloppes" subtitle={`${envelopesNow.filter((e) => !e.archived).length} enveloppes · ${formatEUR(envelopesNow.filter((e) => !e.archived).reduce((a, e) => a + e.target, 0), { compact: true })} par mois`} onClick={() => navigate('/reglages/enveloppes')} />
        <Row icon="receipt" title="Revenus attendus" subtitle={snap.incomes.filter((i) => !i.archived).map((i) => i.name).join(', ')} onClick={() => navigate('/reglages/revenus')} />
        <Row icon="transfer" title="Règles" subtitle="Phases d’épargne, surplus, reliquats" onClick={() => navigate('/reglages/regles')} />
        <Row icon="receipt" title="Abonnements" subtitle={`${snap.subscriptions.filter((x) => x.status === 'actif').length} actifs · calendrier des prélèvements`} onClick={() => navigate('/abonnements')} />
        <Row icon="wealth" title="Comptes" subtitle={`${snap.accounts.filter((a) => !a.archived).length} comptes`} onClick={() => navigate('/reglages/comptes')} />
      </Card>
      <SectionTitle>Appli</SectionTitle>
      <Card className="divide-y divide-line py-0">
        <Row icon="shield" title="Apparence et sécurité" subtitle={`Thème ${s.theme === 'dark' ? 'sombre' : 'ivoire'} · code PIN · mode discret`} onClick={() => navigate('/reglages/apparence')} />
        <Row icon="download" title="Données" subtitle={s.lastBackupAt ? `Dernière sauvegarde le ${formatDate(s.lastBackupAt, 'long')}` : 'Jamais sauvegardé'} onClick={() => navigate('/reglages/donnees')} />
        <Row icon="file" title="Import Revolut" subtitle="Relevé CSV, catégorisation automatique" onClick={() => navigate('/import')} />
      </Card>
      <p className="mt-10 text-center text-xs text-faint">Hyppo Patrimoine · données stockées uniquement sur cet appareil</p>
    </Page>
  );
}

// ─── Enveloppes ───────────────────────────────────────────────────────

function EnvelopeItem({ env, onEdit, onDragEnd }: { env: Envelope; onEdit: () => void; onDragEnd: () => void }) {
  const controls = useDragControls();
  const { accountName } = useData();
  return (
    <Reorder.Item as="div" value={env.id} dragListener={false} dragControls={controls} onDragEnd={onDragEnd} className="relative flex items-center gap-2 border-b border-line bg-surface py-1 last:border-0" whileDrag={{ scale: 1.02, zIndex: 2 }}>
      <button
        type="button"
        aria-label={`Déplacer ${env.name}`}
        className="flex h-11 w-9 shrink-0 cursor-grab touch-none items-center justify-center text-faint active:cursor-grabbing"
        onPointerDown={(e) => controls.start(e)}
      >
        <Icon name="grip" size={20} strokeWidth={2.4} />
      </button>
      <button type="button" onClick={onEdit} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.9375rem] text-ink">{env.name}</span>
          <span className="block text-xs text-muted">
            {LEVEL_LABELS[levelOf(env)]} · {kindLabels[env.kind]} · {env.auto ? 'compte de chaque abonnement' : env.accountId ? accountName(env.accountId) : 'selon les phases'}
            {env.pocket && ` · pocket « ${env.pocket} »`}
          </span>
        </span>
        <Amount cents={env.target} compact className="text-ink" />
        <Icon name="chevronRight" size={16} className="text-faint" />
      </button>
    </Reorder.Item>
  );
}

function EnvelopeEditor({ env, onClose }: { env: Envelope; onClose: () => void }) {
  const { snap } = useData();
  const { toast } = useUI();
  const [draft, setDraft] = useState(env);
  const isNew = !snap.envelopes.some((e) => e.id === env.id);
  return (
    <>
      <Field label="Nom" htmlFor="env-name">
        <TextInput id="env-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </Field>
      <Field label="Type" htmlFor="env-kind" hint={draft.kind === 'depense' ? 'Repart à zéro chaque mois ; le reliquat part en épargne ou est reporté.' : draft.kind === 'provision' ? 'Cumule un solde d’un mois sur l’autre.' : 'Suit les règles de phase si aucun compte n’est choisi.'}>
        <Select id="env-kind" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as EnvelopeKind })}>
          <option value="depense">Dépense</option>
          <option value="provision">Provision</option>
          <option value="epargne">Épargne</option>
        </Select>
      </Field>
      {draft.auto === 'subscriptions' ? (
        <div className="mb-4 rounded-xl border border-gold/30 bg-gold-soft p-4 text-sm leading-relaxed text-ink">
          Objectif calculé automatiquement : la somme des équivalents mensuels de tes abonnements actifs, arrondie à l’euro supérieur (
          {formatEUR(draft.target, { compact: true })} ce mois-ci). L’argent est versé sur le compte réellement débité par chaque abonnement.
          <button type="button" className="mt-2 block min-h-11 text-gold" onClick={() => navigate('/abonnements')}>Gérer mes abonnements</button>
        </div>
      ) : (
        <>
      <Field label="Objectif mensuel" htmlFor="env-target">
        <AmountInput id="env-target" value={draft.target} onChange={(v) => setDraft({ ...draft, target: v ?? 0 })} />
      </Field>
      <Field label="Compte de destination" htmlFor="env-account">
        <Select id="env-account" value={draft.accountId ?? ''} onChange={(e) => setDraft({ ...draft, accountId: e.target.value || null })}>
          {draft.kind === 'epargne' && <option value="">Selon les règles de phase</option>}
          {snap.accounts.filter((a) => !a.archived).map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </Select>
      </Field>
        </>
      )}
      {draft.accountId && snap.accounts.find((a) => a.id === draft.accountId)?.type === 'revolut' && (
        <Field label="Pocket Revolut (facultatif)" htmlFor="env-pocket">
          <TextInput id="env-pocket" value={draft.pocket ?? ''} onChange={(e) => setDraft({ ...draft, pocket: e.target.value || undefined })} />
        </Field>
      )}
      {draft.kind === 'provision' && (
        <>
          <Field label="Solde de départ" htmlFor="env-opening">
            <AmountInput id="env-opening" value={draft.openingBalance ?? 0} onChange={(v) => setDraft({ ...draft, openingBalance: v ?? 0 })} />
          </Field>
          <Field label="Compte crédité lors d’une utilisation" htmlFor="env-spend">
            <Select id="env-spend" value={draft.spendAccountId ?? snap.accounts.find((a) => a.type === 'revolut')?.id ?? snap.accounts[0]?.id} onChange={(e) => setDraft({ ...draft, spendAccountId: e.target.value })}>
              {snap.accounts.filter((a) => !a.archived).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>
        </>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Niveau" htmlFor="env-level">
          <Select id="env-level" value={levelOf(draft)} onChange={(e) => setDraft({ ...draft, level: e.target.value as EnvelopeLevel })}>
            {(Object.keys(LEVEL_LABELS) as EnvelopeLevel[]).map((l) => (
              <option key={l} value={l}>{LEVEL_LABELS[l]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Plancher" htmlFor="env-floor">
          <AmountInput id="env-floor" value={levelOf(draft) === 'essentiel' ? null : floorOf(draft)} allowEmpty placeholder={levelOf(draft) === 'essentiel' ? '—' : '0'} onChange={(v) => setDraft({ ...draft, floor: v ?? 0 })} />
        </Field>
      </div>
      <p className="-mt-2 mb-4 text-xs leading-relaxed text-muted">{LEVEL_HELP}</p>
      <Field label="Détail (facultatif)" htmlFor="env-detail">
        <TextInput id="env-detail" value={draft.detail ?? ''} onChange={(e) => setDraft({ ...draft, detail: e.target.value || undefined })} placeholder="Nourriture 350 € + hygiène 50 €" />
      </Field>
      <div className="grid gap-3">
        <Button
          full
          disabled={!draft.name.trim() || (draft.kind !== 'epargne' && !draft.accountId)}
          onClick={async () => {
            await saveEnvelope({ ...draft, name: draft.name.trim(), accountId: draft.kind !== 'epargne' && !draft.accountId ? snap.accounts[0].id : draft.accountId });
            toast('Enveloppe enregistrée. Le mois en cours est recalculé.');
            onClose();
          }}
        >
          Enregistrer
        </Button>
        {!isNew && (
          <Button
            variant="danger"
            full
            onClick={async () => {
              try {
                await archiveEnvelope(env.id);
                toast('Enveloppe archivée. L’historique est conservé.');
                onClose();
              } catch (e) {
                toast(e instanceof Error ? e.message : 'Impossible d’archiver.');
              }
            }}
          >
            Archiver
          </Button>
        )}
      </div>
    </>
  );
}

function Envelopes() {
  const { snap, envelopesNow } = useData();
  const active = envelopesNow.filter((e) => !e.archived).sort((a, b) => a.priority - b.priority);
  const archived = snap.envelopes.filter((e) => e.archived);
  const [order, setOrder] = useState(active.map((e) => e.id));
  const [editing, setEditing] = useState<Envelope | null>(null);
  const ids = order.filter((id) => active.some((e) => e.id === id)).concat(active.filter((e) => !order.includes(e.id)).map((e) => e.id));
  const latest = useRef(ids);
  latest.current = ids;
  const commit = () => {
    if (latest.current.join() !== active.map((e) => e.id).join()) {
      haptic();
      reorderEnvelopes(latest.current);
    }
  };
  const total = active.reduce((a, e) => a + e.target, 0);
  return (
    <Page>
      <PageHeader eyebrow="Réglages" title="Enveloppes" back backTo="/reglages" />
      <p className="mb-4 px-1 text-sm leading-relaxed text-muted">L’ordre est la priorité : chaque encaissement remplit les enveloppes de haut en bas. Glisse la poignée pour réordonner.</p>
      <Card className="px-3 py-1">
        <Reorder.Group
          axis="y"
          values={ids}
          onReorder={setOrder}
          as="div"
        >
          {ids.map((id) => {
            const env = active.find((e) => e.id === id)!;
            return <EnvelopeItem key={id} env={env} onEdit={() => setEditing(env)} onDragEnd={commit} />;
          })}
        </Reorder.Group>
      </Card>
      <div className="mt-3 flex justify-between px-1 text-sm">
        <span className="text-muted">Total mensuel</span>
        <Amount cents={total} compact className="text-gold" />
      </div>
      <div className="mt-6">
        <Button
          variant="secondary"
          full
          icon="plus"
          onClick={() => setEditing({ id: uid(), name: '', kind: 'depense', accountId: snap.accounts[0]?.id ?? null, target: 0, priority: active.length + 1 })}
        >
          Nouvelle enveloppe
        </Button>
      </div>
      {archived.length > 0 && (
        <>
          <SectionTitle>Archivées</SectionTitle>
          <Card className="divide-y divide-line py-0">
            {archived.map((e) => (
              <Row key={e.id} title={e.name} subtitle={kindLabels[e.kind]} right={<button type="button" className="min-h-11 text-sm text-gold" onClick={() => restoreEnvelope(e.id)}>Restaurer</button>} />
            ))}
          </Card>
        </>
      )}
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing?.name || 'Nouvelle enveloppe'}>
        {editing && <EnvelopeEditor key={editing.id} env={editing} onClose={() => setEditing(null)} />}
      </Sheet>
    </Page>
  );
}

// ─── Comptes ──────────────────────────────────────────────────────────

function Accounts() {
  const { snap } = useData();
  const { toast } = useUI();
  const [editing, setEditing] = useState<Account | null>(null);
  const list = snap.accounts.filter((a) => !a.archived).sort((a, b) => a.order - b.order);
  return (
    <Page>
      <PageHeader eyebrow="Réglages" title="Comptes" back backTo="/reglages" />
      <Card className="divide-y divide-line py-0">
        {list.map((a) => (
          <Row
            key={a.id}
            title={a.name}
            subtitle={[
              typeLabels[a.type],
              a.openedAt && `ouvert le ${formatDate(a.openedAt, 'long')}`,
              a.type === 'pea' && a.openedAt && `mûr le ${formatDate(addYears(a.openedAt, 5), 'long')}`,
              a.type === 'av' && (a.openedAt ? `8 ans le ${formatDate(addYears(a.openedAt, 8), 'long')}` : 'date d’ouverture à saisir'),
              a.ceiling && `plafond ${formatEUR(a.ceiling, { compact: true })}`,
            ].filter(Boolean).join(' · ')}
            onClick={() => setEditing(a)}
          />
        ))}
      </Card>
      <div className="mt-6">
        <Button variant="secondary" full icon="plus" onClick={() => setEditing({ id: uid(), name: '', type: 'courant', order: snap.accounts.length })}>Nouveau compte</Button>
      </div>
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing?.name || 'Nouveau compte'}>
        {editing && (
          <>
            <Field label="Nom" htmlFor="acc-name">
              <TextInput id="acc-name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <Field label="Type" htmlFor="acc-type">
              <Select id="acc-type" value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value as AccountType })}>
                {Object.entries(typeLabels).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </Select>
            </Field>
            <Field label="Date d’ouverture" htmlFor="acc-open" hint={editing.type === 'av' ? 'L’appli calcule la date des 8 ans.' : editing.type === 'pea' ? 'L’appli calcule la date des 5 ans.' : undefined}>
              <TextInput id="acc-open" type="date" value={editing.openedAt ?? ''} onChange={(e) => setEditing({ ...editing, openedAt: e.target.value || undefined })} />
            </Field>
            {(editing.type === 'livretA' || editing.type === 'ldds') && (
              <Field label="Plafond" htmlFor="acc-ceiling">
                <AmountInput id="acc-ceiling" value={editing.ceiling ?? null} allowEmpty onChange={(v) => setEditing({ ...editing, ceiling: v ?? undefined })} />
              </Field>
            )}
            {editing.type === 'pea' && (
              <Field label="Plafond de versements" htmlFor="acc-dceiling">
                <AmountInput id="acc-dceiling" value={editing.depositCeiling ?? null} allowEmpty onChange={(v) => setEditing({ ...editing, depositCeiling: v ?? undefined })} />
              </Field>
            )}
            <div className="grid gap-3">
              <Button
                full
                disabled={!editing.name.trim()}
                onClick={async () => {
                  await saveAccount({ ...editing, name: editing.name.trim() });
                  toast('Compte enregistré.');
                  setEditing(null);
                }}
              >
                Enregistrer
              </Button>
              {snap.accounts.some((a) => a.id === editing.id) && (
                <Button
                  variant="danger"
                  full
                  onClick={async () => {
                    const used = snap.envelopes.some((e) => !e.archived && e.accountId === editing.id) || snap.settings.rules.savings.cushionAccountId === editing.id;
                    if (used) return toast('Ce compte est utilisé par une enveloppe ou une règle.');
                    await saveAccount({ ...editing, archived: true });
                    setEditing(null);
                  }}
                >
                  Archiver
                </Button>
              )}
            </div>
          </>
        )}
      </Sheet>
    </Page>
  );
}

// ─── Revenus attendus ─────────────────────────────────────────────────

function Incomes() {
  const { snap, accountName, today } = useData();
  const { toast } = useUI();
  const [editing, setEditing] = useState<ExpectedIncome | null>(null);
  const currentMonth: Month = monthOf(today);
  const [fromMonth, setFromMonth] = useState<Month>(currentMonth);
  const stored = editing ? snap.incomes.find((i) => i.id === editing.id) : undefined;
  const original = stored ? { ...stored, amount: stored.amount === null ? null : habitualAmount(stored, currentMonth) } : undefined;
  const list = snap.incomes.filter((i) => !i.archived);
  return (
    <Page>
      <PageHeader eyebrow="Réglages" title="Revenus attendus" back backTo="/reglages" />
      <p className="mb-4 px-1 text-sm leading-relaxed text-muted">Ils servent à calculer le reste à recevoir, à repérer les retards et à suggérer la source quand tu saisis un encaissement.</p>
      <Card className="divide-y divide-line py-0">
        {list.map((i) => (
          <Row
            key={i.id}
            title={i.name}
            subtitle={[
              i.amount === null ? 'Montant libre' : `${formatEUR(habitualAmount(i, currentMonth) ?? 0, { compact: true })} par mois`,
              i.installments > 1 && `${i.installments} versements`,
              i.windowStart !== undefined && `du ${i.windowStart} au ${i.windowEnd}`,
              `sur ${accountName(i.accountId)}`,
            ].filter(Boolean).join(' · ')}
            onClick={() => { setEditing({ ...i, amount: i.amount === null ? null : habitualAmount(i, currentMonth) }); setFromMonth(currentMonth); }}
          />
        ))}
      </Card>
      <div className="mt-6">
        <Button variant="secondary" full icon="plus" onClick={() => setEditing({ id: uid(), name: '', amount: null, installments: 1, accountId: snap.accounts[0].id })}>Nouveau revenu</Button>
      </div>
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing?.name || 'Nouveau revenu'}>
        {editing && (
          <>
            <Field label="Nom" htmlFor="inc-name">
              <TextInput id="inc-name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <Toggle checked={editing.amount !== null} onChange={(v) => setEditing({ ...editing, amount: v ? 0 : null })} label="Montant attendu" description="Désactive pour un revenu imprévisible (commissions)." />
            {editing.amount !== null && (
              <>
                <Field label="Montant mensuel habituel" htmlFor="inc-amount">
                  <AmountInput id="inc-amount" value={editing.amount} onChange={(v) => setEditing({ ...editing, amount: v ?? 0 })} />
                </Field>
                {original && original.amount !== null && editing.amount !== original.amount && (
                  <Field label="À partir de" htmlFor="inc-from" hint="Les mois précédents gardent leur montant. Pour un seul mois, passe plutôt par Prévisions.">
                    <Select id="inc-from" value={fromMonth} onChange={(e) => setFromMonth(e.target.value)}>
                      {Array.from({ length: 13 }, (_, k) => addMonths(currentMonth, k)).map((m) => (
                        <option key={m} value={m}>{m === currentMonth ? `Ce mois-ci (${monthLabel(m)})` : monthLabel(m)}</option>
                      ))}
                    </Select>
                  </Field>
                )}
                {(editing.schedule?.length ?? 0) > 1 && (
                  <p className="-mt-2 mb-4 text-xs leading-relaxed text-muted">
                    Historique : {editing.schedule!.filter((e) => e.from > '1900-01').map((e) => `${formatEUR(e.amount, { compact: true })} dès ${monthLabel(e.from)}`).join(' · ') || 'aucun changement'}
                  </p>
                )}
                <Field label="Nombre de versements par mois" htmlFor="inc-inst">
                  <Select id="inc-inst" value={editing.installments} onChange={(e) => setEditing({ ...editing, installments: Number(e.target.value) })}>
                    {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                  </Select>
                </Field>
                <Toggle
                  checked={editing.windowStart !== undefined}
                  onChange={(v) => setEditing({ ...editing, windowStart: v ? 25 : undefined, windowEnd: v ? 5 : undefined })}
                  label="Fenêtre de dates habituelle"
                  description="Au-delà, le revenu est signalé en retard."
                />
                {editing.windowStart !== undefined && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Du" htmlFor="inc-ws">
                      <TextInput id="inc-ws" type="number" inputMode="numeric" min={1} max={31} value={editing.windowStart} onChange={(e) => setEditing({ ...editing, windowStart: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })} />
                    </Field>
                    <Field label="Au" htmlFor="inc-we">
                      <TextInput id="inc-we" type="number" inputMode="numeric" min={1} max={31} value={editing.windowEnd} onChange={(e) => setEditing({ ...editing, windowEnd: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })} />
                    </Field>
                  </div>
                )}
              </>
            )}
            <Field label="Arrive sur" htmlFor="inc-acc">
              <Select id="inc-acc" value={editing.accountId} onChange={(e) => setEditing({ ...editing, accountId: e.target.value })}>
                {snap.accounts.filter((a) => !a.archived).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
            <div className="grid gap-3">
              <Button full disabled={!editing.name.trim()} onClick={async () => { await saveIncome({ ...editing, name: editing.name.trim() }, fromMonth); toast(original && editing.amount !== original.amount ? `Montant appliqué à partir ${ofMonth(fromMonth)}. Le plan est recalculé.` : 'Revenu enregistré.'); setEditing(null); }}>Enregistrer</Button>
              {snap.incomes.some((i) => i.id === editing.id) && (
                <Button variant="danger" full onClick={async () => { await saveIncome({ ...editing, archived: true }); setEditing(null); }}>Archiver</Button>
              )}
            </div>
          </>
        )}
      </Sheet>
    </Page>
  );
}

// ─── Règles ───────────────────────────────────────────────────────────

function RulesScreen() {
  const { snap, accountName, envelopeName } = useData();
  const { toast } = useUI();
  const [rules, setRules] = useState<Rules>(structuredClone(snap.settings.rules));
  const envelopes = snap.envelopes.filter((e) => !e.archived);
  const investAccounts = snap.accounts.filter((a) => !a.archived && a.type !== 'courant' && a.type !== 'revolut');
  const surplusTotal = rules.surplus.reduce((a, r) => a + r.pct, 0);
  const weightsTotal = rules.savings.phase2.reduce((a, p) => a + p.weight, 0);
  const setWeight = (accountId: string, euros: number) => {
    const others = rules.savings.phase2.filter((p) => p.accountId !== accountId);
    setRules({ ...rules, savings: { ...rules.savings, phase2: euros > 0 ? [...others, { accountId, weight: euros }] : others } });
  };
  return (
    <Page>
      <PageHeader eyebrow="Réglages" title="Règles" back backTo="/reglages" />

      <SectionTitle>Épargne · phase 1</SectionTitle>
      <Card>
        <p className="mb-4 text-sm leading-relaxed text-muted">Tant que le matelas est sous la cible, toute l’épargne y va.</p>
        <Field label="Compte matelas" htmlFor="cushion-acc">
          <Select id="cushion-acc" value={rules.savings.cushionAccountId} onChange={(e) => setRules({ ...rules, savings: { ...rules.savings, cushionAccountId: e.target.value } })}>
            {investAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Field label="Matelas cible" htmlFor="cushion-target">
          <AmountInput id="cushion-target" value={rules.savings.cushionTarget} onChange={(v) => setRules({ ...rules, savings: { ...rules.savings, cushionTarget: v ?? 0 } })} />
        </Field>
      </Card>

      <SectionTitle>Épargne · phase 2</SectionTitle>
      <Card>
        <p className="mb-4 text-sm leading-relaxed text-muted">Une fois le matelas plein, répartition au prorata de ces montants de référence.</p>
        {investAccounts.filter((a) => a.id !== rules.savings.cushionAccountId).map((a) => {
          const w = rules.savings.phase2.find((p) => p.accountId === a.id)?.weight ?? 0;
          return (
            <Field key={a.id} label={`${a.name}${weightsTotal > 0 && w > 0 ? ` · ${formatPct(w / weightsTotal)}` : ''}`} htmlFor={`w-${a.id}`}>
              <AmountInput id={`w-${a.id}`} value={w * 100} onChange={(v) => setWeight(a.id, Math.round((v ?? 0) / 100))} />
            </Field>
          );
        })}
      </Card>

      <SectionTitle>Surplus</SectionTitle>
      <Card>
        <p className="mb-4 text-sm leading-relaxed text-muted">Quand toutes les enveloppes du mois sont remplies, le reste est partagé ainsi.</p>
        {rules.surplus.map((r, i) => (
          <div key={i} className="mb-3 grid grid-cols-[1fr_6.5rem_auto] items-center gap-2">
            <Select aria-label="Enveloppe" value={r.envelopeId} onChange={(e) => setRules({ ...rules, surplus: rules.surplus.map((x, j) => (j === i ? { ...x, envelopeId: e.target.value } : x)) })}>
              {envelopes.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
            <div className="relative">
              <TextInput aria-label={`Pourcentage pour ${envelopeName(r.envelopeId)}`} type="number" inputMode="numeric" min={0} max={100} value={r.pct} onChange={(e) => setRules({ ...rules, surplus: rules.surplus.map((x, j) => (j === i ? { ...x, pct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) } : x)) })} className="pr-8 text-right" />
              <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-muted">%</span>
            </div>
            <IconButton icon="x" label="Retirer" onClick={() => setRules({ ...rules, surplus: rules.surplus.filter((_, j) => j !== i) })} />
          </div>
        ))}
        <div className="flex items-center justify-between">
          <button type="button" className="min-h-11 text-sm text-gold" onClick={() => setRules({ ...rules, surplus: [...rules.surplus, { envelopeId: envelopes[0].id, pct: 0 }] })}>Ajouter une ligne</button>
          <Pill tone={surplusTotal === 100 ? 'positive' : 'negative'}>Total {surplusTotal} %</Pill>
        </div>
      </Card>

      <SectionTitle>Reliquats</SectionTitle>
      <Card>
        <Field label="Destination des reliquats non reportés" htmlFor="leftover" hint="Lors de la revue, tu peux reporter chaque reliquat au mois suivant.">
          <Select id="leftover" value={rules.leftoverEnvelopeId} onChange={(e) => setRules({ ...rules, leftoverEnvelopeId: e.target.value })}>
            {envelopes.filter((e) => e.kind !== 'depense').map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </Field>
      </Card>

      <p className="mt-6 px-1 text-xs leading-relaxed text-faint">
        Les changements s’appliquent au mois en cours et aux suivants ; les mois passés gardent leurs règles. Matelas : {accountName(rules.savings.cushionAccountId)}.
      </p>
      <div className="mt-4">
        <Button
          full
          disabled={surplusTotal !== 100}
          onClick={async () => {
            await saveRules(rules);
            haptic('success');
            toast('Règles enregistrées.');
          }}
        >
          Enregistrer les règles
        </Button>
      </div>
    </Page>
  );
}

// ─── Apparence et sécurité ────────────────────────────────────────────

function ChangePin({ onDone }: { onDone: () => void }) {
  const { snap } = useData();
  const { toast } = useUI();
  const [stage, setStage] = useState<'current' | 'new' | 'confirm'>('current');
  const [error, setError] = useState(false);
  const state = useRef<{ stage: 'current' | 'new' | 'confirm'; fresh: string }>({ stage: 'current', fresh: '' });
  const go = (next: 'current' | 'new' | 'confirm') => {
    state.current.stage = next;
    setStage(next);
  };
  const entry = usePinEntry(async (pin) => {
    const st = state.current;
    if (st.stage === 'current') {
      const ok = await verifyPin(pin, snap.settings.pinHash!, snap.settings.pinSalt!);
      if (ok) go('new');
      else {
        setError(true);
        await new Promise((r) => setTimeout(r, 400));
      }
    } else if (st.stage === 'new') {
      st.fresh = pin;
      go('confirm');
    } else if (pin === st.fresh) {
      const { hash, salt } = await hashPin(pin);
      await updateSettings({ pinHash: hash, pinSalt: salt });
      haptic('success');
      toast('Nouveau code enregistré.');
      onDone();
    } else {
      setError(true);
      go('new');
      await new Promise((r) => setTimeout(r, 400));
    }
    entry.reset();
  });
  return (
    <div className="pb-2 text-center">
      <p className="mb-5 text-sm text-muted" role="status">
        {error ? 'Ça ne correspond pas. Réessaie.' : stage === 'current' ? 'Code actuel' : stage === 'new' ? 'Nouveau code' : 'Confirme le nouveau code'}
      </p>
      <PinDots length={entry.length} error={error} />
      <div className="mt-8">
        <PinPad onDigit={(d) => { setError(false); entry.push(d); }} onBack={entry.pop} />
      </div>
    </div>
  );
}

function Appearance() {
  const { snap } = useData();
  const { discreet, toggleDiscreet, toast } = useUI();
  const [pinSheet, setPinSheet] = useState(false);
  const s = snap.settings;
  return (
    <Page>
      <PageHeader eyebrow="Réglages" title="Apparence" back backTo="/reglages" />
      <SectionTitle>Thème</SectionTitle>
      <Segmented label="Thème" value={s.theme} onChange={(theme) => updateSettings({ theme })} options={[{ value: 'dark', label: 'Sombre' }, { value: 'ivory', label: 'Ivoire' }]} />

      <SectionTitle>Discrétion</SectionTitle>
      <Card className="py-2">
        <Toggle checked={discreet} onChange={toggleDiscreet} label="Mode discret" description="Floute tous les montants. Raccourci : appui à deux doigts n’importe où, ou l’œil en haut de chaque écran." />
      </Card>

      <SectionTitle>Sécurité</SectionTitle>
      <Card className="divide-y divide-line py-0">
        <Row icon="lock" title="Changer le code PIN" subtitle="Demandé à l’ouverture et après une minute en arrière-plan" onClick={() => setPinSheet(true)} />
      </Card>

      <SectionTitle>Rappel de revue</SectionTitle>
      <Card>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Jour du mois" htmlFor="rem-day">
            <Select id="rem-day" value={s.reminderDay} onChange={(e) => updateSettings({ reminderDay: Number(e.target.value) })}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
          </Field>
          <Field label="Heure" htmlFor="rem-hour">
            <Select id="rem-hour" value={s.reminderHour} onChange={(e) => updateSettings({ reminderHour: Number(e.target.value) })}>
              {Array.from({ length: 24 }, (_, i) => i).map((h) => <option key={h} value={h}>{h} h</option>)}
            </Select>
          </Field>
        </div>
        <Button
          variant="secondary"
          full
          icon="calendarPlus"
          onClick={() => {
            const next = addMonths(monthOf(toISODate(new Date())), 1);
            downloadFile('revue-mensuelle.ics', monthlyReviewIcs({ firstDate: `${next}-${String(s.reminderDay).padStart(2, '0')}`, day: s.reminderDay, hour: s.reminderHour, minute: 0, url: appUrl() }), 'text/calendar');
            toast('Rappel exporté.');
          }}
        >
          Exporter vers mon calendrier
        </Button>
      </Card>

      <Sheet open={pinSheet} onClose={() => setPinSheet(false)} title="Code PIN">
        {pinSheet && <ChangePin onDone={() => setPinSheet(false)} />}
      </Sheet>
    </Page>
  );
}

// ─── Données ──────────────────────────────────────────────────────────

function DataScreen() {
  const { snap } = useData();
  const { toast } = useUI();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<unknown>(null);
  const [reset, setReset] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const last = snap.settings.lastBackupAt;
  return (
    <Page>
      <PageHeader eyebrow="Réglages" title="Données" back backTo="/reglages" />
      <Card>
        <p className="eyebrow">Sauvegarde</p>
        <p className="mt-2 font-serif text-2xl text-ink">{last ? `Le ${formatDate(last, 'long')}` : 'Jamais sauvegardé'}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">Tes données ne vivent que sur cet appareil. Exporte un fichier JSON et range-le dans iCloud Drive ou Fichiers, au moins une fois par mois.</p>
        <div className="mt-5 grid gap-3">
          <Button full icon="download" onClick={async () => { await downloadBackup(); haptic('success'); toast('Sauvegarde téléchargée.'); }}>Exporter mes données</Button>
          <Button variant="secondary" full icon="upload" onClick={() => input.current?.click()}>Importer une sauvegarde</Button>
        </div>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label="Fichier de sauvegarde"
          onChange={async (e) => {
            setError(null);
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              setPending(JSON.parse(await file.text()));
            } catch {
              setError('Ce fichier n’est pas un JSON valide.');
            }
          }}
        />
        {error && <p className="mt-3 text-sm text-negative" role="alert">{error}</p>}
      </Card>

      <SectionTitle>Zone sensible</SectionTitle>
      <Card>
        <p className="text-sm leading-relaxed text-muted">Réinitialiser efface tout et restaure la configuration par défaut. Pense à exporter avant.</p>
        <div className="mt-4">
          <Button variant="danger" full icon="trash" onClick={() => setReset(true)}>Réinitialiser l’appli</Button>
        </div>
      </Card>

      <Sheet open={pending !== null} onClose={() => setPending(null)} title="Restaurer ?">
        <p className="mb-6 text-sm leading-relaxed text-muted">Les données actuelles seront remplacées par celles de la sauvegarde, code PIN compris.</p>
        <div className="grid gap-3">
          <Button
            full
            onClick={async () => {
              try {
                await importBackup(pending);
                setPending(null);
                haptic('success');
                toast('Sauvegarde restaurée.');
                navigate('/', { replace: true });
              } catch (e) {
                setPending(null);
                setError(e instanceof Error ? e.message : 'Import impossible.');
              }
            }}
          >
            Remplacer mes données
          </Button>
          <Button variant="secondary" full onClick={() => setPending(null)}>Annuler</Button>
        </div>
      </Sheet>

      <Sheet open={reset} onClose={() => setReset(false)} title="Tout effacer ?">
        <p className="mb-6 text-sm leading-relaxed text-muted">Encaissements, revues, objectifs et réglages seront supprimés de cet appareil. Cette action est définitive.</p>
        <div className="grid gap-3">
          <Button variant="danger" full onClick={async () => { await resetAll(); window.location.hash = '/'; window.location.reload(); }}>Oui, tout effacer</Button>
          <Button variant="secondary" full onClick={() => setReset(false)}>Annuler</Button>
        </div>
      </Sheet>
    </Page>
  );
}

export default function Settings({ section }: { section?: string }) {
  switch (section) {
    case 'enveloppes':
      return <Envelopes />;
    case 'comptes':
      return <Accounts />;
    case 'revenus':
      return <Incomes />;
    case 'regles':
      return <RulesScreen />;
    case 'apparence':
      return <Appearance />;
    case 'donnees':
      return <DataScreen />;
    default:
      return <Index />;
  }
}
