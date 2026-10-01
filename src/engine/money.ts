import type { Cents } from './types';

export const euros = (value: number): Cents => Math.round(value * 100);

const withDecimals = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const noDecimals = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const plain = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/**
 * Formate un montant en centimes au format fr-FR : `1 250,00 €`.
 * `compact` masque les décimales quand le montant est rond.
 */
export function formatEUR(cents: Cents, opts: { compact?: boolean; sign?: boolean } = {}): string {
  const value = cents / 100;
  const round = cents % 100 === 0;
  const text = (opts.compact && round ? noDecimals : withDecimals).format(value);
  if (opts.sign && cents > 0) return `+${text}`;
  return text;
}

/** Montant arrondi à l'euro, sans décimales : `3 000 €`. */
export function formatEUR0(cents: Cents): string {
  return noDecimals.format(Math.round(cents / 100));
}

/** Nombre sans symbole, pour les champs de saisie. */
export function formatPlain(cents: Cents): string {
  return plain.format(cents / 100);
}

export function formatPct(ratio: number, digits = 0): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number.isFinite(ratio) ? ratio : 0);
}

/** Lit une saisie libre (`1 250,50`, `1250.5`, `12 €`) et renvoie des centimes, ou `null`. */
export function parseAmount(input: string): Cents | null {
  const cleaned = input
    .replace(/[\s  €]/g, '')
    .replace(/,/g, '.');
  if (!/^-?\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

/**
 * Méthode du plus fort reste : arrondit `values` à des entiers dont la somme vaut `total`.
 * `total` doit être compris entre la somme des parties entières et la somme des valeurs arrondie au supérieur.
 * À reste égal, l'ordre d'origine départage (priorité).
 */
export function largestRemainder(values: number[], total: number): number[] {
  const floors = values.map((v) => Math.floor(v + 1e-9));
  let missing = total - floors.reduce((a, b) => a + b, 0);
  const order = values
    .map((v, i) => ({ i, r: v - floors[i] }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  const result = [...floors];
  for (let k = 0; missing > 0 && order.length > 0; k = (k + 1) % order.length) {
    result[order[k].i] += 1;
    missing -= 1;
  }
  for (let k = order.length - 1; missing < 0 && k >= 0; k--) {
    if (result[order[k].i] > 0) {
      result[order[k].i] -= 1;
      missing += 1;
    }
  }
  return result;
}

/** Répartit `total` centimes au prorata de `weights`, en centimes entiers exacts. */
export function splitCents(total: Cents, weights: number[]): Cents[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total === 0) return weights.map(() => 0);
  return largestRemainder(
    weights.map((w) => (total * w) / sum),
    total,
  );
}

export const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);
