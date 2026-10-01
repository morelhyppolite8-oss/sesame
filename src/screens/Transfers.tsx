import { AnimatePresence, motion } from 'framer-motion';
import { setTransferDone, setTransfersDone } from '../db/actions';
import { formatEUR } from '../engine/money';
import { useData } from '../state/data';
import { haptic } from '../state/haptics';
import { pendingTransfers } from '../state/selectors';
import { Amount } from '../ui/Amount';
import { Button, Card, CheckCircle, EmptyState, GoldLine, Page, PageHeader, SectionTitle } from '../ui/kit';
import { TransferLabel } from '../ui/TransferLabel';

export default function Transfers() {
  const data = useData();
  const pending = pendingTransfers(data);
  const done = data.snap.transfers
    .filter((t) => t.done)
    .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''))
    .slice(0, 15);
  const total = pending.reduce((a, t) => a + t.amount, 0);

  return (
    <Page>
      <PageHeader eyebrow="À faire" title="Virements" back backTo="/mois" />

      {pending.length === 0 ? (
        <Card>
          <GoldLine className="mb-2" />
          <EmptyState icon="check" title="Tout est à jour" body="Aucun virement en attente. Chaque euro est à sa place." />
        </Card>
      ) : (
        <>
          <Card className="mb-4 flex items-center justify-between">
            <div>
              <p className="eyebrow">En attente</p>
              <p className="mt-2 font-serif text-4xl text-ink">
                <Amount cents={total} compact />
              </p>
            </div>
            <p className="text-sm text-muted">
              {pending.length} virement{pending.length > 1 ? 's' : ''}
            </p>
          </Card>
          <Card className="divide-y divide-line py-1">
            <AnimatePresence initial={false}>
              {pending.map((t) => (
                <motion.div
                  key={t.id}
                  layout
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className="flex items-start gap-2 py-2"
                >
                  <CheckCircle
                    checked={false}
                    label={`Marquer comme fait : ${formatEUR(t.amount, { compact: true })} vers ${data.accountName(t.toAccountId)}`}
                    onChange={() => {
                      haptic('success');
                      setTransferDone(t.id, true);
                    }}
                  />
                  <TransferLabel transfer={t} showLines />
                </motion.div>
              ))}
            </AnimatePresence>
          </Card>
          {pending.length > 1 && (
            <div className="mt-4">
              <Button
                variant="secondary"
                full
                icon="check"
                onClick={() => {
                  haptic('success');
                  setTransfersDone(pending.map((t) => t.id));
                }}
              >
                Tout marquer comme fait
              </Button>
            </div>
          )}
        </>
      )}

      {done.length > 0 && (
        <>
          <SectionTitle>Faits récemment</SectionTitle>
          <Card className="divide-y divide-line py-1">
            {done.map((t) => (
              <div key={t.id} className="flex items-start gap-2 py-2">
                <CheckCircle checked label={`Décocher : ${formatEUR(t.amount, { compact: true })} vers ${data.accountName(t.toAccountId)}`} onChange={() => setTransferDone(t.id, false)} />
                <TransferLabel transfer={t} />
              </div>
            ))}
          </Card>
        </>
      )}
    </Page>
  );
}
