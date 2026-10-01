import { animate, useReducedMotion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { formatEUR } from '../engine/money';
import type { Cents } from '../engine/types';

interface AmountProps {
  cents: Cents;
  compact?: boolean;
  sign?: boolean;
  className?: string;
  /** Fait défiler le montant depuis sa valeur précédente. */
  animated?: boolean;
  duration?: number;
}

/** Montant formaté fr-FR, flouté en mode discret, avec défilement optionnel. */
export function Amount({ cents, compact, sign, className = '', animated = false, duration = 0.9 }: AmountProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef(animated ? 0 : cents);
  const reduced = useReducedMotion();
  const format = (v: number) => formatEUR(Math.round(v), { compact, sign });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!animated || reduced) {
      node.textContent = format(cents);
      previous.current = cents;
      return;
    }
    const from = previous.current;
    previous.current = cents;
    const controls = animate(from, cents, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        node.textContent = format(compact ? Math.round(v / 100) * 100 : v);
      },
      // La valeur finale est toujours exacte (le défilement compact arrondit à l'euro).
      onComplete: () => {
        node.textContent = format(cents);
      },
    });
    return () => controls.stop();
  }, [cents, animated, compact, sign, reduced, duration]);

  return (
    <span ref={ref} className={`amount tabular whitespace-nowrap ${className}`}>
      {format(animated && !reduced ? previous.current : cents)}
    </span>
  );
}
