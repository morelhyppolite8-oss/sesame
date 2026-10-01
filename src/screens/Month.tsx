import { setTransferDone } from '../db/actions';
import { addMonths, formatDate, monthIndex, monthLabel, monthOf, ofMonth } from '../engine/dates';
import { formatEUR } from '../engine/money';
import { useData } from '../state/data';
import { haptic } from '../state/haptics';
import { navigate } from '../state/router';
import { monthView } from '../state/selectors';
import { Amount } from '../ui/Amount';
import { Icon } from '../ui/Icon';
import { Button, Card, CheckCircle, EmptyState, IconButton, Page, PageHeader, ProgressBar, SectionTitle } from '../ui/kit';
import { PlanCard } from '../ui/PlanCard';
import { TransferLabel } from '../ui/TransferLabel';


const kindLabel = { depense: 'Dépense', provision: 'Provision', epargne: 'Épargne' } as const;

export default function Month({ month: param }: { month?: string }) {
  const data = useData();
  const current = monthOf(data.today);
  const month = param && /^\d{4}-\d{2}$/.test(param) ? param : current;
  const view = monthView(data, month);
  const review = data.snap.reviews.find((r) => r.month === month);
  const isPast = monthIndex(month) < monthIndex(current);

  return (
    <Page>
      <PageHeader eyebrow="Mois budgétaire" title={monthLabel(month)} />

      <nav className="-mt-2 mb-6 flex items-center justify-between" aria-label="Changer de mois">
        <IconButton icon="chevronLeft" label="Mois précédent" className="-ml-3" onClick={() => navigate(`/mois/${addMonths(month, -1)}`, { replace: true })} />
        {month !== current ? (
          <button type="button" className="min-h-11 text-sm text-gold" onClick={() => navigate('/mois', { replace: true })}>
            Revenir à {monthLabel(current, false)}
          </button>
        ) : (
          <span className="text-sm text-muted">Mois en cours</span>
        )}
        <IconButton icon="chevronRight" label="Mois suivant" className="-mr-3" onClick={() => navigate(`/mois/${addMonths(month, 1)}`, { replace: true })} />
      </nav>

      <PlanCard month={month} />

      <Card>
        <dl className="grid grid-cols-3 gap-3 text-center">
          <div>
            <dt className="eyebrow">Reçu</dt>
            <dd className="mt-2 font-serif text-2xl text-ink"><Amount cents={view.summary.received} compact animated /></dd>
          </div>
          <div className="border-x border-line">
            <dt className="eyebrow">Attendu</dt>
            <dd className="mt-2 font-serif text-2xl text-muted"><Amount cents={view.summary.expected} compact /></dd>
          </div>
          <div>
            <dt className="eyebrow">Reste</dt>
            <dd className="mt-2 font-serif text-2xl text-gold"><Amount cents={view.summary.remaining} compact animated /></dd>
          </div>
        </dl>
      </Card>

      {(isPast || month === current) && view.receipts.length > 0 && (
        <button
          type="button"
          onClick={() => navigate(`/revue/${month}`)}
          className="card mt-4 flex w-full items-center gap-4 p-5 text-left transition active:scale-[0.99]"
        >
          <Icon name="review" size={22} className="shrink-0 text-gold" />
          <span className="flex-1">
            <span className="block text-[0.9375rem] text-ink">{review?.completedAt ? `Revue ${ofMonth(month)} terminée` : `Revue ${ofMonth(month)}`}</span>
            <span className="mt-0.5 block text-[0.8125rem] text-muted">
              {review?.completedAt ? 'Revoir le bilan et les reliquats' : 'Prévu contre réel, reliquats, conseil'}
            </span>
          </span>
          <Icon name="chevronRight" size={16} className="text-faint" />
        </button>
      )}

      <SectionTitle>Enveloppes</SectionTitle>
      <Card className="divide-y divide-line py-1">
        {view.envelopes.map(({ envelope, funded, target, carryIn }) => {
          const over = funded > target;
          return (
            <div key={envelope.id} className="py-4">
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[0.9375rem] text-ink">{envelope.name}</p>
                  <p className="text-xs text-muted">
                    {kindLabel[envelope.kind]} · {envelope.auto ? 'compte de chaque abonnement' : envelope.accountId ? data.accountName(envelope.accountId) : 'selon les phases'}
                    {carryIn > 0 && <> · dont <Amount cents={carryIn} compact /> reportés</>}
                  </p>
                </div>
                <p className="shrink-0 text-sm text-muted tabular">
                  <Amount cents={funded} compact className={over ? 'text-gold' : 'text-ink'} /> / <Amount cents={target} compact />
                </p>
              </div>
              <div className="mt-2.5">
                <ProgressBar value={funded} max={target} label={`${envelope.name} : financé ${formatEUR(funded)} sur ${formatEUR(target)}`} />
              </div>
            </div>
          );
        })}
      </Card>
      {view.missing > 0 && view.receipts.length > 0 && (
        <p className="mt-3 px-1 text-sm text-muted">
          Il manque <Amount cents={view.missing} compact className="text-ink" /> pour financer tout le mois.
        </p>
      )}

      {view.pending.length > 0 && (
        <>
          <SectionTitle>Virements non cochés</SectionTitle>
          <Card className="divide-y divide-line py-1">
            {view.pending.map((t) => (
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

      <SectionTitle
        action={
          <button type="button" className="min-h-11 text-sm text-gold" onClick={() => navigate('/encaissement')}>
            Ajouter
          </button>
        }
      >
        Encaissements
      </SectionTitle>
      {view.receipts.length === 0 ? (
        <Card>
          <EmptyState
            icon="receipt"
            title="Rien pour l’instant"
            body={`Aucun encaissement ${ofMonth(month)}. Le premier donnera le ton.`}
            action={<Button icon="plus" variant="secondary" onClick={() => navigate('/encaissement')}>Nouvel encaissement</Button>}
          />
        </Card>
      ) : (
        <Card className="divide-y divide-line py-0">
          {view.receipts.map((r) => (
            <div key={r.id} className="flex min-h-16 items-center gap-2 py-2">
              <button type="button" onClick={() => navigate(`/repartition/${r.id}`)} className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-gold">
                  <Icon name="receipt" size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem] text-ink">{r.source}</span>
                  <span className="block text-xs text-muted">
                    {formatDate(r.date)}
                    {r.note && ` · ${r.note}`}
                    {r.month !== monthOf(r.date) && ' · mois ajusté'}
                  </span>
                </span>
                <Amount cents={r.amount} compact className="font-serif text-xl text-ink" />
              </button>
              <IconButton icon="edit" label={`Modifier l’encaissement ${r.source}`} className="-mr-2" onClick={() => navigate(`/encaissement?edit=${r.id}`)} />
            </div>
          ))}
        </Card>
      )}

      <div className="mt-6">
        <Button variant="secondary" full icon="month" onClick={() => navigate(`/calendrier/${month}`)}>Calendrier des prélèvements</Button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Button variant="secondary" icon="umbrella" onClick={() => navigate('/provisions')}>Provisions</Button>
        <Button variant="secondary" icon="transfer" onClick={() => navigate('/virements')}>Virements</Button>
      </div>
    </Page>
  );
}
