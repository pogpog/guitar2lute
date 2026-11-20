import type {
  LuteChord, LuteNote, LuteResult, LuteSettings, LuteTabEvent, Midi, Piece, Placement, Warning,
} from '../model';
import type { ColumnCandidate, ColumnSolution, Limits } from './types';
import { chordPitches, columnPitches } from '../piece';
import { midiToName, pitchClass, preferFlats, prettyName } from '../pitch';
import { detectChordName, transposeChordName } from '../chordName';
import { solveColumn } from './column';
import { viterbi } from './viterbi';
import { placementsForPitch } from './candidates';
import { isPlayable } from './playability';

export function limitsOf(s: LuteSettings): Limits {
  return { tuning: s.tuning, maxFret: s.maxFret, maxStretch: s.maxStretch };
}

function toLuteNotes(c: ColumnCandidate): LuteNote[] {
  return c.notes.map((n) => ({ placement: n.placement, pitch: n.pitch, shifted: n.shifted, pinned: n.pinned, srcNoteIndex: n.srcIndex }));
}

export function convertPiece(piece: Piece, transpose: number = piece.lute.transpose): LuteResult {
  const limits = limitsOf(piece.lute);
  const { tuning, capo } = piece.guitar;
  const chordInputs = piece.guitar.chords.map((sh) => chordPitches(sh, tuning, capo).map((p) => p.pitch + transpose));
  const colInputs: Midi[][] = [];
  for (const ev of piece.guitar.tab) {
    if (ev.kind === 'col') colInputs.push(columnPitches(ev.col, tuning, capo).map((p) => p + transpose));
  }
  const flats = preferFlats([...chordInputs.flat(), ...colInputs.flat()]);
  const nm = (m: Midi) => prettyName(midiToName(m, flats));
  const warnings: Warning[] = [];
  const stats = { shifted: 0, dropped: 0 };

  const report = (c: ColumnCandidate, inputs: Midi[], where: string, extra: Partial<Warning>) => {
    const bassSrc = inputs.length ? inputs.indexOf(Math.min(...inputs)) : -1;
    let bassReported = false;
    for (const n of c.notes) {
      if (n.shifted === 0) continue;
      stats.shifted++;
      const isBass = n.srcIndex === bassSrc;
      if (isBass) bassReported = true;
      const dir = n.shifted > 0 ? 'up' : 'down';
      const amount = Math.abs(n.shifted) === 24 ? 'two octaves' : 'an octave';
      warnings.push({
        kind: isBass ? 'inversion' : 'shift',
        message: `${where}: ${nm(n.pitch - n.shifted)} moved ${dir} ${amount}${isBass ? ' (bass note, so the inversion changed)' : ''}.`,
        ...extra,
      });
    }
    for (const d of c.dropped) {
      stats.dropped++;
      warnings.push({ kind: 'drop', message: `${where}: ${nm(d.pitch)} dropped (no playable place).`, ...extra });
    }
    // A dropped bass, or another note shifted below it, also changes the inversion.
    if (!bassReported && c.notes.length && bassSrc >= 0) {
      const low = c.notes.reduce((a, b) => (b.pitch < a.pitch ? b : a));
      if (pitchClass(low.pitch) !== pitchClass(inputs[bassSrc])) {
        warnings.push({
          kind: 'inversion',
          message: `${where}: the lowest note is now ${nm(low.pitch)} instead of ${nm(inputs[bassSrc])}, so the inversion changed.`,
          ...extra,
        });
      }
    }
  };
  /** One warning per chord or column: a click pins the whole shape, so its pins go stale together. */
  const reportPins = (bad: number[], where: string, extra: Partial<Warning>) => {
    if (!bad.length) return;
    const what = bad.length === 1 ? '1 manual placement no longer fits and is' : `${bad.length} manual placements no longer fit and are`;
    warnings.push({ kind: 'pin', message: `${where}: ${what} ignored.`, ...extra });
  };

  let totalCost = 0;
  const chords: LuteChord[] = piece.guitar.chords.map((shape, i) => {
    const pitches = chordInputs[i];
    const sol = solveColumn(pitches, limits, piece.overrides.chordPins[i] ?? {}, 3, { alternatives: true });
    const voicings = sol.candidates.map((c) => ({ notes: toLuteNotes(c), dropped: c.dropped.map((d) => d.pitch), cost: c.cost }));
    const chosen = Math.max(0, Math.min(piece.overrides.chordVoicing[i] ?? 0, voicings.length - 1));
    // A typed name describes the shape, so it moves with the capo as well as the transpose.
    const name = shape.name.trim() ? transposeChordName(shape.name.trim(), capo + transpose, flats) : detectChordName(pitches, flats);
    const where = `Chord ${i + 1}${name ? ` (${prettyName(name)})` : ''}`;
    reportPins(sol.badPins, where, { chord: i });
    const picked = sol.candidates[chosen];
    if (picked) {
      report(picked, pitches, where, { chord: i });
      totalCost += picked.cost;
    }
    return { name, voicings, chosen };
  });

  // Songs repeat columns a lot; solve each distinct (pitches, pins) once.
  const memo = new Map<string, ColumnSolution>();
  const solutions = colInputs.map((pitches, ci) => {
    const pins = piece.overrides.tabPins[ci] ?? {};
    const key = `${pitches.join(',')}|${JSON.stringify(pins)}`;
    let sol = memo.get(key);
    if (!sol) {
      sol = solveColumn(pitches, limits, pins);
      memo.set(key, sol);
    }
    return sol;
  });
  const { path, cost } = viterbi(solutions.map((s) => s.candidates));
  totalCost += cost;
  const tab: LuteTabEvent[] = [];
  let ci = 0;
  for (const ev of piece.guitar.tab) {
    if (ev.kind !== 'col') {
      tab.push(ev);
      continue;
    }
    const c = solutions[ci].candidates[path[ci]];
    const line = ev.col.src?.line;
    const where = `Tab column ${ci + 1}${line ? ` (line ${line})` : ''}`;
    reportPins(solutions[ci].badPins, where, { tabColumn: ci, line });
    report(c, colInputs[ci], where, { tabColumn: ci, line });
    tab.push({ kind: 'col', index: ci, x: ev.col.x, notes: toLuteNotes(c), dropped: c.dropped.map((d) => d.pitch) });
    ci++;
  }
  return { chords, tab, warnings, totalCost, stats, flats };
}

