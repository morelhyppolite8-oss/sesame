import { useMemo, useState } from 'react';
import { isInvestment } from '../engine/balances';
import { formatDate } from '../engine/dates';
import { formatPct } from '../engine/money';
import { milestones, simulate } from '../engine/projection';
import type { Cents } from '../engine/types';
import { useData } from '../state/data';
import { accountsView } from '../state/selectors';
import { Amount } from '../ui/Amount';
import { AmountInput } from '../ui/AmountInput';
import { DataTable, ProjectionChart } from '../ui/charts';
import { Icon } from '../ui/Icon';
import { Card, Field, Page, PageHeader, ProgressBar, SectionTitle } from '../ui/kit';

function Slider({ id, label, value, min, max, step, onChange, format }: { id: string; label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string }) {
  return (
    <div className="mb-5">
      <div className="mb-2 flex items-baseline justify-between">
        <label htmlFor={id} className="text-[0.8125rem] text-muted">{label}</label>
        <span className="font-serif text-xl text-ink tabular">{format(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 w-full cursor-pointer accent-[var(--gold)]"
      />
    </div>
  );
}

export default function Projection() {
  const data = useData();
  const accounts = accountsView(data);
  const invested = accounts.filter((a) => isInvestment(a.account.type)).reduce((a, s) => a + s.value, 0);
  const phase2 = data.snap.settings.rules.savings.phase2;
  const savings = data.snap.envelopes.filter((e) => e.kind === 'epargne' && !e.archived).reduce((a, e) => a + e.target, 0);
  const [initial, setInitial] = useState<Cents>(invested);
  const [monthly, setMonthly] = useState<Cents>(savings || phase2.reduce((a, p) => a + p.weight * 100, 0));
  const [rate, setRate] = useState(4);
  const [years, setYears] = useState(10);
  const points = useMemo(() => simulate({ initial, monthly, annualRate: rate / 100, years }), [initial, monthly, rate, years]);
  const last = points[points.length - 1];
  const events = milestones(data.snap.accounts, data.snap.readings, data.ledger.flows, data.today);

  return (
    <Page>
      <PageHeader eyebrow="Patrimoine" title="Projection" back backTo="/patrimoine" />

      <Card>
        <div className="mb-5 flex gap-3 rounded-xl border border-line bg-bg/40 p-3.5 text-xs leading-relaxed text-muted" role="note">
          <Icon name="info" size={16} className="mt-0.5 shrink-0 text-gold" />
          <p>
            Simulation <strong className="font-medium text-ink">purement hypothétique</strong> : le rendement choisi n’est ni une prévision ni une garantie. Les marchés peuvent baisser, et les performances passées ne préjugent pas des performances futures. Ce n’est pas un conseil en investissement.
          </p>
        </div>
        <Field label="Capital de départ" htmlFor="sim-initial">
          <AmountInput id="sim-initial" value={initial} onChange={(v) => setInitial(v ?? 0)} />
        </Field>
        <Field label="Versement mensuel" htmlFor="sim-monthly">
          <AmountInput id="sim-monthly" value={monthly} onChange={(v) => setMonthly(v ?? 0)} />
        </Field>
        <Slider id="sim-rate" label="Rendement annuel hypothétique" value={rate} min={0} max={10} step={0.5} onChange={setRate} format={(v) => formatPct(v / 100, 1)} />
        <Slider id="sim-years" label="Horizon" value={years} min={1} max={40} step={1} onChange={setYears} format={(v) => `${v} an${v > 1 ? 's' : ''}`} />
      </Card>

      <Card className="mt-4">
        <p className="eyebrow">Dans {years} an{years > 1 ? 's' : ''}, sous cette hypothèse</p>
        <p className="mt-3 font-serif text-5xl text-ink"><Amount cents={last.value} compact animated duration={0.6} /></p>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <span className="flex items-center gap-2 text-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: 'var(--chart-neutral)' }} /> Versé <Amount cents={last.contributed} compact className="text-ink" />
          </span>
          <span className="flex items-center gap-2 text-muted">
            <span className="h-2 w-2 rounded-full bg-gold" /> Gains <Amount cents={last.gains} compact className="text-ink" />
          </span>
        </div>
        <div className="mt-5">
          <ProjectionChart data={points.map((p) => ({ label: p.year === 0 ? 'Auj.' : `${p.year} an${p.year > 1 ? 's' : ''}`, contributed: p.contributed, gains: Math.max(0, p.gains) }))} />
          <DataTable caption="Projection année par année" columns={['Année', 'Versé', 'Valeur']} rows={points.map((p) => [String(p.year), p.contributed, p.value])} />
        </div>
      </Card>

      <SectionTitle>Échéances clés</SectionTitle>
      <div className="space-y-3">
        {events.map((m) => (
          <Card key={m.id}>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-[0.9375rem] font-medium text-ink">{m.title}</h3>
              {m.date && <span className="shrink-0 text-sm text-gold">{formatDate(m.date, 'long')}</span>}
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{m.detail}</p>
            <div className="mt-3">
              <ProgressBar value={m.ratio} max={1} label={`${m.title} : ${formatPct(m.ratio)}`} height={3} />
            </div>
            {m.daysLeft !== undefined && m.daysLeft > 0 && (
              <p className="mt-2 text-xs text-faint">
                Encore {m.daysLeft > 60 ? `${Math.round(m.daysLeft / 30.4)} mois` : `${m.daysLeft} jours`}
              </p>
            )}
          </Card>
        ))}
      </div>
    </Page>
  );
}
