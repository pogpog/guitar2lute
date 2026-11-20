import { describe, it, expect } from 'vitest';
import { newPiece, chordPitches, columnPitches, guitarColumns } from '../../src/core/piece';
import { STANDARD_GUITAR } from '../../src/core/tunings';

describe('piece helpers', () => {
  it('creates a new piece with defaults', () => {
    const p = newPiece('Test');
    expect(p.schemaVersion).toBe(1);
    expect(p.title).toBe('Test');
    expect(p.guitar.tuning.id).toBe('guitar-standard');
    expect(p.guitar.capo).toBe(0);
    expect(p.lute.tuning.id).toBe('lute-6-g');
    expect(p.lute).toMatchObject({ transpose: 0, maxFret: 8, maxStretch: 4, notation: 'french' });
    expect(p.overrides).toEqual({ chordVoicing: {}, chordPins: {}, tabPins: {} });
    expect(newPiece().id).not.toBe(p.id);
  });
  it('computes chord pitches, skipping muted and unset strings', () => {
    const am = { name: '', frets: [0, 1, 2, 2, 0, 'x' as const], baseFret: 1 };
    expect(chordPitches(am, STANDARD_GUITAR, 0)).toEqual([
      { pitch: 64, string: 0 }, { pitch: 60, string: 1 }, { pitch: 57, string: 2 },
      { pitch: 52, string: 3 }, { pitch: 45, string: 4 },
    ]);
    expect(chordPitches(am, STANDARD_GUITAR, 2)[0].pitch).toBe(66);
    expect(chordPitches({ name: '', frets: [null, null, null, null, null, null], baseFret: 1 }, STANDARD_GUITAR, 0)).toEqual([]);
  });
  it('computes column pitches and indexes guitar columns', () => {
    expect(columnPitches({ notes: [{ string: 5, fret: 3 }], x: 0 }, STANDARD_GUITAR, 1)).toEqual([44]);
    const p = newPiece();
    p.guitar.tab = [
      { kind: 'col', col: { notes: [{ string: 0, fret: 0 }], x: 2 } },
      { kind: 'bar' },
      { kind: 'col', col: { notes: [{ string: 1, fret: 1 }], x: 5 } },
    ];
    expect(guitarColumns(p)).toEqual([{ x: 2, pitches: [64], index: 0 }, { x: 5, pitches: [60], index: 1 }]);
  });
});
