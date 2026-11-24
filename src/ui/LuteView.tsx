import { useEffect, useRef, useState } from 'react';
import type { LuteColumn, LuteResult, Midi, Piece } from '../core/model';
import { cycleNote, limitsOf } from '../core/convert/convert';
import { autoTransposeAsync } from '../core/convert/autoTranspose';
import { clearOverrides, pinChord, pinTabColumn, removePinsFor, removeStalePins, setChordVoicing, setLuteSettings } from '../core/edit';
import { LuteSettingsBar } from './LuteSettingsBar';
import { TuningEditor } from './TuningEditor';
import { TuningLine } from './TuningLine';
import { TunePanel, type Tuner } from './TunePanel';
import { LuteChordBox } from './LuteChordBox';
import { LuteTabView } from './LuteTabView';
import { WarningsPanel } from './WarningsPanel';

export interface LuteViewProps {
  piece: Piece;
  update: (fn: (p: Piece) => Piece) => void;
  result: LuteResult;
  playing: number | null;
  onPlayChord: (pitches: Midi[]) => void;
  /** the lute's pitch standard (A4 in Hz) */
  a4: number;
  onA4: (a4: number) => void;
  tuner: Tuner;
}

export function LuteView({ piece, update, result, playing, onPlayChord, a4, onA4, tuner }: LuteViewProps) {
  const [editing, setEditing] = useState(false);
  const [tuneOpen, setTuneOpen] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);
  const [width, setWidth] = useState(900);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(320, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const s = piece.lute;
  const limits = limitsOf(s);
  const o = piece.overrides;
  const hasOverrides = Object.keys(o.tabPins).length + Object.keys(o.chordPins).length + Object.keys(o.chordVoicing).length > 0;

  const cycleTab = (colIndex: number, noteIndex: number) => {
    const col = result.tab.find((e): e is LuteColumn => e.kind === 'col' && e.index === colIndex);
    const pins = col && cycleNote(col.notes, noteIndex, limits);
    if (pins) update((p) => pinTabColumn(p, colIndex, pins));
  };
  const cycleChord = (chordIndex: number, noteIndex: number) => {
    const c = result.chords[chordIndex];
    const pins = c?.voicings[c.chosen] && cycleNote(c.voicings[c.chosen].notes, noteIndex, limits);
    if (pins) update((p) => pinChord(p, chordIndex, pins));
  };

  const runAuto = async () => {
    setAutoBusy(true);
    try {
      const t = await autoTransposeAsync(piece);
      update((p) => setLuteSettings(p, { transpose: t }));
    } finally {
      setAutoBusy(false);
    }
  };

  return (
    <section className="view lute-view">
      <LuteSettingsBar
        settings={s}
        hasOverrides={hasOverrides}
        onChange={(patch) => update((p) => setLuteSettings(p, patch))}
        onEditTuning={() => setEditing((e) => !e)}
        onAuto={runAuto}
        autoBusy={autoBusy}
        onClearOverrides={() => update(clearOverrides)}
        a4={a4}
        onA4={onA4}
        onTune={() => setTuneOpen((o) => !o)}
      />
      {tuneOpen && <TunePanel tuning={s.tuning} a4={a4} instrument="lute" tuner={tuner} onClose={() => setTuneOpen(false)} />}
      <TuningLine label="Lute tuning" tuning={s.tuning} testId="lute-tuning-line" />
      {editing && <TuningEditor tuning={s.tuning} onChange={(t) => update((p) => setLuteSettings(p, { tuning: t }))} onClose={() => setEditing(false)} />}

      <h2>Lute chord boxes</h2>
      <div className="chord-grid">
        {result.chords.map((c, i) => (
          <LuteChordBox
            key={i}
            chord={c}
            tuning={s.tuning}
            notation={s.notation}
            flats={result.flats}
            onCycle={(n) => cycleChord(i, n)}
            onVoicing={(d) => update((p) => setChordVoicing(p, i, Math.max(0, c.chosen + d)))}
            onPlay={() => onPlayChord((c.voicings[c.chosen]?.notes ?? []).map((n) => n.pitch))}
          />
        ))}
        {!result.chords.length && <p className="muted">No chord boxes yet. Add them in the Guitar view.</p>}
      </div>

      <h2>Lute tab</h2>
      <p className="muted hint">Click a note to move it to another course; your choice is kept when the conversion re-runs.</p>
      <div ref={wrapRef} className="tab-wrap">
        <LuteTabView result={result} tuning={s.tuning} notation={s.notation} playing={playing} onCycle={cycleTab} width={width} />
      </div>
      <WarningsPanel
        warnings={result.warnings}
        onRemovePins={(w) => update((p) => removePinsFor(p, w))}
        onRemoveAllStale={() => update((p) => removeStalePins(p, result.warnings))}
      />
    </section>
  );
}
