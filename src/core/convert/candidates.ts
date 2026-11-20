import type { Midi, Placement } from '../model';
import type { Limits, NoteOption } from './types';
import { isPlayable } from './playability';

export function maxFretFor(course: number, limits: Limits): number {
  return course < limits.tuning.frettedCourses ? limits.maxFret : 0;
}

export function placementsForPitch(pitch: Midi, limits: Limits): Placement[] {
  const out: Placement[] = [];
  limits.tuning.courses.forEach((open, course) => {
    const fret = pitch - open;
    if (fret >= 0 && fret <= maxFretFor(course, limits)) out.push({ course, fret });
  });
  return out;
}

/** Octave shift a pin implies for this pitch (0, ±12, ±24), or null if the pin cannot play it. */
export function pinShift(pin: Placement, pitch: Midi, limits: Limits): number | null {
  const open = limits.tuning.courses[pin.course];
  if (open === undefined || pin.fret < 0 || pin.fret > maxFretFor(pin.course, limits)) return null;
  const d = open + pin.fret - pitch;
  return d % 12 === 0 && Math.abs(d) <= 24 ? d : null;
}

export function shiftedOptions(pitch: Midi, limits: Limits): NoteOption[] {
  const direct = placementsForPitch(pitch, limits);
  if (direct.length) return direct.map((placement) => ({ placement, shifted: 0, pinned: false }));
  const lowest = Math.min(...limits.tuning.courses);
  const order = pitch < lowest + 12 ? [12, 24, -12, -24] : [-12, -24, 12, 24];
  for (const s of order) {
    const ps = placementsForPitch(pitch + s, limits);
    if (ps.length) return ps.map((placement) => ({ placement, shifted: s, pinned: false }));
  }
  return [];
}

/** Every placement of the pitch itself and of its octaves (0, +12, −12, +24, −24), in that order. */
export function octaveOptions(pitch: Midi, limits: Limits): NoteOption[] {
  const out: NoteOption[] = [];
  for (const s of [0, 12, -12, 24, -24]) {
    for (const placement of placementsForPitch(pitch + s, limits)) out.push({ placement, shifted: s, pinned: false });
  }
  return out;
}

export const ENUMERATION_CAP = 5000;

/** Optional branch-and-bound for enumerateAssignments. */
export interface SearchBound {
  /** additive lower bound on each option's cost, aligned with `options` */
  cost: number[][];
  /** current cut-off, read live: a branch whose lower bound is above it is skipped */
  limit: () => number;
}

/**
 * Playable assignments of one placement per note, each note on its own course.
 * Each result is aligned with `options` (`result[i]` is note i's placement).
 * With `onLeaf`, results are streamed to it instead of collected (the return value is then empty).
 */
export function enumerateAssignments(
  options: Placement[][],
  limits: Limits,
  bound?: SearchBound,
  onLeaf?: (ps: Placement[]) => void,
): Placement[][] {
  const order = options.map((_, i) => i).sort((a, b) => options[a].length - options[b].length || a - b);
  // restMin[k] = cheapest possible cost of the notes order[k..]
  const restMin = new Array<number>(order.length + 1).fill(0);
  if (bound) {
    for (let k = order.length - 1; k >= 0; k--) restMin[k] = restMin[k + 1] + Math.min(...bound.cost[order[k]], Infinity);
  }
  const results: Placement[][] = [];
  const current: Placement[] = new Array(options.length);
  const used = new Set<number>();
  let visited = 0;
  const rec = (k: number, lo: number, hi: number, acc: number) => {
    if (visited >= ENUMERATION_CAP) return;
    if (bound && acc + restMin[k] > bound.limit()) return;
    if (k === order.length) {
      visited++;
      const ps = [...current];
      if (isPlayable(ps, limits)) {
        if (onLeaf) onLeaf(ps);
        else results.push(ps);
      }
      return;
    }
    const i = order[k];
    options[i].forEach((p, j) => {
      if (used.has(p.course)) return;
      let nlo = lo;
      let nhi = hi;
      if (p.fret > 0) {
        nlo = Math.min(lo, p.fret);
        nhi = Math.max(hi, p.fret);
        if (nhi - nlo > limits.maxStretch) return;
      }
      current[i] = p;
      used.add(p.course);
      rec(k + 1, nlo, nhi, acc + (bound ? bound.cost[i][j] : 0));
      used.delete(p.course);
    });
  };
  rec(0, Infinity, -Infinity, 0);
  return results;
}
