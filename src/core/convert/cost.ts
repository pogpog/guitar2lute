import type { Placement } from '../model';
import type { ColumnCandidate } from './types';
import { fingersNeeded, fretSpan } from './playability';

export const WEIGHTS = {
  fret: 1.0,
  span: 1.5,
  finger: 0.5,
  open: -0.3,
  shifted: 5,
  /** drop penalties by musical role (see dropPenalty in column.ts) */
  dropDuplicate: 4,
  dropDoubling: 7,
  dropInner: 10,
  dropTop: 16,
  dropBass: 20,
  dropPinned: 30,
  highPosition: 1.0,
  highPositionFrom: 5,
  move: 1.0,
  bassReuse: 0.5,
};

export function handOf(ps: Placement[]): number | null {
  const f = ps.filter((p) => p.fret > 0).map((p) => p.fret);
  return f.length ? Math.min(...f) : null;
}

export function placementCost(ps: Placement[], shiftedCount: number, dropPenalty: number): number {
  const W = WEIGHTS;
  const stopped = ps.filter((p) => p.fret > 0);
  const sumFrets = stopped.reduce((a, p) => a + p.fret, 0);
  const opens = ps.length - stopped.length;
  const low = handOf(ps) ?? 0;
  return (
    sumFrets * W.fret +
    fretSpan(ps) * W.span +
    fingersNeeded(ps) * W.finger +
    opens * W.open +
    shiftedCount * W.shifted +
    dropPenalty +
    Math.max(0, low - W.highPositionFrom) * W.highPosition
  );
}

export function transitionCost(prevHand: number | null, prevBass: ColumnCandidate['bass'], next: ColumnCandidate): number {
  let c = 0;
  if (prevHand !== null && next.hand !== null) c += Math.abs(next.hand - prevHand) * WEIGHTS.move;
  if (prevBass) {
    const n = next.notes.find((x) => x.placement.course === prevBass.course);
    if (n && n.pitch !== prevBass.pitch) c += WEIGHTS.bassReuse;
  }
  return c;
}
