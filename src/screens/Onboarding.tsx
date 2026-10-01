import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useRef, useState } from 'react';
import { completeSetup, importBackup } from '../db/actions';
import { monthOf } from '../engine/dates';
import { useData } from '../state/data';
import { haptic } from '../state/haptics';
import { hashPin } from '../state/security';
import { Button } from '../ui/kit';
import { AccountsStep, EnvelopesStep, IncomesStep, SavingsStep, SubscriptionsStep, SummaryStep, type Draft } from './setup/SetupSteps';
import { Monogram } from '../ui/Monogram';
import { PinDots, PinPad, usePinEntry } from '../ui/PinPad';

const ease = [0.22, 1, 0.36, 1] as const;

const STEP_COUNT = 8;

function Steps({ step }: { step: number }) {
  return (
    <div className="flex justify-center gap-1.5">
      <p className="sr-only">Étape {step + 1} sur {STEP_COUNT}</p>
      {Array.from({ length: STEP_COUNT }, (_, i) => i).map((i) => (
        <span key={i} aria-hidden="true" className={`h-px transition-all duration-500 ${i === step ? 'w-10 bg-gold' : 'w-5 bg-line-strong'}`} />
      ))}
    </div>
  );
}

function Welcome({ onNext }: { onNext: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const restore = async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      await importBackup(JSON.parse(await file.text()));
      haptic('success');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ce fichier n’est pas une sauvegarde valide.');
      setBusy(false);
    }
  };
  const principles = [
    ['Chaque euro a un rôle', 'Tu saisis ce que tu reçois, l’appli te dit quels virements faire.'],
    ['Tes règles décident', 'Pas l’humeur du moment. Tu les fixes une fois, elles s’appliquent toujours.'],
    ['Rien ne sort de ton téléphone', 'Aucune connexion bancaire. Elle calcule, tu fais les virements.'],
  ];
  return (
    <div className="flex min-h-[80dvh] flex-col justify-between">
      <div className="pt-10 text-center">
        <div className="flex justify-center">
          <Monogram size={72} />
        </div>
        <p className="eyebrow mt-8">Bienvenue</p>
        <h1 className="mt-3 font-serif text-[2.75rem] leading-[1.05] text-ink">Hyppo Patrimoine</h1>
        <p className="mx-auto mt-4 max-w-xs text-[0.9375rem] leading-relaxed text-muted">
          Le cockpit de ta vie financière. Sobre, précis, et toujours de ton côté.
        </p>
      </div>
      <ul className="my-10 space-y-5">
        {principles.map(([title, body], i) => (
          <motion.li
            key={title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + i * 0.12, duration: 0.6, ease }}
            className="flex gap-4"
          >
            <span className="mt-2 h-px w-6 shrink-0 bg-gold" />
            <span>
              <span className="block font-serif text-lg text-ink">{title}</span>
              <span className="mt-0.5 block text-sm leading-relaxed text-muted">{body}</span>
            </span>
          </motion.li>
        ))}
      </ul>
      <div className="grid gap-3">
        <Button full onClick={onNext}>Commencer</Button>
        <Button variant="secondary" full icon="upload" disabled={busy} onClick={() => input.current?.click()}>
          Importer une sauvegarde JSON
        </Button>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label="Fichier de sauvegarde à importer"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) restore(file);
          }}
        />
        {error && <p className="text-center text-sm text-negative" role="alert">{error}</p>}
        <p className="text-center text-xs text-faint">Pour retrouver tes données d’une autre installation.</p>
      </div>
    </div>
  );
}

