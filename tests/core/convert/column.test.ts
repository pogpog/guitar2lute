import { describe, it, expect } from 'vitest';
import { solveColumn } from '../../../src/core/convert/column';
import { limits } from './helpers';

const bySrc = <T extends { srcIndex: number }>(ns: T[]) => [...ns].sort((a, b) => a.srcIndex - b.srcIndex);

describe('solveColumn', () => {
  it('finds the classic G-lute shape for a guitar E chord transposed +3', () => {
    const best = solveColumn([67, 62, 59, 55, 50, 43], limits()).candidates[0];
    expect(bySrc(best.notes).map((n) => n.placement)).toEqual([
      { course: 0, fret: 0 }, { course: 1, fret: 0 }, { course: 2, fret: 2 },
      { course: 3, fret: 2 }, { course: 4, fret: 2 }, { course: 5, fret: 0 },
    ]);
    expect(best.dropped).toEqual([]);
  });

  it('shifts a too-low bass up an octave and drops an octave doubling when needed', () => {
    const best = solveColumn([64, 59, 56, 52, 47, 40], limits()).candidates[0];
    expect(best.dropped).toEqual([{ srcIndex: 3, pitch: 52 }]);
    const low = best.notes.find((n) => n.srcIndex === 5)!;
    expect(low.shifted).toBe(12);
    expect(low.pitch).toBe(52);
  });

  it('drops only the doubled B2 from a guitar G chord at transpose 0', () => {
    // B2 and G2 both need course 6; B2 doubles B3, so it is the cheapest note to lose.
    const best = solveColumn([67, 59, 55, 50, 47, 43], limits()).candidates[0];
    expect(best.dropped).toEqual([{ srcIndex: 4, pitch: 47 }]);
    expect(best.notes).toHaveLength(5);
  });

  it('moves a colliding note up an octave rather than dropping it', () => {
    // G2 and A2 both need course 6; A3 on course 3 open costs a shift (5), less than a drop.
    const best = solveColumn([43, 45], limits()).candidates[0];
    expect(best.dropped).toEqual([]);
    expect(bySrc(best.notes).map((n) => [n.pitch, n.shifted, n.placement])).toEqual([
      [43, 0, { course: 5, fret: 0 }],
      [57, 12, { course: 2, fret: 0 }],
    ]);
  });

  it('never shifts a note into unison with another note', () => {
    for (const c of solveColumn([64, 59, 56, 52, 47, 40], limits()).candidates) {
      const ps = c.notes.map((n) => n.pitch);
      expect(new Set(ps).size).toBe(ps.length);
    }
  });

  it('offers alternatives without one doubled note, after the full chord', () => {
    const r = solveColumn([67, 62, 59, 55, 50, 43], limits(), {}, 3, { alternatives: true });
    expect(r.candidates).toHaveLength(3);
    expect(r.candidates[0].dropped).toEqual([]);
    expect(r.candidates[1].dropped).toHaveLength(1);
    expect(r.candidates.slice(1).every((c) => [55, 62, 50].includes(c.dropped[0].pitch))).toBe(true);
  });

  it('keeps bass and top when there are more notes than courses', () => {
    const best = solveColumn([43, 48, 53, 57, 62, 67, 60], limits()).candidates[0];
    expect(best.dropped).toEqual([{ srcIndex: 6, pitch: 60 }]);
    const pitches = best.notes.map((n) => n.pitch);
    expect(pitches).toContain(43);
    expect(pitches).toContain(67);
  });

  it('honours valid pins and reports invalid ones', () => {
    const ok = solveColumn([67], limits(), { 0: { course: 1, fret: 5 } });
    expect(ok.candidates[0].notes[0]).toMatchObject({ placement: { course: 1, fret: 5 }, pinned: true });
    const bad = solveColumn([67], limits(), { 0: { course: 0, fret: 3 } });
    expect(bad.badPins).toEqual([0]);
    expect(bad.candidates[0].notes[0].pinned).toBe(false);
  });

  it('drops unplaceable pitches and never returns an empty candidate list', () => {
    const r = solveColumn([100], limits());
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].notes).toEqual([]);
    expect(r.candidates[0].dropped).toEqual([{ srcIndex: 0, pitch: 100 }]);
    expect(solveColumn([], limits()).candidates).toHaveLength(1);
  });

  it('returns at most k candidates sorted by cost', () => {
    const r = solveColumn([57, 62], limits(), {}, 3);
    expect(r.candidates.length).toBeLessThanOrEqual(3);
    const costs = r.candidates.map((c) => c.cost);
    expect([...costs].sort((a, b) => a - b)).toEqual(costs);
  });

  it('ignores a pinned shape that no longer fits instead of dropping a note', () => {
    // d'+5 = g', a+2 = b, G open: span 3, fine at max stretch 6
    const pins = { 0: { course: 1, fret: 5 }, 1: { course: 2, fret: 2 }, 2: { course: 5, fret: 0 } };
    const wide = solveColumn([67, 59, 43], limits('lute-6-g', 8, 6), pins);
    expect(wide.badPins).toEqual([]);
    expect(wide.candidates[0].notes.every((n) => n.pinned)).toBe(true);
    // max stretch 2: every pin fits on its own, but the shape does not
    const narrow = solveColumn([67, 59, 43], limits('lute-6-g', 8, 2), pins);
    expect(narrow.candidates[0].dropped).toEqual([]);
    expect(narrow.candidates[0].notes).toHaveLength(3);
    expect(narrow.badPins).toEqual([0, 1, 2]);
  });

  it('keeps a pinned shape whose column needed a drop anyway', () => {
    // 7 notes on 6 courses: one must go; pins cover the six shown notes
    const free = solveColumn([43, 48, 53, 57, 62, 67, 60], limits()).candidates[0];
    const pins = Object.fromEntries(free.notes.map((n) => [n.srcIndex, n.placement]));
    const r = solveColumn([43, 48, 53, 57, 62, 67, 60], limits(), pins);
    expect(r.badPins).toEqual([]);
    expect(r.candidates[0].notes.every((n) => n.pinned)).toBe(true);
  });

  it('never offers the same shape twice when the chord has a unison', () => {
    // guitar 0-5-4-2-x-x at +3: g' g' d' g
    const r = solveColumn([67, 67, 62, 55], limits(), {}, 3, { alternatives: true });
    const shapes = r.candidates.map((c) =>
      c.notes.map((n) => `${n.placement.course}:${n.placement.fret}`).sort().join(','),
    );
    expect(new Set(shapes).size).toBe(shapes.length);
  });
});
