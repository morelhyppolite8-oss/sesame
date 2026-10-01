import { parseAmount } from './money';
import type { Cents, ISODate, Month } from './types';

export interface CsvRule {
  id: string;
  /** Motif normalisé recherché dans le libellé. */
  pattern: string;
  envelopeId: string;
  createdAt: number;
}

export interface BankTransaction {
  id: string;
  date: ISODate;
  month: Month;
  description: string;
  /** Montant dépensé, positif. */
  amount: Cents;
  envelopeId: string | null;
  /** Origine de la catégorie : règle apprise, mot-clé par défaut, ou manuelle. */
  categorizedBy: 'rule' | 'keyword' | 'manual' | null;
}

/** Découpe un CSV (RFC 4180 : guillemets, virgules ou points-virgules). */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

const HEADERS = {
  type: ['type'],
  date: ['started date', 'date de debut', 'completed date', 'date de fin', 'date'],
  description: ['description', 'libelle'],
  amount: ['amount', 'montant'],
  fee: ['fee', 'frais'],
  state: ['state', 'etat', 'statut'],
  product: ['product', 'produit'],
};

function column(headers: string[], names: string[]): number {
  for (const name of names) {
    const i = headers.indexOf(name);
    if (i >= 0) return i;
  }
  return -1;
}

const SKIPPED_STATES = ['reverted', 'declined', 'failed', 'annule', 'refuse', 'rembourse', 'echec'];
const INTERNAL = /\b(pocket|coffre|vault|to eur|exchanged? to|change en|top-?up|recharge|virement interne)\b/;

/** Lit un relevé Revolut (en-têtes anglais ou français). Garde les dépenses terminées, hors mouvements internes. */
export function parseRevolutCsv(text: string): Omit<BankTransaction, 'envelopeId' | 'categorizedBy'>[] {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('Le fichier est vide ou illisible.');
  const headers = rows[0].map(norm);
  const cDate = column(headers, HEADERS.date);
  const cDesc = column(headers, HEADERS.description);
  const cAmount = column(headers, HEADERS.amount);
  const cFee = column(headers, HEADERS.fee);
  const cState = column(headers, HEADERS.state);
  const cType = column(headers, HEADERS.type);
  if (cDate < 0 || cDesc < 0 || cAmount < 0) {
    throw new Error("Ce fichier ne ressemble pas à un relevé Revolut : colonnes « Date », « Description » ou « Montant » introuvables.");
  }
  const out: Omit<BankTransaction, 'envelopeId' | 'categorizedBy'>[] = [];
  rows.slice(1).forEach((row, index) => {
    const state = cState >= 0 ? norm(row[cState] ?? '') : '';
    if (SKIPPED_STATES.some((s) => state.includes(s))) return;
    const amount = parseAmount((row[cAmount] ?? '').trim());
    if (amount === null || amount >= 0) return;
    const fee = cFee >= 0 ? parseAmount((row[cFee] ?? '').trim()) ?? 0 : 0;
    const description = (row[cDesc] ?? '').trim();
    const type = cType >= 0 ? norm(row[cType] ?? '') : '';
    if (INTERNAL.test(norm(description)) || /exchange|change|topup|recharge/.test(type)) return;
    const rawDate = (row[cDate] ?? '').trim();
    const date = toIso(rawDate);
    if (!date) return;
    out.push({
      id: `${date}-${index}-${Math.abs(amount)}-${norm(description).slice(0, 24)}`,
      date,
      month: date.slice(0, 7),
      description,
      amount: -amount + Math.abs(fee),
    });
  });
  return out;
}

