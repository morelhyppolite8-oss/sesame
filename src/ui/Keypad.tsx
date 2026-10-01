import { Icon } from './Icon';

/** Saisie d'un montant en texte (« 1 250,5 »), convertie en centimes par l'appelant. */
export function applyKey(current: string, key: string): string {
  if (key === 'back') return current.slice(0, -1);
  if (key === ',') {
    if (current.includes(',')) return current;
    return current === '' ? '0,' : `${current},`;
  }
  const [int, dec] = current.split(',');
  if (dec !== undefined && dec.length >= 2) return current;
  if (dec === undefined && int.length >= 7) return current;
  if (current === '0') return key;
  return current + key;
}

export function keypadToCents(text: string): number {
  if (!text) return 0;
  const [int, dec = ''] = text.split(',');
  return Number(int || '0') * 100 + Number((dec + '00').slice(0, 2));
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'back'];

export function Keypad({ onKey }: { onKey: (key: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Pavé numérique">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onKey(k)}
          aria-label={k === 'back' ? 'Effacer' : k === ',' ? 'Virgule' : k}
          className="flex h-15 items-center justify-center rounded-2xl font-serif text-[1.75rem] text-ink transition select-none active:scale-95 active:bg-raised"
        >
          {k === 'back' ? <Icon name="backspace" size={24} className="text-muted" /> : k}
        </button>
      ))}
    </div>
  );
}
