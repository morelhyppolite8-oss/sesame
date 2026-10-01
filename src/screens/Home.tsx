import { motion } from 'framer-motion';
import { applyIncomeRise, boostFromCushion, dismissAlert, setTransferDone, updateSettings } from '../db/actions';
import { monthLabel, monthOf, parseISODate } from '../engine/dates';
import type { Alert } from '../engine/health';
import type { IncomeRise } from '../engine/income';
import { formatEUR, formatPct } from '../engine/money';
import { downloadBackup } from '../state/backup';
import { useData } from '../state/data';
import { haptic } from '../state/haptics';
import { navigate } from '../state/router';
import { alertsView, cushionView, healthView, monthView, pendingTransfers } from '../state/selectors';
import { useUI } from '../state/ui';
import { Amount } from '../ui/Amount';
import { Icon, type IconName } from '../ui/Icon';
import { Button, Card, CheckCircle, GoldLine, IconButton, Page, PageHeader, ProgressBar, Ring, SectionTitle } from '../ui/kit';
import { SubscriptionIcon } from '../ui/SubscriptionIcon';
import { TransferLabel } from '../ui/TransferLabel';
import { annualCost, countdown, monthlyEquivalent, upcomingCharges } from '../engine/subscriptions';

const ease = [0.22, 1, 0.36, 1] as const;

function greeting(): string {
  const h = new Date().getHours();
  return h < 5 || h >= 18 ? 'Bonsoir' : 'Bonjour';
}

