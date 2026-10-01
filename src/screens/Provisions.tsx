import { useState } from 'react';
import { deleteProvisionUse } from '../db/actions';
import { formatDate } from '../engine/dates';
import { useData } from '../state/data';
import { navigate } from '../state/router';
import { provisionsView } from '../state/selectors';
import { useUI } from '../state/ui';
import { Amount } from '../ui/Amount';
import { Button, Card, EmptyState, IconButton, Page, PageHeader, SectionTitle, Sheet } from '../ui/kit';

export default function Provisions() {
  const data = useData();
  const { toast } = useUI();
  const provisions = provisionsView(data);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const total = provisions.reduce((a, p) => a + p.balance, 0);
  const history = provisions.flatMap((p) => p.uses.map((u) => ({ ...u, envelope: p.envelope }))).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Page>
      <PageHeader eyebrow="Mis de côté" title="Provisions" back backTo="/objectifs" />

      <Card>
        <p className="eyebrow">Total des provisions</p>
        <p className="mt-3 font-serif text-5xl text-ink"><Amount cents={total} compact animated /></p>
        <p className="mt-2 text-sm text-muted">Elles cumulent d’un mois sur l’autre, prêtes quand la dépense arrive.</p>
      </Card>

      <SectionTitle>Soldes</SectionTitle>
      {provisions.length === 0 ? (
        <Card>
          <EmptyState icon="umbrella" title="Aucune provision" body="Crée une enveloppe de type provision dans les Réglages pour préparer les grosses dépenses." />
        </Card>
      ) : (
        <div className="space-y-3">
          {provisions.map(({ envelope, balance }) => (
            <Card key={envelope.id} className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-serif text-xl text-ink">{envelope.name}</p>
                <p className="mt-0.5 text-xs text-muted">
                  +<Amount cents={envelope.target} compact /> par mois · {data.accountName(envelope.accountId)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-serif text-2xl text-ink"><Amount cents={balance} compact animated /></p>
                <button type="button" onClick={() => navigate(`/provisions/utiliser?env=${envelope.id}`)} className="mt-1 min-h-11 text-sm text-gold">
                  Utiliser
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-5">
        <Button full icon="umbrella" onClick={() => navigate('/provisions/utiliser')}>Utiliser une provision</Button>
      </div>

      <SectionTitle>Historique</SectionTitle>
      <Card className="divide-y divide-line py-1">
        {history.length === 0 ? (
          <EmptyState icon="review" title="Pas encore d’utilisation" body="Quand tu piocheras dans une provision, chaque utilisation sera gardée ici." />
        ) : (
          history.map((u) => (
            <div key={u.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.9375rem] text-ink">{u.reason || 'Utilisation'}</p>
                <p className="text-xs text-muted">{u.envelope.name} · {formatDate(u.date)} · {data.accountName(u.fromAccountId)} → {data.accountName(u.toAccountId)}</p>
              </div>
              <Amount cents={-u.amount} compact className="text-ink" />
              <IconButton icon="trash" label={`Supprimer l’utilisation ${u.reason}`} className="-mr-2" onClick={() => setToDelete(u.id)} />
            </div>
          ))
        )}
      </Card>

      <Sheet open={toDelete !== null} onClose={() => setToDelete(null)} title="Supprimer l’utilisation ?">
        <p className="mb-6 text-sm leading-relaxed text-muted">Le solde de la provision sera rétabli. Si le virement était déjà fait, un virement retour te sera proposé.</p>
        <div className="grid gap-3">
          <Button variant="danger" full onClick={async () => { if (toDelete) await deleteProvisionUse(toDelete); setToDelete(null); toast('Utilisation supprimée.'); }}>Supprimer</Button>
          <Button variant="secondary" full onClick={() => setToDelete(null)}>Annuler</Button>
        </div>
      </Sheet>
    </Page>
  );
}
