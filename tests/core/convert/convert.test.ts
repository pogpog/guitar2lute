import { describe, it, expect } from 'vitest';
import { convertPiece, cycleNote, limitsOf, nextPlacement, placementCycle } from '../../../src/core/convert/convert';
import { autoTranspose, autoTransposeAsync } from '../../../src/core/convert/autoTranspose';
import { newPiece, columnPitches } from '../../../src/core/piece';
import { parseAsciiTab } from '../../../src/core/parse/asciiTab';
import { findPreset } from '../../../src/core/tunings';
import { AM_ARPEGGIO } from '../parse/fixtures';
import type { ChordShape, LuteColumn, LuteResult, Piece, TabEvent } from '../../../src/core/model';

const E: ChordShape = { name: '', frets: [0, 0, 1, 2, 2, 0], baseFret: 1 };
function piece(chords: ChordShape[] = [], tab?: string): Piece {
  const p = newPiece('t');
  p.guitar.chords = chords;
  if (tab) p.guitar.tab = parseAsciiTab(tab).events;
  return p;
}
const cols = (r: LuteResult) => r.tab.filter((e): e is LuteColumn => e.kind === 'col');
const bySrc = <T extends { srcNoteIndex: number }>(ns: T[]) => [...ns].sort((a, b) => a.srcNoteIndex - b.srcNoteIndex);

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('convertPiece — chords', () => {
  it('maps a guitar E chord at +3 to the classic G-lute shape named G', () => {
    const p = piece([E]);
    p.lute.transpose = 3;
    const r = convertPiece(p);
    const v = r.chords[0].voicings[0];
    expect(bySrc(v.notes).map((n) => n.placement)).toEqual([
      { course: 0, fret: 0 }, { course: 1, fret: 0 }, { course: 2, fret: 2 },
      { course: 3, fret: 2 }, { course: 4, fret: 2 }, { course: 5, fret: 0 },
    ]);
    expect(r.chords[0].name).toBe('G');
    expect(r.warnings).toEqual([]);
  });
  it('reports the shifted bass and the dropped note at transpose 0', () => {
    const r = convertPiece(piece([E]));
    expect(r.stats).toEqual({ shifted: 1, dropped: 1 });
    expect(r.warnings.map((w) => w.kind).sort()).toEqual(['drop', 'inversion']);
    expect(r.warnings.every((w) => w.chord === 0)).toBe(true);
  });
  it('offers up to 3 voicings and respects / clamps the chosen one', () => {
    // a single G4 (top string, fret 3) can be played on course 1 open or course 2 fret 5
    const p = piece([{ name: '', frets: [3, null, null, null, null, null], baseFret: 1 }]);
    const r = convertPiece(p);
    expect(r.chords[0].voicings.length).toBeGreaterThan(1);
    expect(r.chords[0].voicings.length).toBeLessThanOrEqual(3);
    p.overrides.chordVoicing = { 0: 1 };
    expect(convertPiece(p).chords[0].chosen).toBe(1);
    p.overrides.chordVoicing = { 0: 99 };
    expect(convertPiece(p).chords[0].chosen).toBe(convertPiece(p).chords[0].voicings.length - 1);
  });
  it('transposes user-entered chord names', () => {
    const p = piece([{ ...E, name: 'E' }]);
    p.lute.transpose = 3;
    expect(convertPiece(p).chords[0].name).toBe('G');
  });
  it('moves typed chord names with the capo as well as the transpose', () => {
    const p = piece([{ ...E, name: 'E' }, E]);
    p.guitar.capo = 2;
    p.lute.transpose = 3;
    expect(convertPiece(p).chords.map((c) => c.name)).toEqual(['A', 'A']);
  });
  it('warns when a note moved below the bass changes the inversion', () => {
    // G4 + A3; pinning G4 two octaves down to course 6 open puts G2 under the A
    const p = piece([{ name: '', frets: [3, null, 2, null, null, null], baseFret: 1 }]);
    p.overrides.chordPins = { 0: { 0: { course: 5, fret: 0 } } };
    const w = convertPiece(p).warnings;
    expect(w.filter((x) => x.kind === 'inversion')).toHaveLength(1);
  });
  it('offers alternative voicings for a full six-note chord', () => {
    const p = piece([E]);
    p.lute.transpose = 3;
    const c = convertPiece(p).chords[0];
    expect(c.voicings.length).toBeGreaterThan(1);
    expect(c.voicings[0].dropped).toEqual([]);
  });
  it('handles an all-muted chord', () => {
    const r = convertPiece(piece([{ name: '', frets: ['x', 'x', 'x', 'x', 'x', 'x'], baseFret: 1 }]));
    expect(r.chords[0].voicings[0].notes).toEqual([]);
    expect(r.chords[0].name).toBe('');
    expect(r.warnings).toEqual([]);
  });
});