function PinStep({ onDone }: { onDone: (pin: string) => void }) {
  const [first, setFirst] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const firstRef = useRef<string | null>(null);
  const complete = useCallback(
    async (pin: string) => {
      if (firstRef.current === null) {
        await new Promise((r) => setTimeout(r, 180));
        firstRef.current = pin;
        setFirst(pin);
        entry.reset();
      } else if (pin === firstRef.current) {
        haptic('success');
        onDone(pin);
      } else {
        setError(true);
        haptic();
        await new Promise((r) => setTimeout(r, 500));
        firstRef.current = null;
        setFirst(null);
        entry.reset();
      }
    },
    [onDone],
  );
  const entry = usePinEntry(complete);
  return (
    <div className="flex min-h-[80dvh] flex-col justify-between">
      <div className="pt-10 text-center">
        <p className="eyebrow">Sécurité</p>
        <h1 className="mt-3 font-serif text-4xl text-ink">{first === null ? 'Choisis ton code' : 'Confirme ton code'}</h1>
        <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-muted" role="status" aria-live="polite">
          {error
            ? 'Les deux codes ne correspondent pas. On recommence.'
            : first === null
              ? 'Quatre chiffres, demandés à chaque ouverture. Il est haché et reste sur ton téléphone.'
              : 'Saisis-le une seconde fois.'}
        </p>
        <div className="mt-10">
          <PinDots length={entry.length} error={error} />
        </div>
      </div>
      <div className="pb-4">
        <PinPad onDigit={(d) => { setError(false); entry.push(d); }} onBack={entry.pop} />
      </div>
    </div>
  );
}

function draftFrom(snap: ReturnType<typeof useData>['snap']): Draft {
  return structuredClone({
    incomes: snap.incomes.filter((i) => !i.archived),
    accounts: snap.accounts.filter((a) => !a.archived),
    balances: Object.fromEntries(snap.accounts.map((a) => [a.id, { value: 0 }])),
    envelopes: snap.envelopes.filter((e) => !e.archived).sort((a, b) => a.priority - b.priority),
    subscriptions: snap.subscriptions,
    goals: snap.goals,
    rules: snap.settings.rules,
  });
}

export function Onboarding() {
  const { snap, today } = useData();
  const [step, setStep] = useState(0);
  const [pin, setPin] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraftState] = useState<Draft>(() => draftFrom(snap));
  const set = useCallback((update: (d: Draft) => Draft) => setDraftState((d) => update(d)), []);
  const month = monthOf(today);
  const next = () => {
    setStep((s) => s + 1);
    window.scrollTo({ top: 0 });
  };
  const back = () => {
    setStep((s) => Math.max(0, s - 1));
    window.scrollTo({ top: 0 });
  };
  const invalid =
    (step === 2 && draft.incomes.some((i) => !i.name.trim())) ||
    (step === 3 && (draft.accounts.length === 0 || draft.accounts.some((a) => !a.name.trim()))) ||
    (step === 4 && (draft.envelopes.length === 0 || draft.envelopes.some((e) => !e.name.trim()))) ||
    (step === 5 && draft.subscriptions.some((s) => !s.name.trim() || s.amount <= 0)) ||
    (step === 6 && draft.goals.some((g) => !g.name.trim() || g.target <= 0));

  const finish = async () => {
    if (!pin) return;
    setBusy(true);
    const { hash, salt } = await hashPin(pin);
    await completeSetup({ pinHash: hash, pinSalt: salt, ...draft });
    haptic('success');
  };

  return (
    <main className="safe-top mx-auto min-h-dvh max-w-md px-6 pb-6">
      <div className="pt-4">
        <Steps step={step} />
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.4, ease }}>
          {step === 0 && <Welcome onNext={next} />}
          {step === 1 && (
            <PinStep
              onDone={(p) => {
                setPin(p);
                next();
              }}
            />
          )}
          {step === 2 && <IncomesStep draft={draft} set={set} />}
          {step === 3 && <AccountsStep draft={draft} set={set} />}
          {step === 4 && <EnvelopesStep draft={draft} set={set} month={month} />}
          {step === 5 && <SubscriptionsStep draft={draft} set={set} today={today} />}
          {step === 6 && <SavingsStep draft={draft} set={set} />}
          {step === 7 && <SummaryStep draft={draft} month={month} />}
        </motion.div>
      </AnimatePresence>
      {step >= 2 && (
        <div className="safe-bottom sticky bottom-0 mt-6 grid grid-cols-[auto_1fr] gap-3 bg-gradient-to-t from-bg via-bg to-transparent pt-6 pb-4">
          <Button variant="secondary" onClick={back} aria-label="Étape précédente">Retour</Button>
          {step < 7 ? (
            <Button full disabled={invalid} onClick={next}>Continuer</Button>
          ) : (
            <Button full disabled={busy} onClick={finish}>C’est parti</Button>
          )}
        </div>
      )}
    </main>
  );
}