function AlertCard({ alert }: { alert: Alert }) {
  const { toast } = useUI();
  const run = async () => {
    const a = alert.action;
    if (!a) return;
    if (a.route) return navigate(a.route);
    if (a.command === 'celebrate-cushion') await updateSettings({ cushionCelebrated: true });
    if (a.command === 'apply-rise') {
      await applyIncomeRise(a.payload as IncomeRise);
      toast('C’est noté : la hausse part en épargne.');
    }
    if (a.command === 'cushion-boost') {
      const { month, amount } = a.payload as { month: string; amount: number };
      const id = await boostFromCushion(month, amount);
      toast('Renfort du matelas enregistré.');
      return navigate(`/repartition/${id}`);
    }
    if (a.command === 'export') {
      await downloadBackup();
      toast('Sauvegarde téléchargée.');
    }
  };
  const celebration = alert.level === 'celebration';
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease }}
      className={`card relative overflow-hidden p-5 ${celebration ? 'border-gold/40' : ''}`}
    >
      {celebration && <GoldLine className="mb-3" />}
      <div className="flex items-start gap-3">
        {!celebration && (
          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${alert.level === 'attention' ? 'border-negative/40 text-negative' : 'border-gold/40 text-gold'}`}>
            <Icon name={alert.level === 'attention' ? 'bell' : 'info'} size={16} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className={`${celebration ? 'font-serif text-2xl text-gold' : 'text-[0.9375rem] font-medium text-ink'}`}>{alert.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted">{alert.body}</p>
          {alert.action && (
            <button type="button" onClick={run} className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-gold">
              {alert.action.label}
              <Icon name="arrowRight" size={15} />
            </button>
          )}
        </div>
        {alert.dismissible && <IconButton icon="x" label="Masquer cette alerte" className="-mt-2 -mr-3" onClick={() => dismissAlert(alert.id)} />}
      </div>
    </motion.article>
  );
}

function Quick({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="card flex min-h-24 flex-col items-start justify-between gap-3 p-4 text-left transition active:scale-[0.98]">
      <Icon name={icon} size={20} className="text-gold" />
      <span className="text-[0.8125rem] leading-snug text-ink">{label}</span>
    </button>
  );
}

export function Home() {
  const data = useData();
  const month = monthOf(data.today);
  const view = monthView(data, month);
  const pending = pendingTransfers(data);
  const pendingTotal = pending.reduce((a, t) => a + t.amount, 0);
  const cushion = cushionView(data);
  const health = healthView(data);
  const alerts = alertsView(data);
  const dateLabel = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(parseISODate(data.today));
  const expected = view.summary.expected;
  const upcoming = upcomingCharges(data.snap.subscriptions, data.today, 30);
  const activeSubs = data.snap.subscriptions.filter((s) => s.status === 'actif');
  const subsMonthly = activeSubs.reduce((a, s) => a + monthlyEquivalent(s), 0);
  const subsYearly = activeSubs.reduce((a, s) => a + annualCost(s), 0);
  const receivedExpected = Math.max(0, expected - view.summary.remaining);

  return (
    <Page>
      <PageHeader eyebrow={dateLabel} title={greeting()} />

      <Card className="relative overflow-hidden">
        <p className="eyebrow">Reste à recevoir · {monthLabel(month, false)}</p>
        <p className="mt-3 font-serif text-[3.25rem] leading-none text-ink">
          <Amount cents={view.summary.remaining} compact animated />
        </p>
        <div className="mt-5">
          <ProgressBar value={receivedExpected} max={expected} label="Revenus attendus reçus" />
        </div>
        <p className="mt-3 text-sm text-muted">
          {view.summary.remaining === 0 && expected > 0 ? (
            'Tout ce qui était attendu est arrivé.'
          ) : (
            <>
              <Amount cents={view.summary.received} compact className="text-ink" /> reçus ce mois-ci, sur <Amount cents={expected} compact /> attendus.
            </>
          )}
        </p>
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <button type="button" onClick={() => navigate('/virements')} className="card p-5 text-left transition active:scale-[0.98]">
          <p className="eyebrow">Virements</p>
          <p className="mt-3 font-serif text-4xl text-ink">{pending.length}</p>
          <p className="mt-1 text-sm text-muted">
            {pending.length === 0 ? 'Rien en attente' : <>en attente · <Amount cents={pendingTotal} compact /></>}
          </p>
        </button>
        <button type="button" onClick={() => navigate('/objectifs')} className="card p-5 text-left transition active:scale-[0.98]">
          <p className="eyebrow">{cushion.phase === 1 ? 'Matelas' : 'Épargne du mois'}</p>
          {cushion.phase === 1 ? (
            <>
              <p className="mt-3 font-serif text-4xl text-ink">{formatPct(cushion.target > 0 ? cushion.balance / cushion.target : 0)}</p>
              <div className="mt-2.5">
                <ProgressBar value={cushion.balance} max={cushion.target} label="Progression du matelas" height={3} />
              </div>
              <p className="mt-2 text-sm text-muted">
                <Amount cents={cushion.balance} compact /> / <Amount cents={cushion.target} compact />
              </p>
            </>
          ) : (
            <>
              <p className="mt-3 font-serif text-4xl text-ink">
                <Amount cents={view.saved} compact animated />
              </p>
              <div className="mt-2.5">
                <ProgressBar value={view.saved} max={view.savingsTarget} label="Épargne du mois" height={3} />
              </div>
              <p className="mt-2 text-sm text-muted">Phase 2 · placements</p>
            </>
          )}
        </button>
      </div>

      {pending.length > 0 && (
        <>
          <SectionTitle action={<a href="#/virements" className="text-sm text-gold">Tout voir</a>}>À virer maintenant</SectionTitle>
          <Card className="divide-y divide-line py-1">
            {pending.slice(0, 3).map((t) => (
              <div key={t.id} className="flex items-center gap-2 py-2">
                <CheckCircle
                  checked={false}
                  label={`Marquer comme fait : ${formatEUR(t.amount, { compact: true })} vers ${data.accountName(t.toAccountId)}`}
                  onChange={() => {
                    haptic('success');
                    setTransferDone(t.id, true);
                  }}
                />
                <TransferLabel transfer={t} />
              </div>
            ))}
          </Card>
        </>
      )}

      {alerts.length > 0 && (
        <>
          <SectionTitle>À ton attention</SectionTitle>
          <div className="space-y-3">
            {alerts.map((a) => (
              <AlertCard key={a.id} alert={a} />
            ))}
          </div>
        </>
      )}

      <SectionTitle action={<a href="#/calendrier" className="text-sm text-gold">Calendrier</a>}>Prochains prélèvements</SectionTitle>
      <Card className="py-1">
        {upcoming.length === 0 ? (
          <p className="py-4 text-sm leading-relaxed text-muted">
            Aucun prélèvement daté dans les 30 prochains jours.{' '}
            {data.snap.subscriptions.some((s) => s.status === 'actif' && !s.day) && (
              <a href="#/abonnements" className="text-gold underline underline-offset-4">Complète les jours de prélèvement.</a>
            )}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {upcoming.slice(0, 3).map((c) => (
              <li key={`${c.sub.id}-${c.date}`} className="flex min-h-14 items-center gap-3 py-2">
                <SubscriptionIcon sub={c.sub} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem] text-ink">{c.sub.name}</span>
                  <span className={`block text-xs ${c.daysLeft <= 3 ? 'text-gold' : 'text-muted'}`}>{countdown(c.daysLeft)} · {data.accountName(c.sub.accountId)}</span>
                </span>
                <Amount cents={c.amount} className="text-ink" />
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={() => navigate('/abonnements')} className="flex min-h-12 w-full items-center justify-between border-t border-line py-2 text-left text-sm">
          <span className="text-muted">
            Abonnements : <Amount cents={Math.round(subsMonthly)} compact className="text-ink" /> par mois · <Amount cents={Math.round(subsYearly / 100) * 100} compact className="text-ink" /> par an
          </span>
          <Icon name="chevronRight" size={16} className="text-faint" />
        </button>
      </Card>

      <SectionTitle>Santé financière</SectionTitle>
      <Card>
        <div className="flex items-center gap-5">
          <Ring value={health.score / 100} label={`Indicateur de santé : ${health.score} sur 100`}>
            <span className="font-serif text-3xl text-ink">{health.score}</span>
          </Ring>
          <div>
            <p className="font-serif text-2xl text-ink">{health.label}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">Taux d’épargne, matelas, régularité et rapidité des virements.</p>
          </div>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-line pt-5">
          <div>
            <dt className="text-xs text-muted">Épargne du mois</dt>
            <dd className="mt-1 font-serif text-2xl text-ink tabular">{formatPct(health.savingsRateMonth)}</dd>
            <dd className="text-xs text-faint">moyenne {formatPct(health.savingsRateAverage)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Matelas</dt>
            <dd className="mt-1 font-serif text-2xl text-ink tabular">{health.cushionMonths.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} mois</dd>
            <dd className="text-xs text-faint">de dépenses couverts</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Série</dt>
            <dd className="mt-1 font-serif text-2xl text-ink tabular">{health.streak} mois</dd>
            <dd className="text-xs text-faint">objectif d’épargne tenu</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Virements en 48 h</dt>
            <dd className="mt-1 font-serif text-2xl text-ink tabular">{health.transfersConsidered ? formatPct(health.within48h) : '–'}</dd>
            <dd className="text-xs text-faint">{health.transfersConsidered ? `sur ${health.transfersConsidered} virements` : 'pas encore de recul'}</dd>
          </div>
        </dl>
      </Card>

      <SectionTitle>Raccourcis</SectionTitle>
      <div className="grid grid-cols-3 gap-3">
        <Quick icon="chart" label="Prévisions" onClick={() => navigate('/previsions')} />
        <Quick icon="month" label="Calendrier" onClick={() => navigate('/calendrier')} />
        <Quick icon="receipt" label="Abonnements" onClick={() => navigate('/abonnements')} />
        <Quick icon="umbrella" label="Utiliser une provision" onClick={() => navigate('/provisions/utiliser')} />
        <Quick icon="review" label="Revue du mois" onClick={() => navigate(`/revue/${alerts.find((a) => a.id.startsWith('review-'))?.id.slice(7) ?? month}`)} />
        <Quick icon="file" label="Importer un relevé" onClick={() => navigate('/import')} />
      </div>

      {data.snap.receipts.length === 0 && (
        <Card className="mt-6 text-center">
          <p className="font-serif text-xl text-ink">Premier encaissement ?</p>
          <p className="mt-2 text-sm text-muted">Dès que de l’argent arrive, touche le bouton doré. Trente secondes, et chaque euro trouve sa place.</p>
          <div className="mt-4">
            <Button icon="plus" onClick={() => navigate('/encaissement')}>Saisir un encaissement</Button>
          </div>
        </Card>
      )}
    </Page>
  );
}
