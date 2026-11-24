import { useMemo, useState } from 'react';
import type { Midi, Piece } from '../core/model';
import { importTabText } from '../core/parse/importText';
import { GUITAR_PRESETS, findPreset } from '../core/tunings';
import { chordPitches } from '../core/piece';
import { addChord, applyImport, moveChord, removeChord, setCapo, setGuitarTuning, updateChord } from '../core/edit';
import { GuitarChordBox } from './GuitarChordBox';
import { GuitarTabView } from './GuitarTabView';
import { ImportDialog } from './ImportDialog';
import { WarningsPanel } from './WarningsPanel';
import { IntField } from './IntField';
import { GuitarTuningEditor } from './GuitarTuningEditor';
import { TuningLine } from './TuningLine';
import { PitchControl } from './PitchControl';
import { TunePanel, type Tuner } from './TunePanel';

export interface GuitarViewProps {
  piece: Piece;
  update: (fn: (p: Piece) => Piece) => void;
  flats: boolean;
  /** index of the playing tab column, or null */
  playing?: number | null;
  onPlayChord: (pitches: Midi[]) => void;
  /** the guitar's pitch standard (A4 in Hz) */
  a4: number;
  onA4: (a4: number) => void;
  tuner: Tuner;
}

export function GuitarView({ piece, update, flats, playing = null, onPlayChord, a4, onA4, tuner }: GuitarViewProps) {
  const [importing, setImporting] = useState(false);
  const [tuneOpen, setTuneOpen] = useState(false);
  const [editingTuning, setEditingTuning] = useState(false);
  // Recomputed from the stored source text (parsing is deterministic), so the last import's
  // warnings survive switching views and reloading.
  const source = piece.guitar.sourceText;
  const warnings = useMemo(() => (source ? importTabText(source).warnings : []), [source]);
  const g = piece.guitar;
  const isPreset = GUITAR_PRESETS.some((t) => t.id === g.tuning.id);
  return (
    <section className="view guitar-view">
      <div className="settings-bar">
        <label>
          Guitar tuning
          <select
            value={g.tuning.id}
            onChange={(e) => {
              const t = findPreset(e.target.value);
              if (t) update((p) => setGuitarTuning(p, t));
            }}
          >
            {GUITAR_PRESETS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            {!isPreset && <option value={g.tuning.id}>{g.tuning.name}</option>}
          </select>
        </label>
        <button type="button" data-testid="edit-guitar-tuning" onClick={() => setEditingTuning((e) => !e)}>Edit tuning…</button>
        <PitchControl a4={a4} onChange={onA4} testId="guitar-pitch" />
        <button type="button" data-testid="open-tune" onClick={() => setTuneOpen((o) => !o)}>Tune…</button>
        <label>
          Capo
          <IntField min={0} max={12} value={g.capo} onCommit={(n) => update((p) => setCapo(p, n))} />
        </label>
      </div>
      {tuneOpen && <TunePanel tuning={g.tuning} a4={a4} instrument="guitar" tuner={tuner} onClose={() => setTuneOpen(false)} />}
      <TuningLine label="Guitar tuning" tuning={g.tuning} testId="guitar-tuning-line" />
      {editingTuning && (
        <GuitarTuningEditor
          tuning={g.tuning}
          onChange={(t) => update((p) => setGuitarTuning(p, t))}
          onClose={() => setEditingTuning(false)}
        />
      )}

      <h2>Chord boxes</h2>
      <div className="chord-grid">
        {g.chords.map((c, i) => (
          <GuitarChordBox
            key={i}
            shape={c}
            tuning={g.tuning}
            capo={g.capo}
            flats={flats}
            onChange={(s) => update((p) => updateChord(p, i, s))}
            onPlay={() => onPlayChord(chordPitches(c, g.tuning, g.capo).map((x) => x.pitch))}
            onRemove={() => update((p) => removeChord(p, i))}
            onMove={(d) => update((p) => moveChord(p, i, d))}
          />
        ))}
        <button type="button" className="add-chord" data-testid="add-chord" onClick={() => update(addChord)}>+ Add chord</button>
      </div>

      <h2>
        Tab
        <button type="button" data-testid="open-import" onClick={() => setImporting(true)}>Import tab…</button>
      </h2>
      <GuitarTabView events={g.tab} tuning={g.tuning} playing={playing} />
      <WarningsPanel warnings={warnings} />

      {importing && (
        <ImportDialog
          initialText={g.sourceText ?? ''}
          hasPins={Object.keys(piece.overrides.tabPins).length > 0}
          onClose={() => setImporting(false)}
          onImport={(imp, text) => {
            update((p) => applyImport(p, imp, text));
            setImporting(false);
          }}
        />
      )}
    </section>
  );
}
