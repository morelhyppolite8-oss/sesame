import { addMonths, monthIndex, monthOf } from './dates';
import type { Cents, Goal, ISODate, Month } from './types';

export interface GoalProgress {
  goal: Goal;
  current: Cents;
  ratio: number;
  remaining: Cents;
  reached: boolean;
  /** Mois d'atteinte estimé au rythme actuel. */
  estimatedMonth?: Month;
  /** Mois restants jusqu'à la date cible, mois en cours inclus. */
  monthsLeft?: number;
  /** Effort mensuel nécessaire pour tenir la date cible, arrondi à l'euro supérieur. */
  requiredMonthly?: Cents;
  onTrack?: boolean;
}

export function goalProgress(goal: Goal, current: Cents, monthlyPace: Cents, today: ISODate): GoalProgress {
  const remaining = Math.max(0, goal.target - current);
  const reached = remaining === 0;
  const ratio = goal.target > 0 ? Math.min(1, Math.max(0, current / goal.target)) : 0;
  const thisMonth = monthOf(today);
  const out: GoalProgress = { goal, current, ratio, remaining, reached };
  if (reached) return out;
  if (monthlyPace > 0) out.estimatedMonth = addMonths(thisMonth, Math.max(0, Math.ceil(remaining / monthlyPace) - 1));
  if (goal.date) {
    const monthsLeft = Math.max(1, monthIndex(monthOf(goal.date)) - monthIndex(thisMonth) + 1);
    out.monthsLeft = monthsLeft;
    out.requiredMonthly = Math.ceil(remaining / monthsLeft / 100) * 100;
    out.onTrack = monthlyPace >= out.requiredMonthly;
  }
  return out;
}

/** Rythme mensuel moyen sur les derniers mois (valeurs positives), avec une valeur de repli. */
export function averagePace(monthlyAmounts: Cents[], fallback: Cents): Cents {
  const recent = monthlyAmounts.slice(-3);
  if (recent.length === 0) return fallback;
  const avg = Math.round(recent.reduce((a, b) => a + b, 0) / recent.length);
  return avg > 0 ? avg : fallback;
}
