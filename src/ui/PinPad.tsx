import { motion, useAnimationControls } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

export const PIN_LENGTH = 4;

export function PinDots({ length, error }: { length: number; error?: boolean }) {
  const controls = useAnimationControls();
  useEffect(() => {
    if (error) controls.start({ x: [0, -10, 10, -6, 6, 0], transition: { duration: 0.4 } });
  }, [error, controls]);
  return (
    <motion.div animate={controls} className="flex justify-center gap-5" aria-hidden="true">
      {Array.from({ length: PIN_LENGTH }, (_, i) => (
        <span
          key={i}
          className={`h-3 w-3 rounded-full border transition ${i < length ? 'border-gold bg-gold' : 'border-line-strong'} ${error ? 'border-negative bg-negative' : ''}`}
        />
      ))}
    </motion.div>
  );
}

export function PinPad({ onDigit, onBack, disabled }: { onDigit: (d: string) => void; onBack: () => void; disabled?: boolean }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (disabled) return;
      if (/^\d$/.test(e.key)) onDigit(e.key);
      if (e.key === 'Backspace') onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDigit, onBack, disabled]);
  return (
    <div className="mx-auto grid max-w-[18rem] grid-cols-3 gap-x-6 gap-y-3" role="group" aria-label="Clavier du code">
      {keys.map((k, i) =>
        k === '' ? (
          <span key={i} />
        ) : (
          <button
            key={i}
            type="button"
            disabled={disabled}
            aria-label={k === 'back' ? 'Effacer' : k}
            onClick={() => (k === 'back' ? onBack() : onDigit(k))}
            className={`mx-auto flex h-18 w-18 items-center justify-center rounded-full font-serif text-[2rem] text-ink transition active:scale-95 active:bg-raised ${k === 'back' ? '' : 'border border-line'}`}
          >
            {k === 'back' ? <Icon name="backspace" size={24} className="text-muted" /> : k}
          </button>
        ),
      )}
    </div>
  );
}

/**
 * Saisie du code : accumulée dans une référence pour ne perdre aucun chiffre lors d'appuis rapides.
 * `onComplete` reçoit le code complet ; il renvoie éventuellement une promesse.
 */
export function usePinEntry(onComplete: (pin: string) => void | Promise<void>) {
  const ref = useRef('');
  const busy = useRef(false);
  const [length, setLength] = useState(0);
  const set = (value: string) => {
    ref.current = value;
    setLength(value.length);
  };
  const push = useCallback(
    async (digit: string) => {
      if (busy.current || ref.current.length >= PIN_LENGTH) return;
      set(ref.current + digit);
      if (ref.current.length === PIN_LENGTH) {
        busy.current = true;
        try {
          await onComplete(ref.current);
        } finally {
          busy.current = false;
        }
      }
    },
    [onComplete],
  );
  const pop = useCallback(() => set(ref.current.slice(0, -1)), []);
  const reset = useCallback(() => set(''), []);
  return { length, push, pop, reset };
}
