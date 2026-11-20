import type { TabColumn, TabEvent, Tuning } from './model';
import { midiToName } from './pitch';

export function splitSystems(events: TabEvent[]): TabEvent[][] {
  const out: TabEvent[][] = [];
  let cur: TabEvent[] = [];
  for (const e of events) {
    if (e.kind === 'break') {
      if (cur.length) out.push(cur);
      cur = [];
    } else cur.push(e);
  }
  if (cur.length) out.push(cur);
  return out;
}

export function tuningLabels(t: Tuning): string[] {
  const names = t.courses.map((m) => midiToName(m, false, false));
  if (names.length > 1 && names[0] === names[names.length - 1]) names[0] = names[0].toLowerCase();
  return names;
}

/**
 * Where each system's lines began in the source (parallel to splitSystems): the first system
 * starts at 0, later ones where the break before them says. Undefined when not recorded.
 */
export function systemOrigins(events: TabEvent[]): (number | undefined)[] {
  const out: (number | undefined)[] = [];
  let origin: number | undefined = 0;
  let any = false;
  for (const e of events) {
    if (e.kind === 'break') {
      if (any) out.push(origin);
      any = false;
      origin = e.next;
    } else any = true;
  }
  if (any) out.push(origin);
  return out;
}

/** Re-create ASCII tab from the model; see layoutAsciiSystem. */
export function renderAsciiSystem(system: TabEvent[], labels: string[], origin?: number): string[] {
  return layoutAsciiSystem(system, labels, origin).rows;
}

type Layout = { rows: string[]; spans: { start: number; end: number }[] };

const fretWidth = (col: TabColumn) => Math.max(1, ...col.notes.map((n) => String(n.fret).length));

/**
 * The rendered rows plus, for each column event in order, its [start, end) character range in every row.
 * With the system's source origin (and bar positions) known, notes and bars sit where they were in the
 * source, keeping at least one dash between two notes on the same string; otherwise gaps follow the source spacing, clamped
 * to 2..6 dashes.
 */
export function layoutAsciiSystem(system: TabEvent[], labels: string[], origin?: number): Layout {
  if (origin !== undefined && system.every((e) => e.kind !== 'bar' || e.x !== undefined)) {
    return layoutAtSource(system, labels, origin);
  }
  const w = Math.max(...labels.map((l) => l.length));
  const rows = labels.map((l) => `${l.padEnd(w)}|`);
  const spans: { start: number; end: number }[] = [];
  let lastX: number | null = null;
  let lastWasBar = false;
  for (const ev of system) {
    if (ev.kind === 'bar') {
      for (let s = 0; s < rows.length; s++) rows[s] += '--|';
      lastX = null;
      lastWasBar = true;
      continue;
    }
    if (ev.kind !== 'col') continue;
    const gap = lastX === null ? 2 : Math.max(2, Math.min(6, ev.col.x - lastX - 1));
    const cw = fretWidth(ev.col);
    const start = rows[0].length + gap;
    spans.push({ start, end: start + cw });
    for (let s = 0; s < rows.length; s++) {
      const note = ev.col.notes.find((n) => n.string === s);
      rows[s] += '-'.repeat(gap) + (note ? String(note.fret).padEnd(cw, '-') : '-'.repeat(cw));
    }
    lastX = ev.col.x + cw - 1;
    lastWasBar = false;
  }
  if (!lastWasBar) for (let s = 0; s < rows.length; s++) rows[s] += '--|';
  return { rows, spans };
}

function layoutAtSource(system: TabEvent[], labels: string[], origin: number): Layout {
  const w = Math.max(...labels.map((l) => l.length));
  const rows = labels.map((l) => `${l.padEnd(w)}|`); // this barline stands at the source origin
  const spans: { start: number; end: number }[] = [];
  const add = (cells: (s: number) => string) => rows.forEach((_, s) => (rows[s] += cells(s)));
  let pos = origin + 1; // the source position the next character stands for
  let prev: TabColumn | null = null; // the column just before, if no bar came between
  for (const ev of system) {
    if (ev.kind === 'bar') {
      const gap = Math.max(0, ev.x! - pos);
      add(() => `${'-'.repeat(gap)}|`);
      pos += gap + 1;
      prev = null;
    } else if (ev.kind === 'col') {
      // two notes on one string need a dash between them, or they would read as one number
      const shared = prev?.notes.some((p) => ev.col.notes.some((n) => n.string === p.string)) ?? false;
      const gap = Math.max(shared ? 1 : 0, ev.col.x - pos);
      const cw = fretWidth(ev.col);
      const start = rows[0].length + gap;
      spans.push({ start, end: start + cw });
      add((s) => {
        const note = ev.col.notes.find((n) => n.string === s);
        return '-'.repeat(gap) + (note ? String(note.fret).padEnd(cw, '-') : '-'.repeat(cw));
      });
      pos += gap + cw;
      prev = ev.col;
    }
  }
  if (system[system.length - 1]?.kind !== 'bar') add(() => '--|');
  return { rows, spans };
}
