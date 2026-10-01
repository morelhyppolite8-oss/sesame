import { formatDate } from '../engine/dates';
import type { Account, Transfer } from '../engine/types';
import { useData } from '../state/data';
import { Amount } from './Amount';

/** « le Livret A », « l’assurance-vie », « Revolut ». */
export function withArticle(account: Account | undefined): string {
  if (!account) return 'un compte supprimé';
  const n = account.name;
  if (account.type === 'av' && /^assurance/i.test(n)) return `l’${n.charAt(0).toLowerCase()}${n.slice(1)}`;
  if (/^(Compte|Livret|LDDS|PEA|CTO)/.test(n)) return `le ${n}`;
  return n;
}

export function TransferLabel({ transfer, showDate = true, showLines = false }: { transfer: Transfer; showDate?: boolean; showLines?: boolean }) {
  const { account } = useData();
  const from = account(transfer.fromAccountId);
  const to = account(transfer.toAccountId);
  const origin = transfer.origin === 'provision' ? 'Provision' : transfer.origin === 'review' ? 'Reliquats' : null;
  const adjustment = transfer.isAdjustment ? (transfer.adjustmentKind ?? 'plus') : null;
  return (
    <div className="min-w-0 flex-1 py-1">
      {adjustment && <p className="eyebrow mb-1 text-gold">Ajustement à régulariser</p>}
      <p className="text-[0.9375rem] text-ink">
        Vire <Amount cents={transfer.amount} compact className="font-medium" />
        {adjustment === 'plus' && ' de plus'}
        {adjustment === 'retour' && ' de retour'} vers {withArticle(to)}
      </p>
      <p className="mt-0.5 text-[0.8125rem] text-muted">
        depuis {withArticle(from)}
        {showDate && <> · {formatDate(transfer.date)}</>}
        {origin && <> · {origin}</>}
      </p>
      {showLines && transfer.lines.length > 0 && (
        <ul className="mt-2 space-y-1">
          {transfer.lines.map((l, i) => (
            <li key={i} className="flex justify-between gap-3 text-[0.8125rem] text-muted">
              <span className="truncate">{l.label}</span>
              <Amount cents={l.amount} compact />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