export function placementCycle(pitch: Midi, limits: Limits): { placement: Placement; shifted: number }[] {
  const out: { placement: Placement; shifted: number }[] = [];
  for (const s of [0, 12, -12, 24, -24]) {
    for (const placement of placementsForPitch(pitch + s, limits)) out.push({ placement, shifted: s });
  }
  return out;
}

/**
 * The next placement for a clicked note. `others` are the notes that stay in the column or chord:
 * options on their courses, octave shifts into unison with them, and shapes that become
 * unplayable are skipped, so cycling one note never forces another out.
 */
export function nextPlacement(
  pitch: Midi,
  current: Placement,
  limits: Limits,
  others: { placement: Placement; pitch: Midi }[] = [],
): Placement {
  const same = (p: Placement) => p.course === current.course && p.fret === current.fret;
  const usable = placementCycle(pitch, limits).filter(
    (c) =>
      same(c.placement) ||
      (!others.some((o) => o.placement.course === c.placement.course) &&
        !(c.shifted !== 0 && others.some((o) => o.pitch === pitch + c.shifted)) &&
        isPlayable([...others.map((o) => o.placement), c.placement], limits)),
  );
  if (usable.length === 0) return current;
  const i = usable.findIndex((c) => same(c.placement));
  return usable[(i + 1) % usable.length].placement;
}

/**
 * Pins for a click on one shown note: the clicked note moves to its next placement and every
 * other shown note is pinned where it is, so the shape on screen is exactly what is kept.
 */
export function cycleNote(shown: LuteNote[], srcNoteIndex: number, limits: Limits): Record<number, Placement> | null {
  const n = shown.find((x) => x.srcNoteIndex === srcNoteIndex);
  if (!n) return null;
  const next = nextPlacement(n.pitch - n.shifted, n.placement, limits, shown.filter((x) => x !== n));
  const pins: Record<number, Placement> = {};
  for (const x of shown) pins[x.srcNoteIndex] = x === n ? next : x.placement;
  return pins;
}
