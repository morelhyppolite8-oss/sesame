import type { ISODate, Month } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(date: ISODate): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export const monthOf = (date: ISODate): Month => date.slice(0, 7);

export function addMonths(month: Month, n: number): Month {
  const [y, m] = month.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

export function monthIndex(month: Month): number {
  const [y, m] = month.split('-').map(Number);
  return y * 12 + (m - 1);
}

/** Nombre de mois de `from` à `to` (0 si même mois). */
export const monthsBetween = (from: Month, to: Month): number => monthIndex(to) - monthIndex(from);

export function daysInMonth(month: Month): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export const lastDayOf = (month: Month): ISODate => `${month}-${pad(daysInMonth(month))}`;
export const firstDayOf = (month: Month): ISODate => `${month}-01`;

export function addDays(date: ISODate, n: number): ISODate {
  const d = parseISODate(date);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((parseISODate(to).getTime() - parseISODate(from).getTime()) / 86_400_000);
}

export function addYears(date: ISODate, n: number): ISODate {
  const [y, m, d] = date.split('-').map(Number);
  return `${y + n}-${pad(m)}-${pad(d)}`;
}

/** Liste des mois de `from` à `to` inclus. */
export function monthRange(from: Month, to: Month): Month[] {
  const out: Month[] = [];
  for (let m = from; monthIndex(m) <= monthIndex(to); m = addMonths(m, 1)) out.push(m);
  return out;
}

const monthNames = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

export function monthName(month: Month): string {
  return monthNames[Number(month.slice(5, 7)) - 1];
}

/** « oct. » */
export function monthShort(month: Month): string {
  return new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(parseISODate(`${month}-15`));
}

/** « octobre 2026 » */
export function monthLabel(month: Month, withYear = true): string {
  return withYear ? `${monthName(month)} ${month.slice(0, 4)}` : monthName(month);
}

/** « d'octobre » / « de mars » */
export function ofMonth(month: Month): string {
  const name = monthName(month);
  return /^[aeiouéè]/.test(name) ? `d'${name}` : `de ${name}`;
}

/** « 3 oct. » ou « 3 octobre 2026 » */
export function formatDate(date: ISODate, style: 'short' | 'long' = 'short'): string {
  return new Intl.DateTimeFormat('fr-FR', style === 'short'
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'long', year: 'numeric' }).format(parseISODate(date));
}
