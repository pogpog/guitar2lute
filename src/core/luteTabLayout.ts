import type { LuteTabEvent, Notation, Tuning } from './model';
import { noteGlyph } from './notation';

export const LAYOUT = { lineGap: 14, unit: 7, minGap: 20, margin: 20, systemGap: 28 };

export interface Glyph {
  x: number;
  y: number;
  text: string;
  shifted: boolean;
  pinned: boolean;
  ledger: boolean;
  colIndex: number;
  noteIndex: number;
}

export interface SystemLayout {
  y: number;
  height: number;
  lineYs: number[];
  bars: number[];
  glyphs: Glyph[];
  columns: { colIndex: number; x: number }[];
  width: number;
}

export interface TabLayout { systems: SystemLayout[]; width: number; height: number; }

export function staffLineCount(tuning: Tuning, notation: Notation): number {
  return notation === 'modern' ? tuning.courses.length : 6;
}

/** Row relative to the top staff line (0); negative = above, >= line count = below. */
export function rowFor(course: number, notation: Notation): number {
  if (notation === 'modern') return course;
  if (notation === 'french') return course < 6 ? course : course === 6 ? 6 : 7;
  return course < 6 ? 5 - course : course === 6 ? -1 : -2;
}

export function layoutLuteTab(tab: LuteTabEvent[], tuning: Tuning, notation: Notation, maxWidth: number): TabLayout {
  const { lineGap, unit, minGap, margin, systemGap } = LAYOUT;
  const lines = staffLineCount(tuning, notation);
  const extra = notation !== 'modern' && tuning.courses.length > 6;
  const rowsAbove = notation === 'italian' && extra ? 3 : 1;
  const rowsBelow = notation === 'french' && extra ? 3 : 1;
  const systems: SystemLayout[] = [];
  let y = 0;
  const make = (): SystemLayout => {
    const top = y + rowsAbove * lineGap;
    return {
      y,
      height: (rowsAbove + lines - 1 + rowsBelow) * lineGap,
      lineYs: Array.from({ length: lines }, (_, i) => top + i * lineGap),
      bars: [],
      glyphs: [],
      columns: [],
      width: 0,
    };
  };
  let cur = make();
  let cursor = margin;
  let lastSrcX: number | null = null;
  const restart = () => {
    if (cur.columns.length || cur.bars.length) {
      cur.width = cursor + margin;
      systems.push(cur);
      y += cur.height + systemGap;
    }
    cur = make();
    cursor = margin;
    lastSrcX = null;
  };

  for (const ev of tab) {
    if (ev.kind === 'break') {
      restart();
      continue;
    }
    if (ev.kind === 'bar') {
      if (cur.columns.length) {
        cursor += minGap / 2;
        cur.bars.push(cursor);
      }
      continue;
    }
    let advance: number = lastSrcX === null ? minGap / 2 : Math.min(minGap * 4, Math.max(minGap, (ev.x - lastSrcX) * unit));
    if (cursor + advance > maxWidth - margin && cur.columns.length) {
      restart();
      advance = minGap / 2;
    }
    const x = cursor + advance;
    cursor = x;
    lastSrcX = ev.x;
    cur.columns.push({ colIndex: ev.index, x });
    const top = cur.lineYs[0];
    const stack = new Map<number, number>();
    for (const n of ev.notes) {
      const { course, fret } = n.placement;
      let row = rowFor(course, notation);
      if (notation !== 'modern' && course >= 7) {
        const k = stack.get(row) ?? 0;
        stack.set(row, k + 1);
        row += notation === 'french' ? k : -k;
      }
      cur.glyphs.push({
        x,
        y: top + row * lineGap,
        text: noteGlyph(course, fret, notation),
        shifted: n.shifted !== 0,
        pinned: n.pinned,
        ledger: notation !== 'modern' && course === 6,
        colIndex: ev.index,
        noteIndex: n.srcNoteIndex,
      });
    }
  }
  restart();
  const width = systems.length ? Math.max(...systems.map((s) => s.width)) : 0;
  const height = systems.length ? y - systemGap : 0;
  return { systems, width, height };
}
