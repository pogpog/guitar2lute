import type { Midi, Placement } from '../model';
import type { ColumnCandidate, ColumnSolution, Limits, NoteOption } from './types';
import { enumerateAssignments, octaveOptions, pinShift, shiftedOptions } from './candidates';
import { WEIGHTS, handOf, placementCost } from './cost';
import { pitchClass } from '../pitch';

interface NoteIn {
  srcIndex: number;
  /** input pitch (after transpose, before any octave shift) */
  pitch: Midi;
  /** pass 1 options: the pitch itself, or its nearest octave when the pitch has no placement */
  direct: NoteOption[];
  /** pass 2 options: the pitch and all its octaves */
  all: NoteOption[];
  pinned: boolean;
}

interface Roles { bass: NoteIn | undefined; top: NoteIn | undefined; }

/** Musical roles come from the input pitches, so an octave shift never changes which note is the bass or the top. */
function rolesOf(notes: NoteIn[]): Roles {
  const low = [...notes].sort((a, b) => a.pitch - b.pitch || a.srcIndex - b.srcIndex)[0];
  const high = [...notes].sort((a, b) => b.pitch - a.pitch || a.srcIndex - b.srcIndex)[0];
  return { bass: low, top: high };
}

/** Penalty for dropping `n` while `kept` still sound: duplicate < octave doubling < inner voice < top < bass < pinned. */
function dropPenalty(n: NoteIn, kept: NoteIn[], roles: Roles): number {
  if (n.pinned) return WEIGHTS.dropPinned;
  if (n === roles.bass) return WEIGHTS.dropBass;
  if (n === roles.top) return WEIGHTS.dropTop;
  if (kept.some((k) => k.pitch === n.pitch)) return WEIGHTS.dropDuplicate;
  if (kept.some((k) => pitchClass(k.pitch) === pitchClass(n.pitch))) return WEIGHTS.dropDoubling;
  return WEIGHTS.dropInner;
}

/** Additive part of placementCost for one option: a lower bound, since span, finger and position costs are never negative. */
const optionCost = (o: NoteOption) => (o.placement.fret > 0 ? o.placement.fret * WEIGHTS.fret : WEIGHTS.open) + (o.shifted !== 0 ? WEIGHTS.shifted : 0);

const byCost = (a: ColumnCandidate, b: ColumnCandidate) => a.cost - b.cost || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/** Keeps the k cheapest candidates; `limit()` is the cost a newcomer must not exceed. */
class TopK {
  readonly items: ColumnCandidate[] = [];
  constructor(private readonly k: number) {}
  limit(): number {
    return this.items.length < this.k ? Infinity : this.items[this.items.length - 1].cost;
  }
  add(c: ColumnCandidate): void {
    if (c.cost > this.limit()) return;
    let i = this.items.length;
    while (i > 0 && byCost(c, this.items[i - 1]) < 0) i--;
    this.items.splice(i, 0, c);
    if (this.items.length > this.k) this.items.pop();
  }
}

function build(active: NoteIn[], options: NoteOption[][], ps: Placement[], dropped: NoteIn[], penalty: number): ColumnCandidate | null {
  const notes = active.map((n, i) => {
    const opt = options[i].find((o) => o.placement.course === ps[i].course && o.placement.fret === ps[i].fret)!;
    return { srcIndex: n.srcIndex, pitch: n.pitch + opt.shifted, shifted: opt.shifted, placement: ps[i], pinned: opt.pinned };
  });
  // An octave shift that lands in unison with another note is a drop in disguise.
  if (notes.some((a) => a.shifted !== 0 && notes.some((b) => b !== a && b.pitch === a.pitch))) return null;
  const shiftedCount = notes.filter((n) => n.shifted !== 0).length;
  const bassNote = notes.length ? notes.reduce((a, b) => (b.pitch < a.pitch ? b : a)) : null;
  const key = [...notes]
    .sort((a, b) => a.srcIndex - b.srcIndex)
    .map((n) => `${n.placement.course}:${n.placement.fret}`)
    .join(',');
  return {
    notes,
    dropped: [...dropped].sort((a, b) => a.srcIndex - b.srcIndex).map((n) => ({ srcIndex: n.srcIndex, pitch: n.pitch })),
    cost: placementCost(ps, shiftedCount, penalty),
    hand: handOf(ps),
    bass: bassNote ? { course: bassNote.placement.course, pitch: bassNote.pitch } : null,
    key,
  };
}

