import { describe, expect, it } from 'vitest';
import { DEFAULT_ENVELOPES } from '../defaults';
import { monthlyReviewIcs } from '../ics';
import { categorize, learnRule, parseCsv, parseRevolutCsv, spendingByEnvelope, type BankTransaction } from '../revolutCsv';

const EN = `Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
CARD_PAYMENT,Current,2026-10-04 12:01:22,2026-10-05 08:00:00,Carrefour City,-23.40,0.00,EUR,COMPLETED,120.00
CARD_PAYMENT,Current,2026-10-05 20:11:00,2026-10-06 08:00:00,"Le Petit Bistrot, Paris",-31.00,0.00,EUR,COMPLETED,89.00
TRANSFER,Current,2026-10-06 09:00:00,2026-10-06 09:00:00,To pocket EUR Courses,-100.00,0.00,EUR,COMPLETED,-11.00
TOPUP,Current,2026-10-01 09:00:00,2026-10-01 09:00:00,Top-up by *1234,400.00,0.00,EUR,COMPLETED,400.00
CARD_PAYMENT,Current,2026-10-07 10:00:00,,Netflix.com,-13.49,0.00,EUR,REVERTED,
CARD_PAYMENT,Current,2026-10-08 10:00:00,2026-10-08 10:00:00,Boutique Mystere 4412,-12.00,0.00,EUR,COMPLETED,77.00
`;

const FR = `Type;Produit;Date de début;Date de fin;Description;Montant;Frais;Devise;État;Solde
Paiement par carte;Actuel;2026-10-04 12:01:22;2026-10-05 08:00:00;Lidl;-18,20;0,00;EUR;TERMINÉ;120,00
`;

describe('Import CSV Revolut', () => {
  it('analyse les guillemets', () => {
    expect(parseCsv('a,"b, c",d\n1,"2 ""x""",3')).toEqual([['a', 'b, c', 'd'], ['1', '2 "x"', '3']]);
  });
  it('garde les dépenses terminées, hors mouvements internes', () => {
    const tx = parseRevolutCsv(EN);
    expect(tx.map((t) => [t.description, t.amount])).toEqual([
      ['Carrefour City', 2340],
      ['Le Petit Bistrot, Paris', 3100],
      ['Boutique Mystere 4412', 1200],
    ]);
  });
  it('comprend les en-têtes français et le point-virgule', () => {
    expect(parseRevolutCsv(FR)).toEqual([expect.objectContaining({ description: 'Lidl', amount: 1820, month: '2026-10' })]);
  });
  it('catégorise, puis apprend des corrections', () => {
    expect(categorize('Carrefour City', [], DEFAULT_ENVELOPES).envelopeId).toBe('courses');
    expect(categorize('Boutique Mystere 4412', [], DEFAULT_ENVELOPES).envelopeId).toBeNull();
    const rules = learnRule([], 'Boutique Mystere 4412', 'vetements', 1, 'rule1');
    expect(categorize('BOUTIQUE MYSTÈRE 9981', rules, DEFAULT_ENVELOPES)).toEqual({ envelopeId: 'vetements', by: 'rule' });
  });
  it('totalise par enveloppe pour la revue', () => {
    const tx: BankTransaction[] = parseRevolutCsv(EN).map((t) => ({ ...t, ...{ envelopeId: categorize(t.description, [], DEFAULT_ENVELOPES).envelopeId, categorizedBy: 'keyword' as const } }));
    expect(spendingByEnvelope(tx, '2026-10')).toEqual({ courses: 2340, sorties: 3100 });
  });
  it('refuse un fichier qui n’est pas un relevé', () => {
    expect(() => parseRevolutCsv('foo,bar\n1,2')).toThrow();
  });
});

describe('Rappel .ics', () => {
  it('produit un événement mensuel récurrent', () => {
    const ics = monthlyReviewIcs({ firstDate: '2026-11-01', day: 1, hour: 19, minute: 0, now: new Date('2026-10-01T00:00:00Z') });
    expect(ics).toContain('RRULE:FREQ=MONTHLY;BYMONTHDAY=1');
    expect(ics).toContain('DTSTART;TZID=Europe/Paris:20261101T190000');
    expect(ics.split('\r\n').every((l) => l.length <= 75)).toBe(true);
  });
});