function toIso(raw: string): ISODate | null {
  let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

/** Mots-clés par défaut, rattachés au nom des enveloppes. */
export const DEFAULT_KEYWORDS: { envelopeName: RegExp; keywords: string[] }[] = [
  {
    envelopeName: /courses/i,
    keywords: ['carrefour', 'lidl', 'monoprix', 'franprix', 'auchan', 'leclerc', 'intermarche', 'casino', 'picard',
      'aldi', 'super u', 'hyper u', 'naturalia', 'biocoop', 'grand frais', 'pharmacie', 'pharma', 'sephora', 'boulangerie',
      'marche', 'g20', 'spar', 'netto', 'la vie claire', 'cora', 'match'],
  },
  {
    envelopeName: /sorties|loisirs|resto/i,
    keywords: ['restaurant', 'resto', 'bistrot', 'bistro', 'brasserie', 'bar ', 'cafe', 'uber eats', 'deliveroo', 'just eat', 'mcdonald', 'burger',
      'kfc', 'starbucks', 'cinema', 'ugc', 'pathe', 'mk2', 'fnac', 'concert', 'ticketmaster', 'fever', 'bowling',
      'sushi', 'pizza', 'kebab', 'pub', 'club', 'steam', 'playstation'],
  },
  {
    envelopeName: /fixe|abonnement/i,
    keywords: ['netflix', 'spotify', 'deezer', 'disney', 'canal', 'amazon prime', 'apple.com', 'icloud', 'google storage',
      'free mobile', 'sfr', 'bouygues', 'orange', 'navigo', 'ratp', 'sncf connect abonnement', 'basic-fit', 'fitness',
      'assurance', 'edf', 'engie', 'youtube premium', 'chatgpt', 'claude'],
  },
  {
    envelopeName: /vetement/i,
    keywords: ['zara', 'h&m', 'uniqlo', 'celio', 'jules', 'kiabi', 'asos', 'zalando', 'vinted', 'decathlon', 'nike',
      'adidas', 'bershka', 'pull&bear', 'mango', 'primark', 'galeries lafayette', 'printemps'],
  },
  {
    envelopeName: /vacances|voyage/i,
    keywords: ['airbnb', 'booking', 'ryanair', 'easyjet', 'air france', 'transavia', 'hotel', 'blablacar', 'ouigo', 'flixbus', 'trainline'],
  },
];

/** Extrait un motif stable d'un libellé (sans chiffres ni références). */
export function patternOf(description: string): string {
  return norm(description)
    .replace(/[*#]/g, ' ')
    .replace(/\d+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 3)
    .join(' ');
}

export function categorize(
  description: string,
  rules: CsvRule[],
  envelopes: { id: string; name: string }[],
): { envelopeId: string | null; by: BankTransaction['categorizedBy'] } {
  const text = norm(description);
  const rule = [...rules]
    .sort((a, b) => b.pattern.length - a.pattern.length || b.createdAt - a.createdAt)
    .find((r) => r.pattern && text.includes(r.pattern) && envelopes.some((e) => e.id === r.envelopeId));
  if (rule) return { envelopeId: rule.envelopeId, by: 'rule' };
  for (const group of DEFAULT_KEYWORDS) {
    if (!group.keywords.some((k) => text.includes(k))) continue;
    const env = envelopes.find((e) => group.envelopeName.test(norm(e.name)));
    if (env) return { envelopeId: env.id, by: 'keyword' };
  }
  return { envelopeId: null, by: null };
}

/** Règle apprise quand on corrige une catégorie. Remplace une règle de même motif. */
export function learnRule(rules: CsvRule[], description: string, envelopeId: string, now: number, id: string): CsvRule[] {
  const pattern = patternOf(description);
  if (!pattern) return rules;
  return [...rules.filter((r) => r.pattern !== pattern), { id, pattern, envelopeId, createdAt: now }];
}

/** Dépenses par enveloppe pour un mois : préremplit la revue. */
export function spendingByEnvelope(transactions: BankTransaction[], month: Month): Record<string, Cents> {
  const out: Record<string, Cents> = {};
  for (const t of transactions) {
    if (t.month !== month || !t.envelopeId) continue;
    out[t.envelopeId] = (out[t.envelopeId] ?? 0) + t.amount;
  }
  return out;
}