/** Adds every playable assignment of `active` that could make the top k to `top`. */
function search(active: NoteIn[], pick: 'direct' | 'all', dropped: NoteIn[], penalty: number, limits: Limits, top: TopK): void {
  // Shifted options that would sound in unison with another note's own pitch are never useful.
  const options = active.map((n) => n[pick].filter((o) => o.shifted === 0 || !active.some((m) => m !== n && m.pitch === n.pitch + o.shifted)));
  enumerateAssignments(
    options.map((os) => os.map((o) => o.placement)),
    limits,
    { cost: options.map((os) => os.map(optionCost)), limit: () => top.limit() - penalty },
    (ps) => {
      const c = build(active, options, ps, dropped, penalty);
      if (c) top.add(c);
    },
  );
}

function* subsets<T>(items: T[], size: number, start = 0): Generator<T[]> {
  if (size === 0) {
    yield [];
    return;
  }
  for (let i = start; i <= items.length - size; i++) {
    for (const rest of subsets(items, size - 1, i + 1)) yield [items[i], ...rest];
  }
}

export interface SolveOptions {
  /** chord boxes: when the whole chord fits, also offer versions that leave out one doubled note */
  alternatives?: boolean;
}

/**
 * Pass 1: every note at its own pitch (a note with no placement at all takes its nearest octave).
 * Pass 2, only when pass 1 finds nothing: notes may move by octaves and may be dropped. Drop sets are
 * tried smallest first and the cheapest result wins, so a shift (5) beats dropping a doubling (7),
 * and dropping a doubling beats losing the bass (20). Branch-and-bound keeps only the k cheapest.
 */
export function solveColumn(
  pitches: Midi[],
  limits: Limits,
  pins: Record<number, Placement> = {},
  k = 8,
  opts: SolveOptions = {},
): ColumnSolution {
  const badPins: number[] = [];
  const notes: NoteIn[] = pitches.map((pitch, srcIndex) => {
    const pin = pins[srcIndex];
    if (pin) {
      const s = pinShift(pin, pitch, limits);
      if (s !== null) {
        const only = [{ placement: pin, shifted: s, pinned: true }];
        return { srcIndex, pitch, direct: only, all: only, pinned: true };
      }
      badPins.push(srcIndex);
    }
    return { srcIndex, pitch, direct: shiftedOptions(pitch, limits), all: octaveOptions(pitch, limits), pinned: false };
  });
  const roles = rolesOf(notes);
  const forced = notes.filter((n) => n.all.length === 0);
  const placeable = notes.filter((n) => n.all.length > 0);
  const penaltyOf = (dropped: NoteIn[], kept: NoteIn[]) => dropped.reduce((a, n) => a + dropPenalty(n, kept, roles), 0);
  const forcedPenalty = penaltyOf(forced, placeable);
  const size = Math.max(1, k);

  const primary = new TopK(size);
  search(placeable, 'direct', forced, forcedPenalty, limits, primary);

  const extra = new TopK(size);
  if (primary.items.length === 0) {
    const floor = (kept: number) => kept * WEIGHTS.open; // the cheapest any placement can be
    for (let d = 0; d <= placeable.length; d++) {
      if (forcedPenalty + d * WEIGHTS.dropDuplicate + floor(placeable.length - d) > primary.limit()) break;
      for (const drop of subsets(placeable, d)) {
        const kept = placeable.filter((n) => !drop.includes(n));
        const penalty = penaltyOf([...forced, ...drop], kept);
        if (penalty + floor(kept.length) > primary.limit()) continue;
        search(kept, 'all', [...forced, ...drop], penalty, limits, primary);
      }
    }
  } else if (opts.alternatives) {
    for (const n of placeable) {
      if (n.pinned || n === roles.bass || n === roles.top) continue;
      const kept = placeable.filter((x) => x !== n);
      const penalty = penaltyOf([...forced, n], kept);
      if (penalty > WEIGHTS.dropDoubling) continue;
      search(kept, 'direct', [...forced, n], penalty, limits, extra);
    }
  }

  // Full-chord candidates always come first, so alternatives never replace the default voicing.
  const candidates = [...primary.items, ...extra.items].slice(0, size);
  if (candidates.length === 0) {
    // Only reachable if the enumeration cap cut every search short; never return an empty list.
    candidates.push({ notes: [], dropped: notes.map((n) => ({ srcIndex: n.srcIndex, pitch: n.pitch })), cost: penaltyOf(notes, []), hand: null, bass: null, key: '' });
  }
  return { candidates, badPins };
}
