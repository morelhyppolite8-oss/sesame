import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { addReceipt, deleteReceipt, updateReceipt } from '../db/actions';
import { addMonths, formatDate, monthLabel, monthOf } from '../engine/dates';
import { suggestIncome } from '../engine/income';
import { formatEUR } from '../engine/money';
import { useData } from '../state/data';
import { haptic } from '../state/haptics';
import { goBack, navigate } from '../state/router';
import { useUI } from '../state/ui';
import { Icon } from '../ui/Icon';
import { applyKey, Keypad, keypadToCents } from '../ui/Keypad';
import { Button, IconButton, inputClass, Sheet } from '../ui/kit';

const OTHER = '__autre__';

export default function NewIncome({ query }: { query: URLSearchParams }) {
  const data = useData();
  const { toast } = useUI();
  const editing = data.snap.receipts.find((r) => r.id === query.get('edit'));
  const [text, setText] = useState(() => (editing ? formatEUR(editing.amount).replace(/[\s  €]/g, '').replace(/,00$/, '') : ''));
  const [date, setDate] = useState(editing?.date ?? data.today);
  const [monthOverride, setMonthOverride] = useState<string | null>(editing && editing.month !== monthOf(editing.date) ? editing.month : null);
  const [source, setSource] = useState<string | null>(editing ? editing.incomeId ?? OTHER : query.get('source'));
  const [otherLabel, setOtherLabel] = useState(editing && !editing.incomeId ? editing.source : '');
  const [note, setNote] = useState(editing?.note ?? '');
  const [details, setDetails] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const cents = keypadToCents(text);
  const month = monthOverride ?? monthOf(date);

  const others = data.snap.receipts.filter((r) => r.id !== editing?.id);
  const suggestions = useMemo(() => suggestIncome(data.snap.incomes, others, cents, date), [data.snap.incomes, others, cents, date]);
  const selected = source ?? suggestions[0]?.id ?? OTHER;
  const income = data.snap.incomes.find((i) => i.id === selected);
  const defaultAccount = data.snap.accounts.find((a) => a.type === 'courant')?.id ?? data.snap.accounts[0]?.id;
  const [accountId, setAccountId] = useState<string | null>(editing?.accountId ?? null);
  const receiving = accountId ?? income?.accountId ?? defaultAccount;

  const submit = async () => {
    if (cents <= 0 || busy) return;
    if (selected === OTHER && !otherLabel.trim()) {
      setDetails(true);
      toast('Donne un nom à cette source.');
      return;
    }
    setBusy(true);
    const input = {
      amount: cents,
      date,
      month,
      source: income?.name ?? otherLabel.trim(),
      incomeId: income?.id,
      accountId: receiving,
      ...(note.trim() ? { note: note.trim() } : { note: undefined }),
    };
    haptic('success');
    if (editing) {
      await updateReceipt(editing.id, input);
      toast('Encaissement modifié. Le mois est recalculé.');
      goBack(`/mois/${month}`);
    } else {
      const id = await addReceipt(input);
      navigate(`/repartition/${id}`, { replace: true });
    }
  };

  const months = [addMonths(monthOf(date), -1), monthOf(date), addMonths(monthOf(date), 1)];

  return (
    <main className="safe-top mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-[max(env(safe-area-inset-bottom),1rem)]">
      <header className="flex items-center justify-between pt-2">
        <IconButton icon="x" label="Fermer" className="-ml-3" onClick={() => goBack('/')} />
        <h1 className="text-[0.9375rem] font-medium text-ink">{editing ? 'Modifier l’encaissement' : 'Nouvel encaissement'}</h1>
        {editing ? (
          <IconButton icon="trash" label="Supprimer l’encaissement" className="-mr-3" onClick={() => setConfirmDelete(true)} />
        ) : (
          <span className="w-11" />
        )}
      </header>

      <div className="flex flex-1 flex-col justify-center py-4 text-center">
        <p className="eyebrow">Montant reçu</p>
        <motion.p layoutId="income-amount" className="amount mt-2 font-serif text-[3.75rem] leading-none text-ink tabular" aria-live="polite">
          {text === '' ? <span className="text-faint">0 €</span> : `${text.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} €`}
        </motion.p>
      </div>

      <div className="-mx-5 mb-3 flex gap-2 overflow-x-auto px-5 pb-1 scrollbar-none" role="radiogroup" aria-label="Source">
        {[...suggestions.map((i) => ({ id: i.id, name: i.name })), { id: OTHER, name: 'Autre' }].map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={selected === s.id}
            onClick={() => {
              setSource(s.id);
              if (s.id === OTHER) setDetails(true);
            }}
            className={`min-h-11 shrink-0 rounded-full border px-4 text-sm transition ${selected === s.id ? 'border-gold bg-gold-soft text-gold' : 'border-line-strong text-muted'}`}
          >
            {s.id === OTHER && otherLabel ? otherLabel : s.name}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setDetails(true)}
        className="mb-3 flex min-h-11 items-center justify-center gap-2 text-sm text-muted"
      >
        <Icon name="month" size={16} />
        <span className="truncate">
          {formatDate(date)} · budget {monthLabel(month, false)} · {data.accountName(receiving)}
        </span>
        <Icon name="chevronDown" size={14} />
      </button>

      <Keypad
        onKey={(k) => {
          haptic();
          setText((t) => applyKey(t, k));
        }}
      />

      <div className="mt-4">
        <Button full disabled={cents <= 0 || busy} onClick={submit}>
          {editing ? 'Enregistrer' : 'Répartir'}
          {!editing && <Icon name="arrowRight" size={18} />}
        </Button>
      </div>

      <Sheet open={details} onClose={() => setDetails(false)} title="Détails">
        {selected === OTHER && (
          <div className="mb-4">
            <label htmlFor="other" className="mb-1.5 block text-[0.8125rem] text-muted">Nom de la source</label>
            <input id="other" className={inputClass} value={otherLabel} placeholder="Remboursement, cadeau…" onChange={(e) => setOtherLabel(e.target.value)} />
          </div>
        )}
        <div className="mb-4">
          <label htmlFor="date" className="mb-1.5 block text-[0.8125rem] text-muted">Date de réception</label>
          <input id="date" type="date" className={inputClass} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </div>
        <div className="mb-4">
          <p className="mb-1.5 text-[0.8125rem] text-muted">Mois budgétaire</p>
          <div className="flex gap-2" role="radiogroup" aria-label="Mois budgétaire">
            {months.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={month === m}
                onClick={() => setMonthOverride(m === monthOf(date) ? null : m)}
                className={`min-h-11 flex-1 rounded-full border px-2 text-sm capitalize transition ${month === m ? 'border-gold bg-gold-soft text-gold' : 'border-line-strong text-muted'}`}
              >
                {monthLabel(m, false)}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-faint">Par défaut, le mois de la date de réception.</p>
        </div>
        <div className="mb-4">
          <label htmlFor="account" className="mb-1.5 block text-[0.8125rem] text-muted">Arrive sur</label>
          <select id="account" className={inputClass} value={receiving} onChange={(e) => setAccountId(e.target.value)}>
            {data.snap.accounts.filter((a) => !a.archived).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div className="mb-6">
          <label htmlFor="note" className="mb-1.5 block text-[0.8125rem] text-muted">Note (facultatif)</label>
          <input id="note" className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Prime, remboursement…" />
        </div>
        <Button full onClick={() => setDetails(false)}>Valider</Button>
      </Sheet>

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Supprimer ?">
        <p className="mb-6 text-[0.9375rem] leading-relaxed text-muted">
          Le mois sera recalculé dans l’ordre chronologique. Si des virements étaient déjà faits, l’appli te proposera les ajustements nécessaires.
        </p>
        <div className="grid gap-3">
          <Button
            variant="danger"
            full
            onClick={async () => {
              if (!editing) return;
              await deleteReceipt(editing.id);
              toast('Encaissement supprimé.');
              navigate(`/mois/${editing.month}`, { replace: true });
            }}
          >
            Supprimer l’encaissement
          </Button>
          <Button variant="secondary" full onClick={() => setConfirmDelete(false)}>Annuler</Button>
        </div>
      </Sheet>
    </main>
  );
}
