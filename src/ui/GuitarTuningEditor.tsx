import type { Tuning } from '../core/model';
import { setGuitarStringPitch } from '../core/tunings';
import { PitchPicker } from './PitchPicker';

export interface GuitarTuningEditorProps { tuning: Tuning; onChange: (t: Tuning) => void; onClose: () => void; }

export function GuitarTuningEditor({ tuning, onChange, onClose }: GuitarTuningEditorProps) {
  return (
    <div className="tuning-editor" data-testid="guitar-tuning-editor">
      <h3>Edit guitar tuning</h3>
      <table>
        <thead>
          <tr><th>String</th><th>Note</th><th>Octave</th></tr>
        </thead>
        <tbody>
          {tuning.courses.map((m, s) => (
            <tr key={s}>
              <td>{s + 1}</td>
              <PitchPicker label={`String ${s + 1}`} pitch={m} onChange={(x) => onChange(setGuitarStringPitch(tuning, s, x))} />
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <button type="button" className="primary" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
