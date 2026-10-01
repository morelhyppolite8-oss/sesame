import { motion } from 'framer-motion';
import { netWorthSeries } from '../engine/balances';
import { monthLabel, monthShort } from '../engine/dates';
import { formatEUR, formatPct } from '../engine/money';
import { retrospective } from '../engine/retrospective';
import { useData } from '../state/data';
import { navigate } from '../state/router';
import { Amount } from '../ui/Amount';
import { DataTable, MonthlyBars } from '../ui/charts';
import { EmptyState, GoldLine, IconButton, Page, PageHeader } from '../ui/kit';

const ease = [0.22, 1, 0.36, 1] as const;

function Figure({ label, children, delay = 0 }: { label: string; children: React.ReactNode; delay?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.7, ease }} className="border-t border-line pt-4">
      <p className="eyebrow">{label}</p>
      <div className="mt-2 font-serif text-[2.25rem] leading-none text-ink">{children}</div>
    </motion.div>
  );
}

export default function Retrospective({ year }: { year: number }) {
  const data = useData();
  const retro = retrospective(data.ledger, data.snap.goals, year);
  const worth = netWorthSeries(data.snap.accounts.filter((a) => !a.archived), data.snap.readings, data.ledger.flows, [`${year - 1}-12`, `${year}-12`]);
  const growth = worth[1].total - worth[0].total;
  const currentYear = Number(data.today.slice(0, 4));

  return (
    <Page>
      <PageHeader
        eyebrow="Rapport annuel"
        title={`Exercice ${year}`}
        back
        backTo="/patrimoine"
        actions={
          <>
            <IconButton icon="chevronLeft" label="Année précédente" onClick={() => navigate(`/patrimoine/retrospective/${year - 1}`, { replace: true })} />
            <IconButton icon="chevronRight" label="Année suivante" disabled={year >= currentYear} className="disabled:opacity-30" onClick={() => navigate(`/patrimoine/retrospective/${year + 1}`, { replace: true })} />
          </>
        }
      />

      {retro.months.length === 0 ? (
        <div className="card">
          <EmptyState icon="sparkle" title="Une page blanche" body={`Aucun encaissement en ${year}. Ce rapport se remplira au fil des mois.`} />
        </div>
      ) : (
        <article className="card overflow-hidden p-6 md:p-8">
          <header className="text-center">
            <p className="eyebrow">Sésame · Rapport de gestion</p>
            <p className="mt-4 font-serif text-[4.5rem] leading-none text-gold">{year}</p>
            <GoldLine className="mx-auto mt-4 max-w-[12rem]" />
            <p className="mx-auto mt-4 max-w-sm font-serif text-lg leading-snug text-muted italic">
              {retro.averageRate >= 0.3
                ? 'Une année de constance. Les règles ont fait leur œuvre, mois après mois.'
                : retro.averageRate >= 0.15
                  ? 'Une année de construction. Les fondations sont posées.'
                  : 'Une année de départ. Chaque euro placé compte double pour la suite.'}
            </p>
          </header>

          <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8">
            <Figure label="Total épargné"><Amount cents={retro.totalSaved} compact animated /></Figure>
            <Figure label="Taux d’épargne moyen" delay={0.08}>{formatPct(retro.averageRate)}</Figure>
            <Figure label="Revenus perçus" delay={0.16}><Amount cents={retro.totalReceived} compact /></Figure>
            <Figure label="Patrimoine, variation" delay={0.24}><Amount cents={growth} compact sign /></Figure>
          </div>

          <section className="mt-12">
            <h2 className="eyebrow mb-4">Épargne mois par mois</h2>
            <MonthlyBars
              data={retro.months.map((m) => ({ label: monthShort(m.month), value: m.saved, met: m.targetMet }))}
              label={`Épargne mensuelle en ${year} ; barres pleines : objectif atteint`}
            />
            <p className="mt-2 text-xs text-muted">Barres pleines : objectif d’épargne atteint ({retro.monthsOnTarget} mois sur {retro.months.length}).</p>
            <DataTable
              caption={`Épargne par mois en ${year}`}
              columns={['Mois', 'Reçu', 'Épargné']}
              rows={retro.months.map((m) => [monthLabel(m.month, false), m.received, m.saved])}
            />
          </section>

          <section className="mt-10 grid gap-6 md:grid-cols-2">
            {retro.best && (
              <div className="border-t border-line pt-4">
                <p className="eyebrow">Meilleur mois</p>
                <p className="mt-2 font-serif text-2xl text-ink capitalize">{monthLabel(retro.best.month, false)}</p>
                <p className="mt-1 text-sm text-muted">{formatPct(retro.best.rate)} épargnés, soit <Amount cents={retro.best.saved} compact /></p>
              </div>
            )}
            {retro.worst && (
              <div className="border-t border-line pt-4">
                <p className="eyebrow">Mois le plus serré</p>
                <p className="mt-2 font-serif text-2xl text-ink capitalize">{monthLabel(retro.worst.month, false)}</p>
                <p className="mt-1 text-sm text-muted">{formatPct(retro.worst.rate)} épargnés. Il en faut aussi.</p>
              </div>
            )}
          </section>

          <section className="mt-10 border-t border-line pt-4">
            <p className="eyebrow">Objectifs atteints</p>
            {retro.goalsReached.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Aucun cette année. Les prochains sont en route.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {retro.goalsReached.map((g) => (
                  <li key={g.id} className="flex justify-between gap-3 text-[0.9375rem]">
                    <span className="text-ink">{g.name}</span>
                    <span className="text-gold">{formatEUR(g.target, { compact: true })}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <footer className="mt-10 border-t border-line pt-4 text-center text-xs text-faint">
            Dont <Amount cents={retro.leftoversSaved} compact /> de reliquats envoyés en épargne lors des revues.
          </footer>
        </article>
      )}
    </Page>
  );
}
