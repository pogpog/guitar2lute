import { describe, it, expect } from 'vitest';
import { tabCodeNote, toTabCode } from '../../src/core/tabcode';
import type { LuteColumn, LuteNote, LuteResult } from '../../src/core/model';

const n = (course: number, fret: number): LuteNote => ({ placement: { course, fret }, pitch: 0, shifted: 0, pinned: false, srcNoteIndex: 0 });
const col = (index: number, notes: LuteNote[]): LuteColumn => ({ kind: 'col', index, x: index * 3, notes, dropped: [] });

describe('TabCode', () => {
  it('encodes notes on courses 1-7 and diapasons', () => {
    expect(tabCodeNote(0, 0)).toBe('a1');
    expect(tabCodeNote(5, 2)).toBe('c6');
    expect(tabCodeNote(6, 0)).toBe('a7');
    expect(tabCodeNote(7, 0)).toBe('Xa');
    expect(tabCodeNote(8, 0)).toBe('Xa/');
    expect(tabCodeNote(9, 0)).toBe('Xa//');
  });
  it('writes chords, bars and systems', () => {
    const result: LuteResult = {
      chords: [{ name: 'G', voicings: [{ notes: [n(5, 0), n(0, 0)], dropped: [], cost: 0 }], chosen: 0 }],
      tab: [col(0, [n(0, 0)]), { kind: 'bar' }, col(1, [n(5, 0), n(1, 2)]), { kind: 'break' }, col(2, [n(0, 3)]), col(3, [])],
      warnings: [], totalCost: 0, stats: { shifted: 0, dropped: 0 }, flats: true,
    };
    expect(toTabCode(result, 'My {Song}')).toBe('{My Song}\n{Chords}\na1a6\n{Tablature}\na1 | c2a6\nd1\n');
  });
});
