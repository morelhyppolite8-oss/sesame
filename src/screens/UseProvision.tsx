import { useState } from 'react';
import { addProvisionUse } from '../db/actions';
import { formatEUR } from '../engine/money';
import type { Cents } from '../engine/types';
import { useData } from '../state/data';
import { haptic } from '../state/haptics';
import { navigate } from '../state/router';
import { provisionsView } from '../state/selectors';
import { useUI } from '../state/ui';
import { Amount } from '../ui/Amount';
import { AmountInput } from '../ui/AmountInput';
import { Button, Card, EmptyState, Field, GoldLine, Page, PageHeader, Select, TextInput } from '../ui/kit';
import { withArticle } from '../ui/TransferLabel';

export default function UseProvision({ query }: { query: URLSearchParams }) {
  const data = useData();
  const { toast } = useUI();
  const provisions = provisionsView(data);
  const [envId, setEnvId] = useState(query.get('env') ?? provisions[0]?.envelope.id ?? '');
  const [amount, setAmount] = useState<Cents | null>(null);
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(data.today);
  const [done, setDone] = useState<{ amount: Cents; from: string; to: string } | null>(null);
  const selected = provisions.find((p) => p.envelope.id === envId);
  const from = selected?.envelope.accountId ?? data.snap.accounts.find((a) => a.type === 'ldds')?.id ?? data.snap.accounts[0]?.id ?? '';
  const defaultTo = selected?.envelope.spendAccountId ?? data.snap.accounts.find((a) => a.type === 'revolut')?.id ?? data.snap.accounts[0]?.id ?? '';
  const [to, setTo] = useState<string | null>(null);
  const toAccount = to ?? defaultTo;
  const tooMuch = selected && amount !== null && amount > selected.balance;

  if (provisions.length === 0) {
    return (
      <Page>
        <PageHeader title="Utiliser une provision" back backTo="/provisions" />
        <Card><EmptyState icon="umbrella" title="Aucune provision" body="Crée d’abord une enveloppe de type provision dans les Réglages." /></Card>
      </Page>
    );
  }

  if (done) {
    return (
      <Page>
        <PageHeader title="C’est noté" back backTo="/provisions" />
        <Card className="text-center">
          <GoldLine />
          <p className="mt-4 text-sm text-muted">Il te reste un virement à faire :</p>
          <p className="mt-3 font-serif text-3xl text-ink">
            Vire <Amount cents={done.amount} compact /> depuis {withArticle(data.account(done.from))} vers {withArticle(data.account(done.to))}
          </p>
          <p className="mt-3 text-sm text-muted">
            Solde de la provision : <Amount cents={selected?.balance ?? 0} compact className="text-ink" />
          </p>
        </Card>
        <div className="mt-6 grid gap-3">
          <Button full onClick={() => navigate('/virements', { replace: true })}>Voir mes virements</Button>
          <Button variant="secondary" full onClick={() => navigate('/provisions', { replace: true })}>Retour aux provisions</Button>
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader eyebrow="Provision" title="Utiliser" back backTo="/provisions" />
      <Card>
        <Field label="Provision" htmlFor="env">
          <Select id="env" value={envId} onChange={(e) => setEnvId(e.target.value)}>
            {provisions.map((p) => (
              <option key={p.envelope.id} value={p.envelope.id}>
                {p.envelope.name} · {formatEUR(p.balance, { compact: true })}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Montant" htmlFor="amount">
          <AmountInput id="amount" value={amount} onChange={setAmount} allowEmpty />
        </Field>
        {tooMuch && (
          <p className="-mt-2 mb-4 text-xs text-negative">
            C’est plus que le solde disponible (<Amount cents={selected!.balance} compact />). Tu peux quand même l’enregistrer : la provision passera en négatif.
          </p>
        )}
        <Field label="Motif" htmlFor="reason">
          <TextInput id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Billets de train, manteau d’hiver…" />
        </Field>
        <Field label="Date" htmlFor="date">
          <TextInput id="date" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </Field>
        <Field label="Vers le compte" htmlFor="to" hint={`Le virement partira ${withArticle(data.account(from)).replace(/^le /, 'du ').replace(/^l’/, 'de l’')}.`}>
          <Select id="to" value={toAccount} onChange={(e) => setTo(e.target.value)}>
            {data.snap.accounts.filter((a) => !a.archived && a.id !== from).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </Field>
      </Card>
      <div className="mt-6">
        <Button
          full
          disabled={!amount || amount <= 0 || !selected}
          onClick={async () => {
            if (!amount || !selected) return;
            await addProvisionUse({ envelopeId: selected.envelope.id, amount, date, reason: reason.trim(), fromAccountId: from, toAccountId: toAccount });
            haptic('success');
            toast('Utilisation enregistrée.');
            setDone({ amount, from, to: toAccount });
          }}
        >
          Enregistrer
        </Button>
      </div>
    </Page>
  );
}
