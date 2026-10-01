import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatEUR, formatEUR0 } from '../engine/money';

const axis = { stroke: 'var(--line-strong)', tick: { fill: 'var(--muted)', fontSize: 11 }, tickLine: false, axisLine: false } as const;

function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: number; swatch?: string }[] }) {
  return (
    <div className="rounded-xl border border-line-strong bg-raised px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 text-muted">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2 text-ink">
          {r.swatch && <span className="h-2 w-2 rounded-full" style={{ background: r.swatch }} />}
          <span className="text-muted">{r.label}</span>
          <span className="amount ml-auto pl-3 tabular">{formatEUR(r.value, { compact: true })}</span>
        </p>
      ))}
    </div>
  );
}

const compactAxis = (v: number) =>
  Math.abs(v) >= 1_000_000
    ? `${(v / 100_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k€`
    : `${new Intl.NumberFormat('fr-FR').format(Math.round(v / 100))} €`;

/** Évolution d'un montant dans le temps : une seule série, aire discrète, réticule au survol. */
export function EvolutionChart({ data, label, seriesLabel = 'Patrimoine', height = 'h-52' }: { data: { label: string; value: number }[]; label: string; seriesLabel?: string; height?: string }) {
  return (
    <div className={`amount ${height} w-full`} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="evo-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--gold)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--gold)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={24} />
          <YAxis {...axis} width={52} tickFormatter={compactAxis} />
          <Tooltip
            cursor={{ stroke: 'var(--line-strong)', strokeWidth: 1 }}
            content={({ active, payload, label: l }) =>
              active && payload?.length ? <TooltipBox title={String(l)} rows={[{ label: seriesLabel, value: Number(payload[0].value) }]} /> : null
            }
          />
          <Area type="monotone" dataKey="value" stroke="var(--gold)" strokeWidth={2} fill="url(#evo-fill)" activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2, fill: 'var(--gold)' }} animationDuration={1200} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Projection : versements (neutre) et gains hypothétiques (or), empilés. */
export function ProjectionChart({ data }: { data: { label: string; contributed: number; gains: number }[] }) {
  return (
    <div className="amount h-60 w-full" role="img" aria-label="Projection : versements cumulés et gains hypothétiques par année">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={20} />
          <YAxis {...axis} width={56} tickFormatter={compactAxis} />
          <Tooltip
            cursor={{ stroke: 'var(--line-strong)', strokeWidth: 1 }}
            content={({ active, payload, label: l }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as { contributed: number; gains: number };
              return (
                <TooltipBox
                  title={String(l)}
                  rows={[
                    { label: 'Versé', value: p.contributed, swatch: 'var(--chart-neutral)' },
                    { label: 'Gains', value: p.gains, swatch: 'var(--gold)' },
                    { label: 'Total', value: p.contributed + p.gains },
                  ]}
                />
              );
            }}
          />
          <Area type="monotone" dataKey="contributed" stackId="1" stroke="var(--chart-neutral)" strokeWidth={2} fill="var(--chart-neutral)" fillOpacity={0.18} animationDuration={1000} />
          <Area type="monotone" dataKey="gains" stackId="1" stroke="var(--gold)" strokeWidth={2} fill="var(--gold)" fillOpacity={0.22} animationDuration={1200} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Épargne par mois : barres fines, une teinte ; le mois objectif atteint est plein, les autres atténués. */
export function MonthlyBars({ data, label }: { data: { label: string; value: number; met: boolean }[]; label: string }) {
  return (
    <div className="amount h-48 w-full" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="label" {...axis} />
          <YAxis {...axis} width={48} tickFormatter={compactAxis} />
          <Tooltip
            cursor={{ fill: 'var(--gold-soft)' }}
            content={({ active, payload, label: l }) =>
              active && payload?.length ? <TooltipBox title={String(l)} rows={[{ label: 'Épargné', value: Number(payload[0].value) }]} /> : null
            }
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} animationDuration={1000}>
            {data.map((d, i) => (
              <Cell key={i} fill="var(--gold)" fillOpacity={d.met ? 1 : 0.45} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Tableau de repli (accessibilité) pour les graphiques. */
export function DataTable({ caption, columns, rows }: { caption: string; columns: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="min-h-11 cursor-pointer py-2 text-muted">Voir les données</summary>
      <table className="amount w-full text-left text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-muted">
            {columns.map((c) => (
              <th key={c} scope="col" className="py-1.5 font-normal">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line">
              {r.map((cell, j) => (
                <td key={j} className="py-1.5 tabular text-ink">{typeof cell === 'number' ? formatEUR0(cell) : cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  /** Variable CSS de la couleur (catégorie fixe, jamais selon le rang). */
  color: string;
}

/** Anneau : parts séparées par un fin espace, total au centre, survol détaillé. */
export function DonutChart({ data, label, center }: { data: DonutSlice[]; label: string; center: React.ReactNode }) {
  return (
    <div className="relative mx-auto h-44 w-44" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius="72%"
            outerRadius="100%"
            paddingAngle={data.length > 1 ? 2 : 0}
            stroke="var(--surface)"
            strokeWidth={2}
            startAngle={90}
            endAngle={-270}
            animationDuration={900}
          >
            {data.map((d) => (
              <Cell key={d.key} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipBox title={String(payload[0].name)} rows={[{ label: 'Par mois', value: Number(payload[0].value), swatch: (payload[0].payload as DonutSlice).color }]} />
              ) : null
            }
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>
    </div>
  );
}

/** Revenu prévu par mois, avec une fine ligne dorée au niveau du budget normal. Barres atténuées : mois serré. */
export function ForecastChart({ data, normal, onSelect }: { data: { month: string; label: string; value: number; tight: boolean }[]; normal: number; onSelect?: (month: string) => void }) {
  return (
    <div className="amount h-48 w-full" role="img" aria-label={`Revenu prévu sur 12 mois ; ligne dorée : budget normal de ${formatEUR(normal, { compact: true })}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 4, bottom: 0, left: 0 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="label" {...axis} interval={0} tick={{ fill: 'var(--muted)', fontSize: 10 }} />
          <YAxis {...axis} width={58} tickFormatter={compactAxis} domain={[0, (max: number) => Math.max(max, normal) * 1.08]} />
          <Tooltip
            cursor={{ fill: 'var(--gold-soft)' }}
            content={({ active, payload, label: l }) =>
              active && payload?.length ? (
                <TooltipBox title={String(l)} rows={[{ label: 'Revenu prévu', value: Number(payload[0].value) }, { label: 'Budget normal', value: normal }]} />
              ) : null
            }
          />
          <ReferenceLine y={normal} stroke="var(--gold)" strokeWidth={1} strokeDasharray="0" ifOverflow="extendDomain" />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} animationDuration={900} onClick={(d) => onSelect?.((d as unknown as { month: string }).month)} cursor={onSelect ? 'pointer' : undefined}>
            {data.map((d) => (
              <Cell key={d.month} fill="var(--gold)" fillOpacity={d.tight ? 0.4 : 0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
