import { describe, it, expect } from 'vitest';
import { viterbi } from '../../../src/core/convert/viterbi';
import { transitionCost } from '../../../src/core/convert/cost';
import type { ColumnCandidate } from '../../../src/core/convert/types';

const cand = (cost: number, hand: number | null): ColumnCandidate => ({ notes: [], dropped: [], cost, hand, bass: null, key: `${cost}/${hand}` });

function greedy(columns: ColumnCandidate[][]): number {
  let prevHand: number | null = null;
  let total = 0;
  for (const col of columns) {
    let best = col[0];
    let bestCost = Infinity;
    for (const c of col) {
      const t = c.cost + transitionCost(prevHand, null, c);
      if (t < bestCost) { bestCost = t; best = c; }
    }
    total += bestCost;
    prevHand = best.hand ?? prevHand;
  }
  return total;
}

describe('viterbi', () => {
  it('beats greedy when an early choice paints itself into a corner', () => {
    const cols = [[cand(0, 1), cand(0.5, 7)], [cand(0, 7)]];
    expect(greedy(cols)).toBe(6);
    expect(viterbi(cols)).toEqual({ path: [1, 0], cost: 0.5 });
  });
  it('carries the hand position through all-open columns', () => {
    const cols = [[cand(0, 3)], [cand(0, null)], [cand(0, 8), cand(0, 3)]];
    expect(viterbi(cols).path).toEqual([0, 0, 1]);
  });
  it('breaks ties toward the lower index', () => {
    expect(viterbi([[cand(1, null), cand(1, null)]]).path).toEqual([0]);
  });
  it('handles no columns', () => {
    expect(viterbi([])).toEqual({ path: [], cost: 0 });
  });
});
