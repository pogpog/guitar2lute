import { useEffect, useState, type InputHTMLAttributes } from 'react';
import { parseIntInRange } from './util';

interface IntFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'max' | 'type'> {
  value: number;
  min: number;
  max: number;
  onCommit: (n: number) => void;
}

/**
 * A number input that keeps what the user is typing ('-', '1' on the way to '10') and only
 * commits complete in-range integers; leaving the field restores the committed value.
 */
export function IntField({ value, min, max, onCommit, onBlur, ...rest }: IntFieldProps) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <input
      {...rest}
      type="number"
      min={min}
      max={max}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = parseIntInRange(e.target.value, min, max);
        if (n !== null && n !== value) onCommit(n);
      }}
      onBlur={(e) => {
        setDraft(String(value));
        onBlur?.(e);
      }}
    />
  );
}
