import { useMemo, useRef, useState } from 'react';
import { deleteBankMonth, recategorize, saveBankTransactions } from '../db/actions';
import { formatDate, monthLabel, monthOf, ofMonth } from '../engine/dates';
import { categorize, parseRevolutCsv, spendingByEnvelope, type BankTransaction } from '../engine/revolutCsv';
import { useData } from '../state/data';
import { haptic } from '../state/haptics';
import { navigate } from '../state/router';
import { useUI } from '../state/ui';
import { Amount } from '../ui/Amount';
import { Button, Card, EmptyState, Page, PageHeader, SectionTitle, Select } from '../ui/kit';

export default function RevolutImport({ query }: { query: URLSearchParams }) {
  const data = useData();
  const { toast } = useUI();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const months = [...new Set(data.snap.bankTransactions.map((t) => t.month))].sort().reverse();
  const [month, setMonth] = useState(query.get('month') ?? months[0] ?? monthOf(data.today));
  const envelopes = data.snap.envelopes.filter((e) => !e.archived && e.kind !== 'epargne');
  const txs = data.snap.bankTransactions.filter((t) => t.month === month).sort((a, b) => b.date.localeCompare(a.date));
  const totals = useMemo(() => spendingByEnvelope(data.snap.bankTransactions, month), [data.snap.bankTransactions, month]);
  const uncategorized = txs.filter((t) => !t.envelopeId);

  const onFile = async (file: File) => {
    setError(null);
    try {
      const parsed = parseRevolutCsv(await file.text());
      if (parsed.length === 0) throw new Error('Aucune dépense trouvée dans ce relevé.');
      const existing = new Map(data.snap.bankTransactions.map((t) => [t.id, t]));
      const result: BankTransaction[] = parsed.map((t) => {
        const known = existing.get(t.id);
        if (known) return known;
        const c = categorize(t.description, data.snap.csvRules, envelopes);
        return { ...t, envelopeId: c.envelopeId, categorizedBy: c.by };
      });
      await saveBankTransactions(result);
      const counts = new Map<string, number>();
      for (const t of parsed) counts.set(t.month, (counts.get(t.month) ?? 0) + 1);
      const main = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      setMonth(main);
      haptic('success');
      toast(`${parsed.length} dépenses importées.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import impossible.');
    }
  };

  return (
    <Page>
      <PageHeader eyebrow="Relevé" title="Import Revolut" back backTo="/reglages" />

      <Card>
        <p className="text-sm leading-relaxed text-muted">
          Dans Revolut : <span className="text-ink">Compte → Relevé → Excel/CSV</span>. Les dépenses sont rangées automatiquement dans tes enveloppes ; corrige une catégorie, l’appli retiendra la règle.
        </p>
        <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" id="csv" aria-label="Fichier CSV Revolut" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <div className="mt-4">
          <Button full icon="upload" onClick={() => input.current?.click()}>Choisir un fichier CSV</Button>
        </div>
        {error && <p className="mt-3 text-sm text-negative" role="alert">{error}</p>}
      </Card>

      {months.length > 0 && (
        <>
          <SectionTitle>Mois importé</SectionTitle>
          <Select aria-label="Mois" value={month} onChange={(e) => setMonth(e.target.value)}>
            {[...new Set([month, ...months])].map((m) => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
          </Select>
        </>
      )}

      {txs.length === 0 ? (
        <Card className="mt-6">
          <EmptyState icon="file" title="Aucune dépense importée" body={`Rien pour ${monthLabel(month)}. Importe ton relevé pour préremplir la revue.`} />
        </Card>
      ) : (
        <>
          <SectionTitle>Par enveloppe</SectionTitle>
          <Card className="divide-y divide-line py-1">
            {envelopes.filter((e) => totals[e.id]).map((e) => (
              <div key={e.id} className="flex justify-between py-3 text-[0.9375rem]">
                <span className="text-ink">{e.name}</span>
                <Amount cents={totals[e.id]} className="text-ink" />
              </div>
            ))}
            {uncategorized.length > 0 && (
              <div className="flex justify-between py-3 text-[0.9375rem]">
                <span className="text-gold">À classer ({uncategorized.length})</span>
                <Amount cents={uncategorized.reduce((a, t) => a + t.amount, 0)} className="text-muted" />
              </div>
            )}
          </Card>
          <div className="mt-4 grid gap-3">
            <Button full onClick={() => navigate(`/revue/${month}`)}>Utiliser dans la revue {ofMonth(month)}</Button>
          </div>

          <SectionTitle>Dépenses</SectionTitle>
          <Card className="divide-y divide-line py-1">
            {txs.map((t) => (
              <div key={t.id} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate text-[0.9375rem] text-ink">{t.description}</p>
                  <Amount cents={t.amount} className="shrink-0 text-ink" />
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <span className="w-16 shrink-0 text-xs text-muted">{formatDate(t.date)}</span>
                  <select
                    aria-label={`Enveloppe pour ${t.description}`}
                    value={t.envelopeId ?? ''}
                    onChange={async (e) => {
                      await recategorize(t, e.target.value || null);
                      toast('Catégorie retenue pour la suite.');
                    }}
                    className={`min-h-11 flex-1 rounded-lg border bg-bg px-3 text-sm ${t.envelopeId ? 'border-line-strong text-ink' : 'border-gold/50 text-gold'}`}
                  >
                    <option value="">À classer</option>
                    {envelopes.map((e) => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </Card>
          <div className="mt-4">
            <Button variant="danger" full onClick={async () => { await deleteBankMonth(month); toast('Relevé du mois retiré.'); }}>
              Retirer ce mois
            </Button>
          </div>
        </>
      )}
    </Page>
  );
}
