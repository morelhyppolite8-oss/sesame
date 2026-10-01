import { addDays, monthOf } from './dates';
import { formatEUR } from './money';
import { chargesInMonth, FREQUENCY_LABELS } from './subscriptions';
import type { ISODate, Subscription } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

const stamp = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

/** Plie les lignes à 75 octets (UTF-8), comme l'exige la RFC 5545. */
function fold(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

export interface MonthlyReminder {
  /** Premier rendez-vous, AAAA-MM-JJ. */
  firstDate: string;
  day: number;
  hour: number;
  minute: number;
  url?: string;
  now?: Date;
}

/** Rappel mensuel récurrent pour la revue, avec une alerte à l'heure. */
export function monthlyReviewIcs(opts: MonthlyReminder): string {
  const [y, m, d] = opts.firstDate.split('-').map(Number);
  const start = `${y}${pad(m)}${pad(d)}T${pad(opts.hour)}${pad(opts.minute)}00`;
  const endMinutes = opts.hour * 60 + opts.minute + 10;
  const end = `${y}${pad(m)}${pad(d)}T${pad(Math.floor(endMinutes / 60))}${pad(endMinutes % 60)}00`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hyppo Patrimoine//Revue mensuelle//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Paris',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    'UID:revue-mensuelle@hyppo-patrimoine',
    `DTSTAMP:${stamp(opts.now ?? new Date())}`,
    `DTSTART;TZID=Europe/Paris:${start}`,
    `DTEND;TZID=Europe/Paris:${end}`,
    `RRULE:FREQ=MONTHLY;BYMONTHDAY=${opts.day}`,
    `SUMMARY:${escape('Revue mensuelle · Hyppo Patrimoine')}`,
    `DESCRIPTION:${escape('Dix minutes pour comparer le prévu au réel, décider des reliquats et ajuster le mois suivant.')}`,
    ...(opts.url ? [`URL:${opts.url}`] : []),
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escape('Revue mensuelle')}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

const compactDate = (date: ISODate) => date.replace(/-/g, '');

/** Jour du mois dans une règle : au-delà du 28, « le dernier jour existant jusqu'au jour voulu ». */
function monthDayRule(day: number): string {
  if (day <= 28) return `BYMONTHDAY=${day}`;
  const days = Array.from({ length: day - 27 }, (_, i) => 28 + i).join(',');
  return `BYMONTHDAY=${days};BYSETPOS=-1`;
}

/** Règle de récurrence RFC 5545 d'un abonnement. */
export function subscriptionRrule(sub: Subscription): string | null {
  switch (sub.frequency) {
    case 'weekly':
      return 'FREQ=WEEKLY';
    case 'monthly':
      return sub.day ? `FREQ=MONTHLY;${monthDayRule(sub.day)}` : null;
    case 'quarterly':
      return sub.day ? `FREQ=MONTHLY;INTERVAL=3;${monthDayRule(sub.day)}` : null;
    case 'yearly': {
      const month = sub.month ?? Number(sub.startDate.slice(5, 7));
      return sub.day ? `FREQ=YEARLY;BYMONTH=${month};${monthDayRule(sub.day)}` : null;
    }
  }
}

/** Premier prélèvement daté à partir d'aujourd'hui (sur deux ans au plus). */
export function firstChargeFrom(sub: Subscription, today: ISODate): ISODate | null {
  let month = monthOf(today);
  for (let i = 0; i < 25; i++) {
    const found = chargesInMonth({ ...sub, status: 'actif' }, month).find((c) => c.date && c.date >= today);
    if (found?.date) return found.date;
    month = monthOf(addDays(`${month}-28`, 7));
  }
  return null;
}

/**
 * Tous les abonnements actifs et datés, en événements récurrents d'une journée,
 * avec un rappel la veille à 9 h. Les abonnements sans jour de prélèvement sont ignorés.
 */
export function subscriptionsIcs(
  subs: Subscription[],
  today: ISODate,
  accountName: (id: string) => string,
  now: Date = new Date(),
): { ics: string; count: number; skipped: number } {
  const events: string[] = [];
  let skipped = 0;
  for (const sub of subs.filter((s) => s.status === 'actif')) {
    const rule = subscriptionRrule(sub);
    const first = rule ? firstChargeFrom(sub, today) : null;
    if (!rule || !first) {
      skipped += 1;
      continue;
    }
    const amount = formatEUR(sub.amount, { compact: true }).replace(/[\u202f\u00a0]/g, ' ');
    events.push(
      'BEGIN:VEVENT',
      `UID:abonnement-${sub.id}@hyppo-patrimoine`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${compactDate(first)}`,
      `DTEND;VALUE=DATE:${compactDate(addDays(first, 1))}`,
      `RRULE:${rule}`,
      `SUMMARY:${escape(`${sub.name} · ${amount}`)}`,
      `DESCRIPTION:${escape(`Prélèvement ${FREQUENCY_LABELS[sub.frequency].adjective.toLowerCase()} de ${amount} sur ${accountName(sub.accountId)}.`)}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escape(`Demain : ${sub.name} (${amount})`)}`,
      'TRIGGER:-PT15H',
      'END:VALARM',
      'END:VEVENT',
    );
  }
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hyppo Patrimoine//Abonnements//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Abonnements',
    ...events,
    'END:VCALENDAR',
  ];
  return { ics: lines.map(fold).join('\r\n') + '\r\n', count: events.filter((l) => l === 'BEGIN:VEVENT').length, skipped };
}
