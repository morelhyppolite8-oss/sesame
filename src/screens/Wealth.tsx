import { useMemo, useState } from 'react';
import { addReadings } from '../db/actions';
import { isInvestment, netWorthSeries, wrapperLabels, wrapperOf, type TaxWrapper } from '../engine/balances';
import { formatDate, monthLabel, monthOf, monthRange, monthShort } from '../engine/dates';
import { formatPct } from '../engine/money';
import type { Cents } from '../engine/types';
import { useData } from '../state/data';
import { haptic } from '../state/haptics';
import { navigate } from '../state/router';
import { accountsView } from '../state/selectors';
import { useUI } from '../state/ui';
import { Amount } from '../ui/Amount';
import { AmountInput } from '../ui/AmountInput';
import { DataTable, EvolutionChart } from '../ui/charts';
import { Button, Card, Field, IconButton, Page, PageHeader, Row, SectionTitle, Sheet } from '../ui/kit';

export default function Wealth() {
  const data = useData();
  const { toast } = useUI();
  const snapshots = accountsView(data);
  const total = snapshots.reduce((a, s) => a + s.value, 0);
  const invested = snapshots.filter((s) => isInvestment(s.account.type));
  const gains = invested.reduce((a, s) => a + s.gain, 0);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, { value: Cents; invested?: Cents }>>({});

  const series = useMemo(() => {
    const first = [data.snap.settings.installedAt, ...data.snap.readings.map((r) => r.date)].sort()[0];
    const months = monthRange(monthOf(first), monthOf(data.today)).slice(-24);
    return netWorthSeries(data.snap.accounts.filter((a) => !a.archived), data.snap.readings, data.ledger.flows, months);
  }, [data]);

  const wrappers = useMemo(() => {
    const byWrapper = new Map<TaxWrapper, number>();
    for (const s of snapshots) byWrapper.set(wrapperOf(s.account.type), (byWrapper.get(wrapperOf(s.account.type)) ?? 0) + s.value);
    return [...byWrapper.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  }, [snapshots]);
  const positive = wrappers.reduce((a, [, v]) => a + v, 0);

  const openEditor = () => {
    setValues(Object.fromEntries(snapshots.map((s) => [s.account.id, { value: s.value, ...(isInvestment(s.account.type) ? { invested: s.invested } : {}) }])));
    setEditing(true);
  };

  const save = async () => {
    const readings = snapshots
      .filter((s) => values[s.account.id] && (values[s.account.id].value !== s.value || values[s.account.id].invested !== (isInvestment(s.account.type) ? s.invested : undefined)))
      .map((s) => ({ accountId: s.account.id, date: data.today, value: values[s.account.id].value, ...(values[s.account.id].invested !== undefined ? { invested: values[s.account.id].invested } : {}) }));
    if (readings.length) await addReadings(readings);
    setEditing(false);
    haptic('success');
    toast(readings.length ? 'Valeurs mises à jour.' : 'Rien n’a changé.');
  };

  const year = Number(data.today.slice(0, 4));

  return (
    <Page>
      <PageHeader eyebrow="Vue d’ensemble" title="Patrimoine" actions={<IconButton icon="edit" label="Mettre à jour les valeurs" onClick={openEditor} />} />

      <Card>
        <p className="eyebrow">Patrimoine net</p>
        <p className="mt-3 font-serif text-[3.25rem] leading-none text-ink"><Amount cents={total} compact animated /></p>
        {invested.length > 0 && (
          <p className="mt-3 text-sm text-muted">
            Plus ou moins-values sur placements : <Amount cents={gains} compact sign className={gains >= 0 ? 'text-positive' : 'text-negative'} />
          </p>
        )}
        {series.length < 2 ? (
          <p className="mt-6 border-t border-line pt-4 text-sm leading-relaxed text-muted">
            La courbe de ton patrimoine se dessinera ici dès le mois prochain, relevé après relevé.
          </p>
        ) : (
        <div className="mt-6">
          <EvolutionChart data={series.map((p) => ({ label: monthShort(p.month), value: p.total }))} label="Évolution du patrimoine net, mois par mois" />
          <DataTable caption="Patrimoine net par mois" columns={['Mois', 'Patrimoine']} rows={series.map((p) => [monthLabel(p.month), p.total])} />
        </div>
        )}
      </Card>

      <SectionTitle action={<button type="button" onClick={openEditor} className="min-h-11 text-sm text-gold">Mettre à jour</button>}>Comptes</SectionTitle>
      <Card className="divide-y divide-line py-1">
        {snapshots.map((s) => (
          <Row
            key={s.account.id}
            title={s.account.name}
            subtitle={
              isInvestment(s.account.type) ? (
                <>
                  Versé <Amount cents={s.invested} compact /> ·{' '}
                  <Amount cents={s.gain} compact sign className={s.gain >= 0 ? 'text-positive' : 'text-negative'} />
                </>
              ) : s.lastReadingDate ? (
                `Relevé du ${formatDate(s.lastReadingDate)}${s.account.type === 'courant' || s.account.type === 'revolut' ? '' : ' + virements prévus'}`
              ) : (
                'Pas encore de relevé'
              )
            }
            right={<Amount cents={s.value} compact className="font-serif text-xl text-ink" />}
          />
        ))}
      </Card>

      <SectionTitle>Par enveloppe fiscale</SectionTitle>
      <Card>
        {wrappers.length === 0 ? (
          <p className="text-sm text-muted">Saisis les valeurs de tes comptes pour voir la répartition.</p>
        ) : (
          <ul className="space-y-4">
            {wrappers.map(([w, v]) => (
              <li key={w}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-ink">{wrapperLabels[w]}</span>
                  <span className="text-muted">
                    <Amount cents={v} compact /> · {formatPct(positive > 0 ? v / positive : 0)}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-gold" style={{ width: `${positive > 0 ? (v / positive) * 100 : 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <SectionTitle>Prendre du recul</SectionTitle>
      <div className="grid gap-3">
        <Card as="div" className="p-0">
          <Row icon="chart" title="Projection et échéances" subtitle="Simulateur, maturité du PEA, 8 ans de l’assurance-vie, plafonds" onClick={() => navigate('/patrimoine/projection')} className="px-5" />
        </Card>
        <Card as="div" className="p-0">
          <Row icon="sparkle" title={`Rétrospective ${year}`} subtitle="Ton année, façon rapport annuel" onClick={() => navigate(`/patrimoine/retrospective/${year}`)} className="px-5" />
        </Card>
      </div>

      <Sheet open={editing} onClose={() => setEditing(false)} title="Valeurs du jour">
        <p className="mb-5 text-sm leading-relaxed text-muted">Recopie les soldes et valeurs affichés par tes banques. Les virements prévus s’ajouteront ensuite automatiquement.</p>
        {snapshots.map((s) => (
          <div key={s.account.id} className="mb-2">
            <Field label={s.account.name} htmlFor={`val-${s.account.id}`}>
              <AmountInput
                id={`val-${s.account.id}`}
                value={values[s.account.id]?.value ?? 0}
                onChange={(v) => setValues((x) => ({ ...x, [s.account.id]: { ...x[s.account.id], value: v ?? 0 } }))}
              />
            </Field>
            {isInvestment(s.account.type) && (
              <Field label={`${s.account.name} · total versé`} htmlFor={`inv-${s.account.id}`}>
                <AmountInput
                  id={`inv-${s.account.id}`}
                  value={values[s.account.id]?.invested ?? 0}
                  onChange={(v) => setValues((x) => ({ ...x, [s.account.id]: { ...x[s.account.id], invested: v ?? 0 } }))}
                />
              </Field>
            )}
          </div>
        ))}
        <Button full onClick={save}>Enregistrer</Button>
      </Sheet>
    </Page>
  );
}
