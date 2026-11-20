import type { Midi } from '../core/model';
import { octaveOf, pcName, pitchClass, prettyName } from '../core/pitch';

const PCS = Array.from({ length: 12 }, (_, i) => i);
const OCTAVES = [0, 1, 2, 3, 4, 5];

export interface PitchPickerProps {
  /** prefix for the selects' accessible names, e.g. "Course 3" */
  label: string;
  pitch: Midi;
  onChange: (m: Midi) => void;
}

/** Two table cells: a note select and an octave select. */
export function PitchPicker({ label, pitch, onChange }: PitchPickerProps) {
  return (
    <>
      <td>
        <select
          aria-label={`${label} note`}
          value={pitchClass(pitch)}
          onChange={(e) => onChange((octaveOf(pitch) + 1) * 12 + Number(e.target.value))}
        >
          {PCS.map((pc) => <option key={pc} value={pc}>{prettyName(pcName(pc, true))}</option>)}
        </select>
      </td>
      <td>
        <select
          aria-label={`${label} octave`}
          value={octaveOf(pitch)}
          onChange={(e) => onChange((Number(e.target.value) + 1) * 12 + pitchClass(pitch))}
        >
          {OCTAVES.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </td>
    </>
  );
}
