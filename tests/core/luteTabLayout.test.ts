import { describe, it, expect } from 'vitest';
import { layoutLuteTab, luteLineWidth, LUTE_VIEW_WIDTH, LAYOUT } from '../../src/core/luteTabLayout';
import { findPreset } from '../../src/core/tunings';
import type { LuteNote, LuteTabEvent } from '../../src/core/model';

const note = (course: number, fret: number, extra: Partial<LuteNote> = {}): LuteNote => ({
  placement: { course, fret }, pitch: 0, shifted: 0, pinned: false, srcNoteIndex: 0, ...extra,
});
const col = (index: number, x: number, notes: LuteNote[]): LuteTabEvent => ({ kind: 'col', index, x, notes, dropped: [] });
const six = findPreset('lute-6-g')!;
const eight = findPreset('lute-8-g')!;

describe('layoutLuteTab', () => {
  it('puts course 1 on the top line in French and the bottom line in Italian', () => {
    const fr = layoutLuteTab([col(0, 0, [note(0, 0)])], six, 'french', 800).systems[0];
    expect(fr.glyphs[0]).toMatchObject({ text: 'a', y: fr.lineYs[0] });
    const it6 = layoutLuteTab([col(0, 0, [note(0, 0)])], six, 'italian', 800).systems[0];
    expect(it6.glyphs[0]).toMatchObject({ text: '0', y: it6.lineYs[5] });
  });
  it('writes French diapasons below the staff', () => {
    const s = layoutLuteTab([col(0, 0, [note(7, 0)])], eight, 'french', 800).systems[0];
    expect(s.glyphs[0].text).toBe('/a');
    expect(s.glyphs[0].y).toBe(s.lineYs[5] + 2 * LAYOUT.lineGap);
  });
  it('writes the Italian 7th course on a ledger above the staff', () => {
    const s = layoutLuteTab([col(0, 0, [note(6, 2)])], eight, 'italian', 800).systems[0];
    expect(s.glyphs[0]).toMatchObject({ text: '2', ledger: true, y: s.lineYs[0] - LAYOUT.lineGap });
  });
  it('gives every course its own line in modern notation', () => {
    const s = layoutLuteTab([col(0, 0, [note(7, 0)])], eight, 'modern', 800).systems[0];
    expect(s.lineYs).toHaveLength(8);
    expect(s.glyphs[0].y).toBe(s.lineYs[7]);
  });
  it('flags shifted and pinned notes and keeps column/note ids', () => {
    const g = layoutLuteTab([col(4, 0, [note(0, 0, { shifted: 12, pinned: true, srcNoteIndex: 2 })])], six, 'french', 800).systems[0].glyphs[0];
    expect(g).toMatchObject({ shifted: true, pinned: true, colIndex: 4, noteIndex: 2 });
  });
  it('places bars between columns and runs on across the guitar tab\'s line breaks', () => {
    const l = layoutLuteTab([col(0, 0, [note(0, 0)]), { kind: 'bar' }, col(1, 3, [note(0, 1)]), { kind: 'break' }, col(2, 10, [note(0, 2)])], six, 'french', 800);
    expect(l.systems).toHaveLength(1);
    const [a, b, c] = l.systems[0].columns.map((col) => col.x);
    expect(l.systems[0].bars).toHaveLength(1);
    expect(l.systems[0].bars[0]).toBeGreaterThan(a);
    expect(l.systems[0].bars[0]).toBeLessThan(b);
    expect(c).toBeGreaterThan(b);
  });
  it('fills each line with whole bars', () => {
    // a bar is 4 columns 3 characters apart: 3 bars fit in 400 px (311 px), 4 don't (405 px)
    const tab: LuteTabEvent[] = [];
    for (let m = 0; m < 10; m++) {
      for (let k = 0; k < 4; k++) tab.push(col(m * 4 + k, m * 13 + k * 3, [note(0, 0)]));
      tab.push({ kind: 'bar' });
      if (m % 2 === 1) tab.push({ kind: 'break' });
    }
    const l = layoutLuteTab(tab, six, 'french', 400);
    expect(l.systems.map((s) => s.columns.length)).toEqual([12, 12, 12, 4]);
    expect(l.systems.map((s) => s.bars.length)).toEqual([3, 3, 3, 1]);
    for (const s of l.systems) expect(s.width).toBeLessThanOrEqual(400);
  });
  it('splits the next bar rather than leave a line less than two-thirds full', () => {
    const tab: LuteTabEvent[] = [col(0, 0, [note(0, 0)]), { kind: 'bar' }];
    for (let k = 0; k < 40; k++) tab.push(col(k + 1, 4 + k * 3, [note(0, 0)]));
    tab.push({ kind: 'bar' }, col(41, 200, [note(0, 0)]));
    const l = layoutLuteTab(tab, six, 'french', 400);
    // the one-column bar would leave the line 40 px of 400 full: the long bar continues on it
    expect(l.systems[0].bars).toHaveLength(1);
    expect(l.systems[0].columns.length).toBeGreaterThan(10);
    for (const s of l.systems) expect(s.width).toBeLessThanOrEqual(400);
    expect(l.systems.flatMap((s) => s.columns)).toHaveLength(42);
  });
  it('wraps long systems to the width', () => {
    const tab = Array.from({ length: 100 }, (_, i) => col(i, i * 3, [note(0, 0)]));
    const l = layoutLuteTab(tab, six, 'french', 400);
    expect(l.systems.length).toBeGreaterThan(1);
    for (const s of l.systems) expect(s.width).toBeLessThanOrEqual(400);
  });
  it('returns an empty layout for an empty tab', () => {
    expect(layoutLuteTab([], six, 'french', 800)).toEqual({ systems: [], width: 0, height: 0 });
  });
  it('makes room for stacked diapasons so no glyph leaves its system or meets the next one', () => {
    const thirteen = findPreset('lute-13-baroque-dm')!;
    const stack = [note(6, 0), note(7, 0), note(8, 0), note(9, 0), note(10, 0)];
    for (const notation of ['french', 'italian'] as const) {
      // 60 px fits one column a line
      const { systems } = layoutLuteTab([col(0, 0, stack), col(1, 0, stack)], thirteen, notation, 60);
      expect(systems).toHaveLength(2);
      for (const s of systems) {
        for (const g of s.glyphs) {
          expect(g.y, notation).toBeGreaterThanOrEqual(s.y + LAYOUT.lineGap / 2);
          expect(g.y, notation).toBeLessThanOrEqual(s.y + s.height - LAYOUT.lineGap / 2);
        }
      }
      expect(systems[1].y, notation).toBeGreaterThanOrEqual(systems[0].y + systems[0].height + LAYOUT.systemGap);
    }
  });
});

