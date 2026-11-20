import { describe, it, expect } from 'vitest';
import { parseAsciiTab } from '../../../src/core/parse/asciiTab';
import { importTabText } from '../../../src/core/parse/importText';
import type { TabEvent } from '../../../src/core/model';
import * as F from './fixtures';

const cols = (events: TabEvent[]) => events.flatMap((e) => (e.kind === 'col' ? [e.col.notes] : []));

describe('parseAsciiTab', () => {
  it('parses a simple labelled block with a closing barline', () => {
    const r = parseAsciiTab(F.AM_ARPEGGIO);
    expect(r.events.map((e) => e.kind)).toEqual(['col', 'col', 'col', 'col', 'col', 'bar', 'break']);
    expect(cols(r.events)).toEqual([
      [{ string: 4, fret: 0 }], [{ string: 2, fret: 2 }], [{ string: 1, fret: 1 }],
      [{ string: 0, fret: 0 }], [{ string: 1, fret: 1 }],
    ]);
    expect(r.events.flatMap((e) => (e.kind === 'col' ? [e.col.x] : []))).toEqual([2, 4, 6, 8, 10]);
    expect(r.labels).toEqual([4, 11, 7, 2, 9, 4]);
    expect(r.warnings).toEqual([]);
    const first = r.events[0];
    expect(first.kind === 'col' && first.col.src).toEqual({ line: 5, col: 4 });
  });

  it('groups two-digit frets with overlapping single digits', () => {
    expect(cols(parseAsciiTab(F.TWO_DIGIT).events)).toEqual([
      [{ string: 0, fret: 10 }, { string: 1, fret: 8 }],
      [{ string: 0, fret: 12 }, { string: 1, fret: 10 }],
    ]);
  });

  it('handles CRLF, unicode dashes, bends, dead notes and harmonics', () => {
    const r = parseAsciiTab(F.MESSY);
    expect(cols(r.events)).toEqual([[{ string: 0, fret: 7 }], [{ string: 0, fret: 5 }]]);
    expect(r.warnings.some((w) => /harmonic/i.test(w.message) && w.line === 4)).toBe(true);
  });

  it('skips lyrics/chord lines and picks the labelled 6 lines from a 7-line run', () => {
    const r = parseAsciiTab(F.WITH_LYRICS_AND_COUNTS);
    expect(cols(r.events)).toEqual([
      [{ string: 0, fret: 0 }, { string: 1, fret: 1 }, { string: 2, fret: 2 }, { string: 3, fret: 2 }, { string: 4, fret: 0 }],
      [{ string: 0, fret: 3 }, { string: 1, fret: 0 }, { string: 2, fret: 0 }, { string: 3, fret: 0 }, { string: 4, fret: 2 }, { string: 5, fret: 3 }],
    ]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0].line).toBe(2);
  });

  it('splits consecutive blocks and accumulates x', () => {
    const r = parseAsciiTab(F.TWO_BLOCKS_NO_GAP);
    expect(r.events.filter((e) => e.kind === 'break')).toHaveLength(2);
    const xs = r.events.flatMap((e) => (e.kind === 'col' ? [e.col.x] : []));
    expect(xs).toHaveLength(10);
    expect(xs[5]).toBeGreaterThan(xs[4]);
  });

  it('aligns columns when label widths differ', () => {
    expect(cols(parseAsciiTab(F.MIXED_LABEL_WIDTHS).events)).toEqual([
      [{ string: 0, fret: 0 }, { string: 1, fret: 1 }, { string: 2, fret: 0 }, { string: 3, fret: 2 }, { string: 4, fret: 3 }],
    ]);
  });

  it('aligns a line whose leading barline is a space', () => {
    const text = ['e|---0---|', 'B ---1---|', 'G|---0---|', 'D|---2---|', 'A|---3---|', 'E|-------|'].join('\n');
    expect(cols(parseAsciiTab(text).events)).toEqual([
      [{ string: 0, fret: 0 }, { string: 1, fret: 1 }, { string: 2, fret: 0 }, { string: 3, fret: 2 }, { string: 4, fret: 3 }],
    ]);
  });

  it('handles repeat marks and trailing repeat counts', () => {
    const r = parseAsciiTab(F.REPEATS);
    expect(r.events.map((e) => e.kind)).toEqual(['col', 'bar', 'break']);
    expect(cols(r.events)).toEqual([[{ string: 0, fret: 0 }]]);
  });

  it('warns when nothing is found', () => {
    const r = parseAsciiTab('just some words\nand more');
    expect(r.events).toEqual([]);
    expect(r.warnings[0].message).toMatch(/No guitar tab found/);
  });

  it('warns about short runs of tab-like lines', () => {
    const r = parseAsciiTab('e|--0--|\nB|--1--|\nG|--2--|');
    expect(r.events).toEqual([]);
    expect(r.warnings.some((w) => /expected 6/.test(w.message))).toBe(true);
  });
});

describe('parseAsciiTab — real-world variations', () => {
  const am = cols(parseAsciiTab(F.AM_ARPEGGIO).events);
  it('ignores text after the closing barline', () => {
    expect(cols(parseAsciiTab(F.TRAILING_TEXT).events)).toEqual(am);
  });
  it('accepts labels followed by a colon', () => {
    expect(cols(parseAsciiTab(F.COLON_LABELS).events)).toEqual(am);
  });
  it('keeps both blocks when a count line follows them', () => {
    const r = parseAsciiTab(F.TWO_BLOCKS_AND_COUNT);
    expect(cols(r.events)).toEqual([...am, ...am]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0].line).toBe(13);
  });
  it('does not take a count line above an unlabelled block as string 1', () => {
    const r = parseAsciiTab(F.COUNT_ABOVE_UNLABELLED);
    expect(cols(r.events)).toEqual(am);
    expect(r.warnings[0].line).toBe(1);
  });
  it('expands tab characters and CRLF line endings', () => {
    expect(cols(parseAsciiTab(F.WITH_TAB_CHARACTERS).events)).toEqual(am);
  });
});

describe('importTabText', () => {
  it('combines headers, parse and label tuning', () => {
    const r = importTabText(F.MESSY);
    expect(r.capo).toBe(2);
    expect(r.tuning!.id).toBe('guitar-drop-d');
    expect(cols(r.events)).toHaveLength(2);
  });
  it('infers tuning from labels when there is no header', () => {
    expect(importTabText(F.AM_ARPEGGIO).tuning!.id).toBe('guitar-standard');
  });
  it('returns null tuning when there are no labels or headers', () => {
    expect(importTabText(F.MESSY.replace('Tuning: Drop D', '')).tuning).toBeNull();
  });
});