// Guitar in E at +3 is a lute in G: the same frets on every string except the 3rd, which is one fret higher.
const OPEN_SHAPES: [string, ChordShape['frets'], string, number][] = [
  ['E', [0, 0, 1, 2, 2, 0], 'G', 1],
  ['A', [0, 2, 2, 2, 0, 'x'], 'C', 0],
  ['D', [2, 3, 2, 0, 'x', 'x'], 'F', 0],
  ['G', [3, 0, 0, 0, 2, 3], 'Bb', 1],
  ['C', [0, 1, 0, 2, 3, 'x'], 'Eb', 0],
  ['Em', [0, 0, 0, 2, 2, 0], 'Gm', 1],
  ['Am', [0, 1, 2, 2, 0, 'x'], 'Cm', 0],
];

describe('convertPiece — known chord mappings', () => {
  it.each(OPEN_SHAPES)('maps the open %s shape at +3 to the matching lute shape (%s)', (_, frets, name) => {
    const p = piece([{ name: '', frets, baseFret: 1 }]);
    p.lute.transpose = 3;
    const r = convertPiece(p);
    const expected = frets.flatMap((f, s) => (typeof f === 'number' ? [{ course: s, fret: f + (s === 2 ? 1 : 0) }] : []));
    expect(bySrc(r.chords[0].voicings[0].notes).map((n) => n.placement)).toEqual(expected);
    expect(r.chords[0].name).toBe(name);
    expect(r.warnings).toEqual([]);
  });
  it.each(OPEN_SHAPES)('keeps the open %s shape at transpose 0 losing at most one doubled note', (_, frets, __, drops) => {
    const r = convertPiece(piece([{ name: '', frets, baseFret: 1 }]));
    expect(r.stats.dropped).toBe(drops);
    expect(r.warnings.filter((w) => w.kind === 'drop')).toHaveLength(drops);
  });
});

describe('convertPiece — tab', () => {
  it('handles an empty piece', () => {
    expect(convertPiece(newPiece())).toMatchObject({ chords: [], tab: [], warnings: [], totalCost: 0, stats: { shifted: 0, dropped: 0 } });
  });
  it('converts the Am arpeggio at +3 without shifts', () => {
    const p = piece([], AM_ARPEGGIO);
    p.lute.transpose = 3;
    const r = convertPiece(p);
    expect(cols(r)).toHaveLength(5);
    expect(r.stats).toEqual({ shifted: 0, dropped: 0 });
    expect(r.tab.map((e) => e.kind)).toEqual(['col', 'col', 'col', 'col', 'col', 'bar', 'break']);
  });
  it('honours tab pins', () => {
    const p = piece([], AM_ARPEGGIO);
    p.lute.transpose = 3;
    p.overrides.tabPins = { 0: { 0: { course: 5, fret: 5 } } };
    const n = cols(convertPiece(p))[0].notes[0];
    expect(n.placement).toEqual({ course: 5, fret: 5 });
    expect(n.pinned).toBe(true);
  });
  it('warns about pins that do not fit', () => {
    const p = piece([], AM_ARPEGGIO);
    p.overrides.tabPins = { 0: { 0: { course: 0, fret: 0 } } };
    const r = convertPiece(p);
    expect(r.warnings.some((w) => w.kind === 'pin' && w.tabColumn === 0 && w.line === 5)).toBe(true);
  });
  it('turns a stale pin after a tuning change into a warning', () => {
    const p = piece([], AM_ARPEGGIO);
    p.lute.transpose = 3;
    p.overrides.tabPins = { 0: { 0: { course: 5, fret: 5 } } };
    p.lute.tuning = findPreset('lute-13-baroque-dm')!;
    expect(() => convertPiece(p)).not.toThrow();
    expect(convertPiece(p).warnings.some((w) => w.kind === 'pin')).toBe(true);
  });
  it('gives one warning per chord, however many of its pins no longer fit', () => {
    const p = piece([E]);
    p.lute.transpose = 3;
    const shown = convertPiece(p).chords[0].voicings[0].notes;
    p.overrides.chordPins = { 0: Object.fromEntries(shown.map((n) => [n.srcNoteIndex, n.placement])) };
    p.lute.tuning = findPreset('lute-13-baroque-dm')!;
    const pins = convertPiece(p).warnings.filter((w) => w.kind === 'pin');
    expect(pins).toHaveLength(1);
    expect(pins[0].chord).toBe(0);
    // several of the chord's pins are stale (3 on this tuning), yet they give a single warning
    expect(pins[0].message).toMatch(/: [2-6] manual placements no longer fit and are ignored\.$/);
  });
  it('every output note equals input + transpose (± flagged octave shifts)', () => {
    const rand = mulberry32(42);
    const tunings = ['lute-6-g', 'lute-8-g', 'lute-10-g', 'lute-13-baroque-dm'];
    for (let trial = 0; trial < 40; trial++) {
      const p = newPiece();
      p.lute.tuning = findPreset(tunings[trial % tunings.length])!;
      p.lute.transpose = Math.floor(rand() * 13) - 6;
      const events: TabEvent[] = [];
      for (let c = 0; c < 30; c++) {
        const strings = [0, 1, 2, 3, 4, 5].filter(() => rand() < 0.4);
        events.push({ kind: 'col', col: { x: c * 3, notes: strings.map((s) => ({ string: s, fret: Math.floor(rand() * 13) })) } });
      }
      p.guitar.tab = events;
      const r = convertPiece(p);
      cols(r).forEach((col, i) => {
        const ev = events[i];
        const input = ev.kind === 'col' ? columnPitches(ev.col, p.guitar.tuning, 0) : [];
        expect(col.notes.length + col.dropped.length).toBe(input.length);
        const courses = new Set<number>();
        for (const n of col.notes) {
          expect([0, 12, -12, 24, -24]).toContain(n.shifted);
          expect(n.pitch).toBe(input[n.srcNoteIndex] + p.lute.transpose + n.shifted);
          expect(p.lute.tuning.courses[n.placement.course] + n.placement.fret).toBe(n.pitch);
          if (n.placement.course >= p.lute.tuning.frettedCourses) expect(n.placement.fret).toBe(0);
          expect(n.placement.fret).toBeLessThanOrEqual(p.lute.maxFret);
          courses.add(n.placement.course);
        }
        expect(courses.size).toBe(col.notes.length);
      });
    }
  });
  it('converts 1000 columns quickly', () => {
    const rand = mulberry32(7);
    const p = newPiece();
    for (let c = 0; c < 1000; c++) {
      const strings = [0, 1, 2, 3, 4, 5].filter(() => rand() < 0.5).slice(0, 4);
      p.guitar.tab.push({ kind: 'col', col: { x: c * 3, notes: strings.map((s) => ({ string: s, fret: Math.floor(rand() * 6) })) } });
    }
    const t0 = performance.now();
    convertPiece(p);
    expect(performance.now() - t0).toBeLessThan(4000);
    const t1 = performance.now();
    autoTranspose(p);
    expect(performance.now() - t1).toBeLessThan(15000);
  });
});

