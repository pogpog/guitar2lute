import { describe, it, expect } from 'vitest';
import { WEIGHTS, placementCost, handOf, transitionCost } from '../../../src/core/convert/cost';
import type { ColumnCandidate } from '../../../src/core/convert/types';

const P = (course: number, fret: number) => ({ course, fret });
const cand = (hand: number | null, notes: { course: number; pitch: number }[] = []): ColumnCandidate => ({
  notes: notes.map((n, i) => ({ srcIndex: i, pitch: n.pitch, shifted: 0, placement: P(n.course, 0), pinned: false })),
  dropped: [], cost: 0, hand, bass: null, key: '',
});

describe('cost', () => {
  it('rewards open strings and charges for frets, fingers, shifts and drops', () => {
    expect(placementCost([P(0, 0)], 0, 0)).toBeCloseTo(-0.3);
    expect(placementCost([P(0, 2), P(1, 2)], 0, 0)).toBeCloseTo(4.5);
    expect(placementCost([P(0, 2), P(1, 2)], 1, WEIGHTS.dropInner)).toBeCloseTo(19.5);
  });
  it('charges for high positions above fret 5', () => {
    expect(placementCost([P(0, 7)], 0, 0)).toBeCloseTo(9.5);
  });
  it('finds the hand position', () => {
    expect(handOf([P(0, 0), P(1, 3), P(2, 2)])).toBe(2);
    expect(handOf([P(0, 0)])).toBeNull();
  });
  it('charges hand movement and reusing the held bass course', () => {
    expect(transitionCost(1, null, cand(5))).toBe(4);
    expect(transitionCost(null, null, cand(5))).toBe(0);
    expect(transitionCost(null, { course: 5, pitch: 43 }, cand(null, [{ course: 5, pitch: 45 }]))).toBe(0.5);
    expect(transitionCost(null, { course: 5, pitch: 43 }, cand(null, [{ course: 5, pitch: 43 }]))).toBe(0);
  });
});
