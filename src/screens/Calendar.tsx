import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { addMonths, daysInMonth, formatDate, monthLabel, monthOf, parseISODate } from '../engine/dates';
import { subscriptionsIcs } from '../engine/ics';
import { inWindow } from '../engine/income';
import { formatEUR } from '../engine/money';
import { chargeSummary, countdown, monthCharges, upcomingCharges, type Charge } from '../engine/subscriptions';
import type { ExpectedIncome, ISODate, Receipt } from '../engine/types';
import { useData } from '../state/data';
import { downloadFile } from '../state/files';
import { haptic } from '../state/haptics';
import { navigate } from '../state/router';
import { useUI } from '../state/ui';
import { Amount } from '../ui/Amount';
import { Button, Card, EmptyState, IconButton, Page, PageHeader, Pill, SectionTitle, Segmented, Sheet } from '../ui/kit';
import { SubscriptionIcon } from '../ui/SubscriptionIcon';

const ease = [0.22, 1, 0.36, 1] as const;
const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const pad = (n: number) => String(n).padStart(2, '0');

interface DayInfo {
  date: ISODate;
  charges: Charge[];
  incomes: ExpectedIncome[];
  receipts: Receipt[];
}

function DayCell({ info, today, selected, onSelect }: { info: DayInfo; today: ISODate; selected: boolean; onSelect: () => void }) {
  const day = Number(info.date.slice(8));
  const isToday = info.date === today;
  const parts = [
    formatDate(info.date, 'long').replace(/ \d{4}$/, ''),
    ...info.charges.map((c) => `${c.sub.name} ${formatEUR(c.amount)}`),
    ...info.incomes.map((i) => `revenu attendu : ${i.name}`),
    ...info.receipts.map((r) => `encaissement ${r.source} ${formatEUR(r.amount, { compact: true })}`),
  ];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={parts.join(', ')}
      aria-pressed={selected}
      className={`relative flex min-h-16 flex-col items-center rounded-xl pt-1.5 pb-2 transition ${selected ? 'bg-raised' : 'active:bg-raised'}`}
    >
      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[0.8125rem] tabular ${isToday ? 'border border-gold text-gold' : 'text-ink'}`}>{day}</span>
      <span className="mt-1 flex items-center -space-x-1.5">
        {info.charges.slice(0, 2).map((c) => (
          <SubscriptionIcon key={c.sub.id} sub={c.sub} size={18} />
        ))}
        {info.charges.length > 2 && <span className="pl-2.5 text-[0.625rem] text-muted">+{info.charges.length - 2}</span>}
      </span>
      {info.incomes.length > 0 && <span className="absolute inset-x-1.5 bottom-1 border-b border-dashed border-gold/70" aria-hidden="true" />}
      {info.receipts.length > 0 && <span className="absolute inset-x-2 bottom-0.5 h-[2px] rounded-full bg-gold" aria-hidden="true" />}
    </button>
  );
}

export default function Calendar({ month: param, query }: { month?: string; query: URLSearchParams }) {
  const data = useData();
  const { snap, today } = data;
  const { toast } = useUI();
  const current = monthOf(today);
  const month = param && /^\d{4}-\d{2}$/.test(param) ? param : current;
  const [view, setView] = useState<'mois' | 'avenir'>(query.get('vue') === 'avenir' ? 'avenir' : 'mois');
  const [selected, setSelected] = useState<ISODate | null>(null);
  const requested = query.get('vue');
  useEffect(() => {
    if (requested === 'avenir' || requested === 'mois') setView(requested);
  }, [requested]);
  const [dir, setDir] = useState(1);

  const charges = monthCharges(snap.subscriptions, month);
  const summary = chargeSummary(snap.subscriptions, month, today);
  const undated = charges.filter((c) => !c.date);
  const incomes = snap.incomes.filter((i) => !i.archived && i.windowStart !== undefined);
  const days: DayInfo[] = Array.from({ length: daysInMonth(month) }, (_, i) => {
    const date = `${month}-${pad(i + 1)}`;
    return {
      date,
      charges: charges.filter((c) => c.date === date),
      incomes: incomes.filter((inc) => inWindow(inc, date)),
      receipts: snap.receipts.filter((r) => r.date === date),
    };
  });
  const offset = (parseISODate(`${month}-01`).getDay() + 6) % 7;
  const upcoming = upcomingCharges(snap.subscriptions, today, 60);
  const next30 = upcoming.filter((c) => c.daysLeft <= 30).reduce((a, c) => a + c.amount, 0);
  const selectedInfo = days.find((d) => d.date === selected);

  const go = (delta: number) => {
    setDir(delta);
    setSelected(null);
    haptic();
    navigate(`/calendrier/${addMonths(month, delta)}`, { replace: true });
  };

  const exportIcs = () => {
    const { ics, count, skipped } = subscriptionsIcs(snap.subscriptions, today, data.accountName);
    if (count === 0) {
      toast('Renseigne d’abord le jour de prélèvement de tes abonnements.');
      return;
    }
    downloadFile('abonnements.ics', ics, 'text/calendar');
    toast(`${count} abonnement${count > 1 ? 's' : ''} exporté${count > 1 ? 's' : ''}${skipped ? ` · ${skipped} sans date ignoré${skipped > 1 ? 's' : ''}` : ''}.`);
  };

  return (
    <Page>
      <PageHeader
        eyebrow="Prélèvements"
        title="Calendrier"
        back
        backTo="/abonnements"
        actions={<IconButton icon="calendarPlus" label="Ajouter mes abonnements au calendrier de l’iPhone" onClick={exportIcs} />}
      />

      <Segmented label="Vue" value={view} onChange={setView} options={[{ value: 'mois', label: 'Mois' }, { value: 'avenir', label: 'À venir' }]} />

      {view === 'mois' ? (
        <>
          <Card className="mt-4">
            <dl className="grid grid-cols-3 gap-3 text-center">
              <div>
                <dt className="eyebrow">Ce mois</dt>
                <dd className="mt-2 font-serif text-2xl text-ink"><Amount cents={summary.total} compact animated /></dd>
              </div>
              <div className="border-x border-line">
                <dt className="eyebrow">Prélevé</dt>
                <dd className="mt-2 font-serif text-2xl text-muted"><Amount cents={summary.done} compact animated /></dd>
              </div>
              <div>
                <dt className="eyebrow">Reste</dt>
                <dd className="mt-2 font-serif text-2xl text-gold"><Amount cents={summary.remaining} compact animated /></dd>
              </div>
            </dl>
            {summary.undated > 0 && (
              <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
                Dont {summary.undated} prélèvement{summary.undated > 1 ? 's' : ''} sans date, comptés dans le reste.
              </p>
            )}
          </Card>

          <nav className="mt-5 mb-2 flex items-center justify-between" aria-label="Changer de mois">
            <IconButton icon="chevronLeft" label="Mois précédent" className="-ml-3" onClick={() => go(-1)} />
            <h2 className="font-serif text-2xl text-ink capitalize" aria-live="polite">{monthLabel(month)}</h2>
            <IconButton icon="chevronRight" label="Mois suivant" className="-mr-3" onClick={() => go(1)} />
          </nav>

          <div className="card overflow-hidden p-2">
            <div className="grid grid-cols-7 pb-1 text-center" aria-hidden="true">
              {WEEKDAYS.map((w) => (
                <span key={w} className="py-1 text-[0.6875rem] tracking-widest text-muted uppercase">{w.charAt(0)}</span>
              ))}
            </div>
            <AnimatePresence mode="popLayout" initial={false} custom={dir}>
              <motion.div
                key={month}
                custom={dir}
                initial={{ opacity: 0, x: 40 * dir }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 * dir }}
                transition={{ duration: 0.35, ease }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.18}
                onDragEnd={(_, info) => {
                  if (info.offset.x < -60) go(1);
                  else if (info.offset.x > 60) go(-1);
                }}
                style={{ touchAction: 'pan-y' }}
                className="grid grid-cols-7 gap-0.5"
                role="group"
                aria-label={`Jours de ${monthLabel(month)}`}
              >
                {Array.from({ length: offset }, (_, i) => (
                  <span key={`blank-${i}`} aria-hidden="true" />
                ))}
                {days.map((d) => (
                  <DayCell key={d.date} info={d} today={today} selected={selected === d.date} onSelect={() => setSelected(d.date)} />
                ))}
              </motion.div>
            </AnimatePresence>
          </div>

          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 px-1 text-xs text-muted" aria-label="Légende">
            <li className="flex items-center gap-2"><span className="h-3 w-3 rounded-full border border-gold/60 bg-gold-soft" />Prélèvement</li>
            <li className="flex items-center gap-2"><span className="w-5 border-b border-dashed border-gold/70" />Revenu attendu</li>
            <li className="flex items-center gap-2"><span className="h-[2px] w-5 rounded-full bg-gold" />Encaissement</li>
            {month === current && <li className="flex items-center gap-2"><span className="h-3 w-3 rounded-full border border-gold" />Aujourd’hui</li>}
          </ul>

          {undated.length > 0 && (
            <>
              <SectionTitle>À dater</SectionTitle>
              <Card className="divide-y divide-line py-0">
                {undated.map((c) => (
                  <button key={c.sub.id} type="button" onClick={() => navigate(`/abonnements?edit=${c.sub.id}`)} className="flex min-h-14 w-full items-center gap-3 py-2 text-left">
                    <SubscriptionIcon sub={c.sub} size={32} />
                    <span className="flex-1 text-[0.9375rem] text-ink">{c.sub.name}</span>
                    <Pill tone="gold">à compléter</Pill>
                    <Amount cents={c.amount} className="text-ink" />
                  </button>
                ))}
              </Card>
            </>
          )}
        </>
      ) : (
        <>
          <Card className="mt-4">
            <p className="eyebrow">30 prochains jours</p>
            <p className="mt-2 font-serif text-4xl text-ink"><Amount cents={next30} compact animated /></p>
            <p className="mt-1 text-sm text-muted">à prélever sur tes comptes</p>
          </Card>
          <SectionTitle>À venir</SectionTitle>
          <Card className="divide-y divide-line py-0">
            {upcoming.length === 0 ? (
              <EmptyState
                icon="month"
                title="Aucun prélèvement daté"
                body="Indique le jour de prélèvement de tes abonnements pour les voir arriver ici, avec un compte à rebours."
                action={<Button variant="secondary" onClick={() => navigate('/abonnements')}>Compléter</Button>}
              />
            ) : (
              upcoming.map((c) => (
                <div key={`${c.sub.id}-${c.date}`} className="flex min-h-16 items-center gap-3 py-3">
                  <div className="w-11 shrink-0 text-center">
                    <p className="font-serif text-2xl leading-none text-ink">{Number(c.date.slice(8))}</p>
                    <p className="mt-0.5 text-[0.6875rem] text-muted">{new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(parseISODate(c.date))}</p>
                  </div>
                  <SubscriptionIcon sub={c.sub} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.9375rem] text-ink">{c.sub.name}</p>
                    <p className="text-xs text-muted">{data.accountName(c.sub.accountId)}</p>
                  </div>
                  <div className="text-right">
                    <Amount cents={c.amount} className="block text-ink" />
                    <span className={`text-xs ${c.daysLeft <= 3 ? 'text-gold' : 'text-muted'}`}>{countdown(c.daysLeft)}</span>
                  </div>
                </div>
              ))
            )}
          </Card>
        </>
      )}

      <div className="mt-6">
        <Button variant="secondary" full icon="calendarPlus" onClick={exportIcs}>Ajouter au Calendrier de l’iPhone</Button>
        <p className="mt-2 text-center text-xs text-faint">Chaque abonnement devient un événement récurrent, avec un rappel la veille.</p>
      </div>

      <Sheet open={selectedInfo !== undefined} onClose={() => setSelected(null)} title={selectedInfo ? new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(parseISODate(selectedInfo.date)) : ''}>
        {selectedInfo && (
          <div className="space-y-5">
            {selectedInfo.charges.length + selectedInfo.incomes.length + selectedInfo.receipts.length === 0 && (
              <p className="text-sm text-muted">Rien de prévu ce jour-là.</p>
            )}
            {selectedInfo.charges.length > 0 && (
              <section>
                <h3 className="eyebrow mb-2">Prélèvements</h3>
                {selectedInfo.charges.map((c) => (
                  <button key={c.sub.id} type="button" onClick={() => navigate(`/abonnements?edit=${c.sub.id}`)} className="flex min-h-14 w-full items-center gap-3 text-left">
                    <SubscriptionIcon sub={c.sub} size={32} />
                    <span className="flex-1">
                      <span className="block text-[0.9375rem] text-ink">{c.sub.name}</span>
                      <span className="block text-xs text-muted">{data.accountName(c.sub.accountId)}{selectedInfo.date < today ? ' · prélevé' : ` · ${countdown(Math.round((parseISODate(selectedInfo.date).getTime() - parseISODate(today).getTime()) / 86_400_000))}`}</span>
                    </span>
                    <Amount cents={c.amount} className="font-serif text-lg text-ink" />
                  </button>
                ))}
              </section>
            )}
            {selectedInfo.incomes.length > 0 && (
              <section>
                <h3 className="eyebrow mb-2">Revenus attendus</h3>
                {selectedInfo.incomes.map((i) => (
                  <p key={i.id} className="flex min-h-11 items-center justify-between text-[0.9375rem]">
                    <span className="text-ink">{i.name} <span className="text-xs text-muted">· du {i.windowStart} au {i.windowEnd}</span></span>
                    {i.amount !== null && <Amount cents={i.amount} compact className="text-muted" />}
                  </p>
                ))}
              </section>
            )}
            {selectedInfo.receipts.length > 0 && (
              <section>
                <h3 className="eyebrow mb-2">Encaissements</h3>
                {selectedInfo.receipts.map((r) => (
                  <button key={r.id} type="button" onClick={() => navigate(`/repartition/${r.id}`)} className="flex min-h-11 w-full items-center justify-between text-left text-[0.9375rem]">
                    <span className="text-ink">{r.source}</span>
                    <Amount cents={r.amount} compact className="text-gold" />
                  </button>
                ))}
              </section>
            )}
          </div>
        )}
      </Sheet>
    </Page>
  );
}
