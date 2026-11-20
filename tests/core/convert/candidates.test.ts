import { describe, it, expect } from 'vitest';
import { fingersNeeded, fretSpan, isPlayable } from '../../../src/core/convert/playability';
import { placementsForPitch, pinShift, shiftedOptions, octaveOptions, enumerateAssignments } from '../../../src/core/convert/candidates';
import { limits } from './helpers';

const P = (course: number, fret: number) => ({ course, fret });

describe('playability', () => {
  it('measures span over stopped notes only', () => {
    expect(fretSpan([P(0, 0), P(1, 3), P(2, 5)])).toBe(2);
    expect(fretSpan([P(0, 0)])).toBe(0);
  });
  it('counts a barré as one finger', () => {
    expect(fingersNeeded([P(0, 1), P(1, 1), P(2, 2), P(3, 3), P(4, 3), P(5, 1)])).toBe(4);
  });
  it('disallows a barré across an open course', () => {
    expect(fingersNeeded([P(0, 1), P(2, 0), P(3, 1)])).toBe(2);
    expect(fingersNeeded([P(0, 1), P(1, 1), P(2, 0), P(3, 1), P(4, 2), P(5, 3)])).toBe(5);
  });
  it('rejects more than four fingers or too wide a stretch', () => {
    const L = limits();
    expect(isPlayable([P(0, 1), P(1, 2), P(2, 3), P(3, 4), P(4, 2)], L)).toBe(false);
    expect(isPlayable([P(0, 1), P(1, 6)], L)).toBe(false);
    expect(isPlayable([P(0, 1), P(1, 5)], L)).toBe(true);
  });
});

describe('placements', () => {
  it('finds courses for a pitch within maxFret', () => {
    expect(placementsForPitch(67, limits())).toEqual([P(0, 0), P(1, 5)]);
  });
  it('keeps diapasons open-only', () => {
    expect(placementsForPitch(38, limits('lute-8-g'))).toEqual([P(7, 0)]);
    expect(placementsForPitch(40, limits('lute-8-g'))).toEqual([]);
  });
  it('allows a fretted 7th course on Renaissance 7-course', () => {
    expect(placementsForPitch(43, limits('lute-7-g'))).toEqual([P(5, 0), P(6, 2)]);
  });
  it('validates pins at any octave', () => {
    expect(pinShift(P(1, 5), 67, limits())).toBe(0);
    expect(pinShift(P(5, 0), 55, limits())).toBe(-12);
    expect(pinShift(P(0, 3), 67, limits())).toBeNull();
    expect(pinShift(P(9, 0), 67, limits())).toBeNull();
  });
  it('lists every octave placement, unshifted first', () => {
    expect(octaveOptions(67, limits()).map((o) => [o.shifted, o.placement.course, o.placement.fret])).toEqual([
      [0, 0, 0], [0, 1, 5], [-12, 3, 2], [-12, 4, 7], [-24, 5, 0],
    ]);
  });
  it('shifts out-of-range pitches by octaves toward the range', () => {
    expect(shiftedOptions(40, limits())).toEqual([{ placement: P(4, 4), shifted: 12, pinned: false }]);
    expect(shiftedOptions(100, limits())).toEqual([]);
  });
});

describe('enumerateAssignments', () => {
  it('assigns each note to a distinct course', () => {
    const r = enumerateAssignments([[P(0, 0), P(1, 5)], [P(1, 0)]], limits());
    expect(r).toEqual([[P(0, 0), P(1, 0)]]);
  });
  it('returns nothing when two notes need the same only course', () => {
    expect(enumerateAssignments([[P(4, 4)], [P(4, 4)]], limits())).toEqual([]);
  });
  it('returns one empty assignment for no notes', () => {
    expect(enumerateAssignments([], limits())).toEqual([[]]);
  });
  it('skips branches above the bound and can stream results', () => {
    const got: unknown[] = [];
    const r = enumerateAssignments([[P(0, 0), P(1, 5)]], limits(), { cost: [[-0.3, 5]], limit: () => 1 }, (ps) => got.push(ps));
    expect(r).toEqual([]);
    expect(got).toEqual([[P(0, 0)]]);
  });
});
