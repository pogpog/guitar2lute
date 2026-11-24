import { useState } from 'react';
import { PITCH_PRESETS, isPresetA4, parseA4 } from '../core/pitchStandard';

/** The standard a typed entry sets: the entry if it is valid, else the current one. */
export const commitOther = (text: string, current: number): number => parseA4(text) ?? current;

export interface PitchControlProps {
  a4: number;
  onChange: (a4: number) => void;
  testId: string;
}

/** A drop-down of standard pitches for A4, with "Other…" opening a box for any value in range. */
export function PitchControl({ a4, onChange, testId }: PitchControlProps) {
  const [other, setOther] = useState(() => !isPresetA4(a4));
  const [text, setText] = useState(String(a4));
  const showOther = other || !isPresetA4(a4);
  const commit = () => {
    const next = commitOther(text, a4);
    setText(String(next));
    if (next !== a4) onChange(next);
  };
  return (
    <label>
      Pitch
      <select
        data-testid={testId}
        value={showOther ? 'other' : String(a4)}
        onChange={(e) => {
          if (e.target.value === 'other') {
            setText(String(a4));
            setOther(true);
          } else {
            setOther(false);
            onChange(Number(e.target.value));
          }
        }}
      >
        {PITCH_PRESETS.map((p) => (
          <option key={p} value={String(p)}>{`A = ${p}`}</option>
        ))}
        <option value="other">Other…</option>
      </select>
      {showOther && (
        <input
          className="pitch-other"
          data-testid={`${testId}-other`}
          inputMode="decimal"
          aria-label="Pitch in Hz"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
        />
      )}
    </label>
  );
}
