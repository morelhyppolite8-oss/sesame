import { initialOf } from '../engine/subscriptions';
import type { Subscription } from '../engine/types';

/** Pastille d'un abonnement : sa couleur et son initiale (ou son emoji). */
export function SubscriptionIcon({ sub, size = 36 }: { sub: Pick<Subscription, 'name' | 'icon' | 'color'>; size?: number }) {
  const text = initialOf(sub);
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full font-serif font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: size * (text.length > 1 ? 0.36 : 0.5),
        background: `color-mix(in oklab, ${sub.color} 22%, transparent)`,
        color: `color-mix(in oklab, ${sub.color} 62%, var(--ink))`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${sub.color} 55%, transparent)`,
      }}
    >
      {text}
    </span>
  );
}
