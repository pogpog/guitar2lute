import { emptyOverrides, SCHEMA_VERSION } from './model';
import type { ChordShape, Midi, Piece, TabColumn, Tuning } from './model';
import { STANDARD_GUITAR, DEFAULT_LUTE, cloneTuning } from './tunings';

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function newPiece(title = 'Untitled'): Piece {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId(),
    title,
    updatedAt: new Date().toISOString(),
    guitar: { tuning: cloneTuning(STANDARD_GUITAR), capo: 0, chords: [], tab: [] },
    lute: { tuning: cloneTuning(DEFAULT_LUTE), transpose: 0, maxFret: 8, maxStretch: 4, notation: 'french' },
    overrides: emptyOverrides(),
  };
}

/** Sounding strings of a chord shape, high string first. */
export function chordPitches(shape: ChordShape, tuning: Tuning, capo: number): { pitch: Midi; string: number }[] {
  const out: { pitch: Midi; string: number }[] = [];
  shape.frets.forEach((f, s) => {
    if (typeof f === 'number' && s < tuning.courses.length) out.push({ pitch: tuning.courses[s] + capo + f, string: s });
  });
  return out;
}

export function columnPitches(col: TabColumn, tuning: Tuning, capo: number): Midi[] {
  return col.notes.map((n) => tuning.courses[n.string] + capo + n.fret);
}

export function guitarColumns(piece: Piece): { x: number; pitches: Midi[]; index: number }[] {
  const out: { x: number; pitches: Midi[]; index: number }[] = [];
  for (const ev of piece.guitar.tab) {
    if (ev.kind === 'col') {
      out.push({ x: ev.col.x, pitches: columnPitches(ev.col, piece.guitar.tuning, piece.guitar.capo), index: out.length });
    }
  }
  return out;
}
