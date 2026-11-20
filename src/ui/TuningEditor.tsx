import type { Tuning } from '../core/model';
import { octaveOf, pcName, pitchClass, prettyName } from '../core/pitch';
import { addBassCourse, removeBassCourse, setCoursePitch, setFrettedCourses } from '../core/tunings';
import { IntField } from './IntField';

const PCS = Array.from({ length: 12 }, (_, i) => i);
const OCTAVES = [0, 1, 2, 3, 4, 5];

export interface TuningEditorProps { tuning: Tuning; onChange: (t: Tuning) => void; onClose: () => void; }

export function TuningEditor({ tuning, onChange, onClose }: TuningEditorProps) {
  return (
    <div className="tuning-editor" data-testid="tuning-editor">
      <h3>Edit tuning</h3>
      <p className="muted">Courses 4 and below are octave-strung on a real lute, so bass pitches here are nominal.</p>
      <table>
        <thead>
          <tr><th>Course</th><th>Note</th><th>Octave</th><th>Type</th></tr>
        </thead>
        <tbody>
          {tuning.courses.map((m, c) => (
            <tr key={c}>
              <td>{c + 1}</td>
              <td>
                <select
                  aria-label={`Course ${c + 1} note`}
                  value={pitchClass(m)}
                  onChange={(e) => onChange(setCoursePitch(tuning, c, (octaveOf(m) + 1) * 12 + Number(e.target.value)))}
                >
                  {PCS.map((pc) => <option key={pc} value={pc}>{prettyName(pcName(pc, true))}</option>)}
                </select>
              </td>
              <td>
                <select
                  aria-label={`Course ${c + 1} octave`}
                  value={octaveOf(m)}
                  onChange={(e) => onChange(setCoursePitch(tuning, c, (Number(e.target.value) + 1) * 12 + pitchClass(m)))}
                >
                  {OCTAVES.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </td>
              <td>{c < tuning.frettedCourses ? 'fretted' : 'open (diapason)'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <button type="button" disabled={tuning.courses.length >= 14} onClick={() => onChange(addBassCourse(tuning))}>+ Add bass course</button>
        <button type="button" disabled={tuning.courses.length <= 6} onClick={() => onChange(removeBassCourse(tuning))}>− Remove bass course</button>
        <label>
          Fretted courses
          <IntField
            min={1}
            max={tuning.courses.length}
            value={tuning.frettedCourses}
            onCommit={(n) => onChange(setFrettedCourses(tuning, n))}
          />
        </label>
        <button type="button" className="primary" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
