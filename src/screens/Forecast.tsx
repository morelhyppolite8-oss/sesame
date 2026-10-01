import { useState } from 'react';
import { setDurableIncome } from '../db/actions';
import { addMonths, monthLabel, monthOf, ofMonth } from '../engine/dates';
import { habitualAmount } from '../engine/income';
import { formatEUR } from '../engine/money';
import type { Cents } from '../engine/types';
import { useData } from '../state/data';
import { haptic } from '../state/haptics';
import { forecastView } from '../state/selectors';
import { useUI } from '../state/ui';
import { Amount } from '../ui/Amount';
import { AmountInput } from '../ui/AmountInput';
import { DataTable, ForecastChart } from '../ui/charts';
import { Icon } from '../ui/Icon';
import { IncomeMonthEditor } from '../ui/IncomeMonthEditor';
import { Button, Card, Field, Page, PageHeader, SectionTitle, Select, Sheet } from '../ui/kit';
import { PlanBanner, PlanItems, WhatIf } from '../ui/PlanCard';

const SHORT = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc'];
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function DurableChange({ onDone }: { onDone: () => void }) {
  const data = useData();
  const { toast } = useUI();
  const incomes = data.snap.incomes.filter((i) => !i.archived);
  const current = monthOf(data.today);
  const [incomeId, setIncomeId] = useState(incomes.find((i) => i.id === 'salaire')?.id ?? incomes[0]?.id ?? '');
  const income = incomes.find((i) => i.id === incomeId);
  const [from, setFrom] = useState(addMonths(current, 1));
  const [amount, setAmount] = useState<Cents | null>(income ? habitualAmount(income, from) : null);
  const months = Array.from({ length: 24 }, (_, k) => addMonths(current, k - 1));
  return (
    <>
      <p className="mb-4 text-sm leading-relaxed text-muted">
        Un nouveau montant habituel à partir d’un mois choisi : augmentation en 2e année, nouveau contrat… Les mois précédents ne changent pas, et les exceptions déjà saisies restent prioritaires.
      </p>
      <Field label="Revenu" htmlFor="durable-income">
        <Select id="durable-income" value={incomeId} onChange={(e) => { setIncomeId(e.target.value); const i = incomes.find((x) => x.id === e.target.value); setAmount(i ? habitualAmount(i, from) : null); }}>
          {incomes.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="À partir de" htmlFor="durable-from">
        <Select id="durable-from" value={from} onChange={(e) => setFrom(e.target.value)}>
          {months.map((m) => (
            <option key={m} value={m}>{capitalize(monthLabel(m))}</option>
          ))}
        </Select>
      </Field>
      <Field label="Nouveau montant habituel (par mois)" htmlFor="durable-amount" hint={income ? `Actuellement ${formatEUR(habitualAmount(income, from) ?? 0, { compact: true })} ${ofMonth(from)}.` : undefined}>
        <AmountInput id="durable-amount" value={amount} onChange={setAmount} />
      </Field>
      <Button
        full
        disabled={amount === null || !income}
        onClick={async () => {
          if (amount === null) return;
          await setDurableIncome(incomeId, from, amount);
          haptic('success');
          toast(`${income?.name} : ${formatEUR(amount, { compact: true })} à partir ${ofMonth(from)}.`);
          onDone();
        }}
      >
        Enregistrer le changement
      </Button>
    </>
  );
}

export default function Forecast({ query }: { query: URLSearchParams }) {
  const data = useData();
  const months = forecastView(data);
  const [selected, setSelected] = useState<string | null>(query.get('mois'));
  const [durable, setDurable] = useState(false);
  const [whatIf, setWhatIf] = useState<string | null>(null);
  const normal = months[0]?.plan.normal ?? 0;
  const tight = months.filter((m) => m.plan.status === 'serre');
  const detail = months.find((m) => m.month === selected);
  const selectedPlan = detail?.plan;

  return (
    <Page>
      <PageHeader eyebrow="12 mois glissants" title="Prévisions" back backTo="/mois" />

      <Card>
        <p className="text-sm leading-relaxed text-muted">
          {tight.length === 0
            ? 'Aucun mois serré en vue : ton budget normal est couvert sur les douze prochains mois.'
            : `${tight.length} mois serré${tight.length > 1 ? 's' : ''} en vue. Le budget s’y adaptera tout seul, en protégeant l’essentiel.`}
        </p>
        <div className="mt-4">
          <ForecastChart
            normal={normal}
            onSelect={setSelected}
            data={months.map((m) => ({ month: m.month, label: SHORT[Number(m.month.slice(5, 7)) - 1], value: m.plan.planned, tight: m.plan.status === 'serre' }))}
          />
          <p className="mt-2 flex items-center gap-2 text-xs text-muted">
            <span className="h-px w-5 bg-gold" aria-hidden="true" /> Budget normal · <Amount cents={normal} compact />
            <span className="ml-2 h-2.5 w-2.5 rounded-sm bg-gold/40" aria-hidden="true" /> Mois serré
          </p>
          <DataTable caption="Revenu prévu par mois" columns={['Mois', 'Revenu prévu', 'Budget normal']} rows={months.map((m) => [monthLabel(m.month), m.plan.planned, m.plan.normal])} />
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button icon="transfer" onClick={() => setDurable(true)}>Changement durable</Button>
        <Button variant="secondary" onClick={() => setWhatIf(monthOf(data.today))}>Et si je reçois…</Button>
      </div>

      <SectionTitle>Mois par mois</SectionTitle>
      <Card className="divide-y divide-line py-0">
        {months.map((m) => (
          <button
            key={m.month}
            type="button"
            onClick={() => setSelected(m.month)}
            className="flex min-h-16 w-full items-center gap-3 py-3 text-left"
            aria-label={`${monthLabel(m.month)} : ${formatEUR(m.plan.planned, { compact: true })} prévus${m.hasException ? ', avec une exception' : ''}`}
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[0.9375rem] text-ink">
                {capitalize(monthLabel(m.month))}
                {m.hasException && <Icon name="sparkle" size={14} className="text-gold" />}
              </span>
              <span className="mt-1 block"><PlanBanner plan={m.plan} /></span>
            </span>
            <Amount cents={m.plan.planned} compact className="font-serif text-xl text-ink" />
            <Icon name="chevronRight" size={16} className="text-faint" />
          </button>
        ))}
      </Card>

      <Sheet open={detail !== undefined} onClose={() => setSelected(null)} title={detail ? capitalize(monthLabel(detail.month)) : ''}>
        {detail && selectedPlan && (
          <>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <PlanBanner plan={selectedPlan} />
              <span className="text-sm text-muted"><Amount cents={selectedPlan.planned} compact className="text-ink" /> prévus</span>
            </div>
            <IncomeMonthEditor month={detail.month} />
            <p className="eyebrow mt-4 mb-1">Budget adapté</p>
            <PlanItems plan={selectedPlan} />
            <div className="mt-4">
              <Button variant="secondary" full onClick={() => { setWhatIf(detail.month); setSelected(null); }}>Et si je reçois…</Button>
            </div>
          </>
        )}
      </Sheet>
      <Sheet open={durable} onClose={() => setDurable(false)} title="Changement durable">
        {durable && <DurableChange onDone={() => setDurable(false)} />}
      </Sheet>
      <Sheet open={whatIf !== null} onClose={() => setWhatIf(null)} title={whatIf ? `Et si je reçois… (${monthLabel(whatIf, false)})` : ''}>
        {whatIf && <WhatIf month={whatIf} />}
      </Sheet>
    </Page>
  );
}
