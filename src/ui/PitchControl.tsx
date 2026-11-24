import { useEffect, useRef, useState } from 'react';
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
  /** the box holds an entry that was refused; it stays, so it can be corrected */
  const [invalid, setInvalid] = useState(false);
  /** set when Other… is chosen, so the box takes focus with its value selected */
  const [focusBox, setFocusBox] = useState(false);
  const boxRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!focusBox) return;
    boxRef.current?.focus();
    boxRef.current?.select();
    setFocusBox(false);
  }, [focusBox]);
  const showOther = other || !isPresetA4(a4);
  const commit = () => {
    if (parseA4(text) === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
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
            setInvalid(false);
            setOther(true);
            setFocusBox(true);
          } else {
            setOther(false);
            setInvalid(false);
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
          ref={boxRef}
          className="pitch-other"
          data-testid={`${testId}-other`}
          inputMode="decimal"
          aria-label="Pitch in Hz"
          aria-invalid={invalid}
          aria-describedby={invalid ? `${testId}-hint` : undefined}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
        />
      )}
      {showOther && invalid && (
        <span className="pitch-hint" id={`${testId}-hint`} data-testid={`${testId}-hint`}>
          380–480 Hz
        </span>
      )}
    </label>
  );
}
