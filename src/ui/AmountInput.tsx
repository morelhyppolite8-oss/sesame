import { useEffect, useState } from 'react';
import { formatPlain, parseAmount } from '../engine/money';
import type { Cents } from '../engine/types';
import { inputClass } from './kit';

/** Champ de montant en euros (clavier décimal), valeur en centimes. */
export function AmountInput({
  value,
  onChange,
  id,
  label,
  placeholder = '0',
  allowEmpty = false,
}: {
  value: Cents | null;
  onChange: (cents: Cents | null) => void;
  id?: string;
  label?: string;
  placeholder?: string;
  allowEmpty?: boolean;
}) {
  const [text, setText] = useState(value === null ? '' : formatPlain(value));
  useEffect(() => {
    const parsed = parseAmount(text);
    if (parsed !== value) setText(value === null ? '' : formatPlain(value));
    // On ne resynchronise que si la valeur change de l'extérieur.
  }, [value]);
  return (
    <div className="relative">
      <input
        id={id}
        aria-label={label}
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const parsed = parseAmount(e.target.value);
          if (e.target.value.trim() === '') onChange(allowEmpty ? null : 0);
          else if (parsed !== null) onChange(parsed);
        }}
        onBlur={() => {
          if (value !== null) setText(formatPlain(value));
        }}
        className={`${inputClass} amount-input tabular pr-10 text-right`}
      />
      <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-muted">€</span>
    </div>
  );
}
