import type { TabEvent, Tuning } from './model';
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

/** Re-create readable ASCII tab from the model. Gaps follow source x spacing, clamped to 2..6 dashes. */
export function renderAsciiSystem(system: TabEvent[], labels: string[]): string[] {
  const w = Math.max(...labels.map((l) => l.length));
  const rows = labels.map((l) => `${l.padEnd(w)}|`);
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
    const cw = Math.max(1, ...ev.col.notes.map((n) => String(n.fret).length));
    for (let s = 0; s < rows.length; s++) {
      const note = ev.col.notes.find((n) => n.string === s);
      rows[s] += '-'.repeat(gap) + (note ? String(note.fret).padEnd(cw, '-') : '-'.repeat(cw));
    }
    lastX = ev.col.x + cw - 1;
    lastWasBar = false;
  }
  if (!lastWasBar) for (let s = 0; s < rows.length; s++) rows[s] += '--|';
  return rows;
}
