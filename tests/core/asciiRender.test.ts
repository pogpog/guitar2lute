import { describe, it, expect } from 'vitest';
import { splitSystems, systemOrigins, tuningLabels, renderAsciiSystem, layoutAsciiSystem } from '../../src/core/asciiRender';
import { parseAsciiTab } from '../../src/core/parse/asciiTab';
import { STANDARD_GUITAR } from '../../src/core/tunings';
import type { TabEvent } from '../../src/core/model';
import { AM_ARPEGGIO, TWO_DIGIT, TWO_BLOCKS_NO_GAP } from './parse/fixtures';

const cols = (events: TabEvent[]) => events.flatMap((e) => (e.kind === 'col' ? [e.col.notes] : []));

describe('asciiRender', () => {
  it('labels standard tuning', () => {
    expect(tuningLabels(STANDARD_GUITAR)).toEqual(['e', 'B', 'G', 'D', 'A', 'E']);
  });
  it('splits systems at breaks', () => {
    expect(splitSystems(parseAsciiTab(TWO_BLOCKS_NO_GAP).events)).toHaveLength(2);
    expect(splitSystems([])).toEqual([]);
  });
  it('renders equal-length rows', () => {
    const rows = renderAsciiSystem(splitSystems(parseAsciiTab(AM_ARPEGGIO).events)[0], tuningLabels(STANDARD_GUITAR));
    expect(rows).toHaveLength(6);
    expect(new Set(rows.map((r) => r.length)).size).toBe(1);
    expect(rows[0].startsWith('e|')).toBe(true);
    expect(rows[0].endsWith('|')).toBe(true);
  });
  for (const [name, fixture] of [['arpeggio', AM_ARPEGGIO], ['two-digit', TWO_DIGIT]] as const) {
    it(`round-trips ${name} through the parser`, () => {
      const first = parseAsciiTab(fixture);
      const text = renderAsciiSystem(splitSystems(first.events)[0], tuningLabels(STANDARD_GUITAR)).join('\n');
      expect(cols(parseAsciiTab(text).events)).toEqual(cols(first.events));
    });
  }
  it('reports where each column sits in the rendered rows', () => {
    const sys = splitSystems(parseAsciiTab(TWO_DIGIT).events)[0];
    const { rows, spans } = layoutAsciiSystem(sys, tuningLabels(STANDARD_GUITAR));
    expect(rows).toEqual(renderAsciiSystem(sys, tuningLabels(STANDARD_GUITAR)));
    expect(spans).toHaveLength(cols(sys).length);
    // the first column holds 10 on the high e and 8 on B
    expect(rows[0].slice(spans[0].start, spans[0].end)).toBe('10');
    expect(rows[1].slice(spans[0].start, spans[0].end)).toBe('8-');
  });
});

// Bars at the start of each line, no string labels: a common way tab is pasted.
const BARRED = [
  '|0-----------------------3-------|----5-3-2-----------------------|',
  '|0-----------3-1-0-------0-------|------------5---4---------------|',
  '|0---------------0---2-----------|5-------2-----------------------|',
  '|--------2---4-------------------|5---------------4---------------|',
  '|--------------------------------|3---------------2---------------|',
  '|0---------------0---------------|--------------------------------|',
];
const LABELS = tuningLabels(STANDARD_GUITAR);
const render = (text: string) => {
  const events = parseAsciiTab(text).events;
  const origins = systemOrigins(events);
  return splitSystems(events).map((sys, i) => layoutAsciiSystem(sys, LABELS, origins[i]).rows);
};

describe('asciiRender keeps the source spacing', () => {
  it('draws pasted tab exactly as it was written', () => {
    expect(render(BARRED.join('\n'))).toEqual([BARRED.map((l, s) => LABELS[s] + l)]);
  });
  it('keeps each block of a longer tab as written', () => {
    const second = BARRED.map((l) => l.replace(/0/g, '2'));
    expect(render([...BARRED, '', ...second].join('\n'))).toEqual([
      BARRED.map((l, s) => LABELS[s] + l),
      second.map((l, s) => LABELS[s] + l),
    ]);
  });
  it('keeps labelled tab as written', () => {
    const labelled = ['e|--0--3-|', 'B|-------|', 'G|-------|', 'D|---2---|', 'A|-------|', 'E|0------|'];
    expect(render(labelled.join('\n'))).toEqual([labelled]);
  });
  it('keeps a dash between two notes on the same string even if the source had none', () => {
    const tight: TabEvent[] = [
      { kind: 'col', col: { notes: [{ string: 0, fret: 1 }], x: 1 } },
      { kind: 'col', col: { notes: [{ string: 0, fret: 2 }], x: 2 } },
      { kind: 'bar', x: 8 },
    ];
    const row = layoutAsciiSystem(tight, LABELS, 0).rows[0];
    expect(row).toBe('e|1-2----|'); // the bar stays at source position 8
    expect(cols(parseAsciiTab(layoutAsciiSystem(tight, LABELS, 0).rows.join('\n')).events)).toEqual([[{ string: 0, fret: 1 }], [{ string: 0, fret: 2 }]]);
  });
  it('lays out tab with no saved positions as before', () => {
    // pieces imported before positions were recorded have bars and breaks without x
    const old: TabEvent[] = [
      { kind: 'col', col: { notes: [{ string: 0, fret: 0 }], x: 1 } },
      { kind: 'bar' },
      { kind: 'col', col: { notes: [{ string: 0, fret: 3 }], x: 30 } },
      { kind: 'bar' },
      { kind: 'break' },
    ];
    expect(layoutAsciiSystem(splitSystems(old)[0], LABELS).rows[0]).toBe('e|--0--|--3--|');
  });
});
