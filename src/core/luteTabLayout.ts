import type { LuteColumn, LuteTabEvent, Notation, Tuning } from './model';
import { noteGlyph } from './notation';

export const LAYOUT = { lineGap: 14, unit: 7, minGap: 20, margin: 20, systemGap: 28 };

/** Width the lute view is laid out at by default. */
export const LUTE_VIEW_WIDTH = 900;

/** Horizontal advance of a column: half a gap first in a system, else scaled by its distance from the previous column. */
function columnAdvance(x: number, lastSrcX: number | null): number {
  const { unit, minGap } = LAYOUT;
  return lastSrcX === null ? minGap / 2 : Math.min(minGap * 4, Math.max(minGap, (x - lastSrcX) * unit));
}

/** Pixel width `layoutLuteTab` needs to keep these items on one line, margins included. */
export function luteLineWidth(items: ({ kind: 'col'; x: number } | { kind: 'bar' })[]): number {
  let cursor: number = LAYOUT.margin;
  let lastSrcX: number | null = null;
  for (const it of items) {
    if (it.kind === 'bar') {
      if (lastSrcX !== null) cursor += LAYOUT.minGap / 2;
    } else {
      cursor += columnAdvance(it.x, lastSrcX);
      lastSrcX = it.x;
    }
  }
  return cursor + LAYOUT.margin;
}

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

/** The tab as bars: each bar's columns and whether a barline closes it. Line breaks are dropped. */
function barsOf(tab: LuteTabEvent[]): { cols: LuteColumn[]; closed: boolean }[] {
  const bars: { cols: LuteColumn[]; closed: boolean }[] = [];
  let cols: LuteColumn[] = [];
  for (const ev of tab) {
    if (ev.kind === 'col') cols.push(ev);
    else if (ev.kind === 'bar') {
      bars.push({ cols, closed: true });
      cols = [];
    }
  }
  if (cols.length) bars.push({ cols, closed: false });
  return bars;
}

export function layoutLuteTab(tab: LuteTabEvent[], tuning: Tuning, notation: Notation, maxWidth: number): TabLayout {
  const { lineGap, minGap, margin, systemGap } = LAYOUT;
  const lines = staffLineCount(tuning, notation);
  const extra = notation !== 'modern' && tuning.courses.length > 6;
  // Minimum rows of space above and below the staff; a system grows when its stacked diapasons need more.
  const minAbove = notation === 'italian' && extra ? 3 : 1;
  const minBelow = notation === 'french' && extra ? 3 : 1;
  const systems: SystemLayout[] = [];
  let y = 0;
  const make = (): SystemLayout => ({ y: 0, height: 0, lineYs: [], bars: [], glyphs: [], columns: [], width: 0 });
  let cur = make();
  /** each glyph's row relative to the top staff line, parallel to `cur.glyphs` */
  let rows: number[] = [];
  let cursor = margin;
  let lastSrcX: number | null = null;
  const restart = () => {
    if (cur.columns.length || cur.bars.length) {
      // keep one free row between the outermost glyph and the system edge
      const above = Math.max(minAbove, 1 - Math.min(0, ...rows));
      const below = Math.max(minBelow, Math.max(lines - 1, ...rows) - (lines - 1) + 1);
      const top = y + above * lineGap;
      cur.y = y;
      cur.height = (above + lines - 1 + below) * lineGap;
      cur.lineYs = Array.from({ length: lines }, (_, i) => top + i * lineGap);
      cur.glyphs.forEach((g, i) => (g.y = top + rows[i] * lineGap));
      cur.width = cursor + margin;
      systems.push(cur);
      y += cur.height + systemGap;
    }
    cur = make();
    rows = [];
    cursor = margin;
    lastSrcX = null;
  };

  const place = (ev: LuteColumn) => {
    let advance = columnAdvance(ev.x, lastSrcX);
    if (cursor + advance > maxWidth - margin && cur.columns.length) {
      restart();
      advance = minGap / 2;
    }
    const x = cursor + advance;
    cursor = x;
    lastSrcX = ev.x;
    cur.columns.push({ colIndex: ev.index, x });
    const stack = new Map<number, number>();
    for (const n of ev.notes) {
      const { course, fret } = n.placement;
      let row = rowFor(course, notation);
      if (notation !== 'modern' && course >= 7) {
        const k = stack.get(row) ?? 0;
        stack.set(row, k + 1);
        row += notation === 'french' ? k : -k;
      }
      rows.push(row);
      cur.glyphs.push({
        x,
        y: 0, // set when the system is finished

        text: noteGlyph(course, fret, notation),
        shifted: n.shifted !== 0,
        pinned: n.pinned,
        ledger: notation !== 'modern' && course === 6,
        colIndex: ev.index,
        noteIndex: n.srcNoteIndex,
      });
    }
  };

  // Lines fill the width with whole bars, ignoring the guitar tab's line breaks. A bar that
  // doesn't fit starts a new line, unless the line is under two-thirds full: then the bar is
  // split between columns to fill it (as is a bar wider than a line on its own).
  for (const bar of barsOf(tab)) {
    let end = cursor;
    let last: number | null = lastSrcX;
    for (const c of bar.cols) {
      end += columnAdvance(c.x, last);
      last = c.x;
    }
    if (bar.closed) end += minGap / 2;
    if (end > maxWidth - margin && cur.columns.length && cursor + margin >= (2 / 3) * maxWidth) restart();
    bar.cols.forEach(place);
    if (bar.closed && cur.columns.length) {
      cursor += minGap / 2;
      cur.bars.push(cursor);
    }
  }
  restart();
  const width = systems.length ? Math.max(...systems.map((s) => s.width)) : 0;
  const height = systems.length ? y - systemGap : 0;
  return { systems, width, height };
}