describe('manual override cycling', () => {
  it('cycles through all placements including octave shifts', () => {
    const L = limitsOf(newPiece().lute);
    expect(placementCycle(67, L).map((c) => c.placement)).toEqual([
      { course: 0, fret: 0 }, { course: 1, fret: 5 }, { course: 3, fret: 2 }, { course: 4, fret: 7 }, { course: 5, fret: 0 },
    ]);
    expect(nextPlacement(67, { course: 0, fret: 0 }, L)).toEqual({ course: 1, fret: 5 });
    expect(nextPlacement(67, { course: 5, fret: 0 }, L)).toEqual({ course: 0, fret: 0 });
  });
  it('skips placements that clash with the notes that stay', () => {
    const L = limitsOf(newPiece().lute);
    // course 2 is taken by D4, so G4 goes to G3 on course 4 fret 2 next
    expect(nextPlacement(67, { course: 0, fret: 0 }, L, [{ placement: { course: 1, fret: 0 }, pitch: 62 }])).toEqual({ course: 3, fret: 2 });
  });
  it('never drops or moves another note of a chord', () => {
    let p = piece([{ name: '', frets: [3, 0, 0, null, null, null], baseFret: 1 }]);
    p.overrides.chordVoicing = { 0: 1 };
    for (let k = 0; k < 4; k++) {
      const c = convertPiece(p).chords[0];
      const pins = cycleNote(c.voicings[c.chosen].notes, 0, limitsOf(p.lute))!;
      p = { ...p, overrides: { ...p.overrides, chordPins: { 0: pins }, chordVoicing: {} } };
      const after = convertPiece(p).chords[0];
      const v = after.voicings[after.chosen];
      expect(v.dropped).toEqual([]);
      expect(Object.fromEntries(v.notes.map((n) => [n.srcNoteIndex, n.placement]))).toEqual(pins);
    }
  });
  it('never drops or moves another note of a tab column', () => {
    let p = piece([], ['e|---3---|', 'B|---0---|', 'G|-------|', 'D|-------|', 'A|-------|', 'E|-------|'].join('\n'));
    p.lute.transpose = 3;
    for (let k = 0; k < 4; k++) {
      const pins = cycleNote(cols(convertPiece(p))[0].notes, 1, limitsOf(p.lute))!;
      p = { ...p, overrides: { ...p.overrides, tabPins: { 0: pins } } };
      const col = cols(convertPiece(p))[0];
      expect(col.dropped).toEqual([]);
      expect(Object.fromEntries(col.notes.map((n) => [n.srcNoteIndex, n.placement]))).toEqual(pins);
    }
  });
});

describe('autoTranspose', () => {
  it('chooses +3 for a guitar E chord on a G lute', () => {
    expect(autoTranspose(piece([E]))).toBe(3);
  });
  it('chooses 0 for an empty piece', () => {
    expect(autoTranspose(newPiece())).toBe(0);
  });
  it('can run in steps that give the page a chance to repaint', async () => {
    let pauses = 0;
    const t = await autoTransposeAsync(piece([E]), async () => {
      pauses++;
    });
    expect(t).toBe(3);
    expect(pauses).toBe(13); // once per candidate transpose
  });
});