describe('luteLineWidth', () => {
  type Item = { kind: 'col'; x: number } | { kind: 'bar' };
  /** `bars` bars spread over columns every `step` chars, `perBar` columns per bar */
  const items = (bars: number, perBar: number, step: number): Item[] => {
    const out: Item[] = [];
    let x = 0;
    for (let b = 0; b < bars; b++) {
      if (b > 0) out.push({ kind: 'bar' });
      for (let i = 0; i < perBar; i++, x += step) out.push({ kind: 'col', x });
    }
    return out;
  };
  const toEvents = (list: Item[]): LuteTabEvent[] => {
    let index = 0;
    return list.map((it) => (it.kind === 'bar' ? it : col(index++, it.x, [note(0, 0)])));
  };

  it('agrees with the layout', () => {
    const cases = [
      items(3, 12, 3), // 3/4 in 16ths
      items(2, 16, 3),
      items(5, 8, 3), // 2/4
      items(1, 3, 3),
      items(8, 16, 3),
      items(6, 7, 5),
      items(4, 11, 2),
    ];
    const fits: boolean[] = [];
    for (const c of cases) {
      const oneLine = layoutLuteTab(toEvents(c), six, 'french', LUTE_VIEW_WIDTH).systems.length === 1;
      expect(luteLineWidth(c) <= LUTE_VIEW_WIDTH).toBe(oneLine);
      fits.push(oneLine);
    }
    expect(fits).toContain(true);
    expect(fits).toContain(false);
  });
  it('ignores a leading bar', () => {
    expect(luteLineWidth([{ kind: 'bar' }, { kind: 'col', x: 0 }])).toBe(luteLineWidth([{ kind: 'col', x: 0 }]));
  });
});
