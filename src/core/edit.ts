import type { ChordShape, LuteSettings, Overrides, Piece, Placement, Tuning, Warning } from './model';
import { emptyOverrides } from './model';
import type { TextImport } from './parse/importText';

export function touch(p: Piece): Piece {
  return { ...p, updatedAt: new Date().toISOString() };
}

export function setTitle(p: Piece, title: string): Piece {
  return { ...p, title };
}

export function emptyChord(strings = 6): ChordShape {
  return { name: '', frets: Array.from({ length: strings }, () => null), baseFret: 1 };
}

export function toggleFret(shape: ChordShape, string: number, fret: number): ChordShape {
  const frets = [...shape.frets];
  frets[string] = frets[string] === fret ? null : fret;
  return { ...shape, frets };
}

export function cycleOpen(shape: ChordShape, string: number): ChordShape {
  const cur = shape.frets[string];
  const next = cur === 0 ? 'x' : cur === 'x' ? null : 0;
  const frets = [...shape.frets];
  frets[string] = next;
  return { ...shape, frets };
}

export function shiftBaseFret(shape: ChordShape, delta: number): ChordShape {
  return { ...shape, baseFret: Math.max(1, Math.min(15, shape.baseFret + delta)) };
}

function reindex<T>(rec: Record<number, T>, map: (i: number) => number | null): Record<number, T> {
  const out: Record<number, T> = {};
  for (const [k, v] of Object.entries(rec)) {
    const n = map(Number(k));
    if (n !== null) out[n] = v;
  }
  return out;
}

function mapChordOverrides(o: Overrides, map: (i: number) => number | null): Overrides {
  return { ...o, chordVoicing: reindex(o.chordVoicing, map), chordPins: reindex(o.chordPins, map) };
}

function withChords(p: Piece, chords: ChordShape[], overrides = p.overrides): Piece {
  return { ...p, guitar: { ...p.guitar, chords }, overrides };
}

export function addChord(p: Piece): Piece {
  return withChords(p, [...p.guitar.chords, emptyChord(p.guitar.tuning.courses.length)]);
}

export function removeChord(p: Piece, i: number): Piece {
  return withChords(
    p,
    p.guitar.chords.filter((_, j) => j !== i),
    mapChordOverrides(p.overrides, (k) => (k === i ? null : k > i ? k - 1 : k)),
  );
}

export function moveChord(p: Piece, i: number, dir: -1 | 1): Piece {
  const j = i + dir;
  if (j < 0 || j >= p.guitar.chords.length) return p;
  const chords = [...p.guitar.chords];
  [chords[i], chords[j]] = [chords[j], chords[i]];
  return withChords(p, chords, mapChordOverrides(p.overrides, (k) => (k === i ? j : k === j ? i : k)));
}

export function updateChord(p: Piece, i: number, shape: ChordShape): Piece {
  const old = p.guitar.chords[i];
  const fretsChanged = !old || old.frets.some((f, s) => f !== shape.frets[s]) || old.frets.length !== shape.frets.length;
  const chords = p.guitar.chords.map((c, j) => (j === i ? shape : c));
  return withChords(p, chords, fretsChanged ? mapChordOverrides(p.overrides, (k) => (k === i ? null : k)) : p.overrides);
}

export function setGuitarTuning(p: Piece, tuning: Tuning): Piece {
  return { ...p, guitar: { ...p.guitar, tuning } };
}

export function setCapo(p: Piece, capo: number): Piece {
  return { ...p, guitar: { ...p.guitar, capo } };
}

export function applyImport(p: Piece, imp: TextImport, sourceText: string): Piece {
  return {
    ...p,
    guitar: {
      ...p.guitar,
      tab: imp.events,
      sourceText,
      tuning: imp.tuning ?? p.guitar.tuning,
      capo: imp.capo ?? p.guitar.capo,
    },
    overrides: { ...p.overrides, tabPins: {} },
  };
}

export function setLuteSettings(p: Piece, patch: Partial<LuteSettings>): Piece {
  return { ...p, lute: { ...p.lute, ...patch } };
}

export function setTabPin(p: Piece, col: number, note: number, placement: Placement): Piece {
  const tabPins = { ...p.overrides.tabPins, [col]: { ...(p.overrides.tabPins[col] ?? {}), [note]: placement } };
  return { ...p, overrides: { ...p.overrides, tabPins } };
}

export function setChordPin(p: Piece, chord: number, note: number, placement: Placement): Piece {
  const chordPins = { ...p.overrides.chordPins, [chord]: { ...(p.overrides.chordPins[chord] ?? {}), [note]: placement } };
  return { ...p, overrides: { ...p.overrides, chordPins } };
}

export function setChordVoicing(p: Piece, chord: number, v: number): Piece {
  const chordPins = { ...p.overrides.chordPins };
  delete chordPins[chord];
  return { ...p, overrides: { ...p.overrides, chordVoicing: { ...p.overrides.chordVoicing, [chord]: v }, chordPins } };
}

export function clearOverrides(p: Piece): Piece {
  return { ...p, overrides: emptyOverrides() };
}

/** Replaces all pins of one tab column (note index → placement). */
export function pinTabColumn(p: Piece, col: number, placements: Record<number, Placement>): Piece {
  return { ...p, overrides: { ...p.overrides, tabPins: { ...p.overrides.tabPins, [col]: { ...placements } } } };
}

/** Replaces all pins of one chord and clears its chosen-voicing index (pins re-rank the voicings). */
export function pinChord(p: Piece, chord: number, placements: Record<number, Placement>): Piece {
  const chordVoicing = { ...p.overrides.chordVoicing };
  delete chordVoicing[chord];
  return { ...p, overrides: { ...p.overrides, chordPins: { ...p.overrides.chordPins, [chord]: { ...placements } }, chordVoicing } };
}

/** Removes the pins of the chord or tab column a `pin` warning points at. */
export function removePinsFor(p: Piece, w: Warning): Piece {
  const tabPins = { ...p.overrides.tabPins };
  const chordPins = { ...p.overrides.chordPins };
  if (w.tabColumn !== undefined) delete tabPins[w.tabColumn];
  if (w.chord !== undefined) delete chordPins[w.chord];
  return { ...p, overrides: { ...p.overrides, tabPins, chordPins } };
}

/** Removes the pins of every chord and tab column that a `pin` warning reports as no longer fitting. */
export function removeStalePins(p: Piece, warnings: Warning[]): Piece {
  return warnings.filter((w) => w.kind === 'pin').reduce(removePinsFor, p);
}
