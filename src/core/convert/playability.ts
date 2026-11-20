import type { Placement } from '../model';
import type { Limits } from './types';

export function fretSpan(ps: Placement[]): number {
  const f = ps.filter((p) => p.fret > 0).map((p) => p.fret);
  return f.length ? Math.max(...f) - Math.min(...f) : 0;
}

/** Fingers needed; notes sharing the lowest stopped fret may be barréd if no open course lies between them. */
export function fingersNeeded(ps: Placement[]): number {
  const stopped = ps.filter((p) => p.fret > 0);
  if (stopped.length === 0) return 0;
  const min = Math.min(...stopped.map((p) => p.fret));
  const atMin = stopped.filter((p) => p.fret === min);
  let best = stopped.length;
  if (atMin.length >= 2) {
    const lo = Math.min(...atMin.map((p) => p.course));
    const hi = Math.max(...atMin.map((p) => p.course));
    const blocked = ps.some((p) => p.course > lo && p.course < hi && p.fret === 0);
    if (!blocked) best = Math.min(best, stopped.length - atMin.length + 1);
  }
  return best;
}

export function isPlayable(ps: Placement[], limits: Limits): boolean {
  return (
    new Set(ps.map((p) => p.course)).size === ps.length &&
    fretSpan(ps) <= limits.maxStretch &&
    fingersNeeded(ps) <= 4
  );
}
