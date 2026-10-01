import { useCallback, useState } from 'react';
import { resetAll } from '../db/actions';
import { useData } from '../state/data';
import { haptic } from '../state/haptics';
import { verifyPin } from '../state/security';
import { Monogram } from '../ui/Monogram';
import { Button, Sheet } from '../ui/kit';
import { PinDots, PinPad, usePinEntry } from '../ui/PinPad';

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { snap } = useData();
  const [error, setError] = useState(false);
  const [forgot, setForgot] = useState(false);

  const check = useCallback(
    async (pin: string) => {
      setError(false);
      const ok = await verifyPin(pin, snap.settings.pinHash!, snap.settings.pinSalt!);
      if (ok) {
        haptic('success');
        onUnlock();
      } else {
        setError(true);
        haptic();
        await new Promise((r) => setTimeout(r, 400));
        entry.reset();
      }
    },
    [snap.settings.pinHash, snap.settings.pinSalt, onUnlock],
  );
  const entry = usePinEntry(check);

  return (
    <main className="safe-top flex min-h-dvh flex-col items-center justify-between px-6 pb-10">
      <div className="mt-16 flex flex-col items-center text-center">
        <Monogram size={56} />
        <h1 className="mt-6 font-serif text-3xl text-ink">Bon retour</h1>
        <p className="mt-2 text-sm text-muted" role="status" aria-live="polite">
          {error ? 'Ce n’est pas le bon code. Réessaie.' : 'Saisis ton code pour continuer.'}
        </p>
        <div className="mt-8">
          <PinDots length={entry.length} error={error} />
        </div>
      </div>
      <div className="w-full">
        <PinPad onDigit={(d) => { setError(false); entry.push(d); }} onBack={entry.pop} />
        <button type="button" onClick={() => setForgot(true)} className="mx-auto mt-6 block min-h-11 text-sm text-muted underline-offset-4 hover:underline">
          Code oublié ?
        </button>
      </div>
      <Sheet open={forgot} onClose={() => setForgot(false)} title="Code oublié">
        <p className="mb-6 text-[0.9375rem] leading-relaxed text-muted">
          Le code ne quitte jamais ton téléphone et ne peut pas être récupéré. La seule issue est de réinitialiser l’appli, puis de restaurer ta dernière sauvegarde depuis les Réglages.
        </p>
        <div className="grid gap-3">
          <Button variant="danger" full onClick={() => resetAll().then(() => window.location.reload())}>
            Tout effacer et recommencer
          </Button>
          <Button variant="secondary" full onClick={() => setForgot(false)}>
            Annuler
          </Button>
        </div>
      </Sheet>
    </main>
  );
}
