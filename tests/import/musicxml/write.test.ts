import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { writeTabText } from '../../../src/import/musicxml/write';
import { readMusicXml, type TabMeasure, type TabNote, type TabScore } from '../../../src/import/musicxml/read';
import { parseXml, type XmlParser } from '../../../src/import/musicxml/xml';
import { importTabText } from '../../../src/core/parse/importText';
import { layoutLuteTab, LUTE_VIEW_WIDTH } from '../../../src/core/luteTabLayout';
import { findPreset } from '../../../src/core/tunings';
import type { LuteTabEvent, TabColumn } from '../../../src/core/model';
import { backup, n, score, tabAttrs } from './build';

const parser = new DOMParser({ onError: () => {} }) as unknown as XmlParser;

const STANDARD = [64, 59, 55, 50, 45, 40];

/** Measures of these lengths, back to back from time 0; `newBlock` lists measure indexes. */
function measuresOf(lengths: number[], newBlock: number[] = []): TabMeasure[] {
  let start = 0;
  return lengths.map((length, i) => {
    const m = { number: String(i + 1), start, length, newBlock: newBlock.includes(i) };
    start += length;
    return m;
  });
}

/** One note per time on `string`, in the measure that holds it; frets cycle through `frets`. */
function notesAt(measures: TabMeasure[], times: number[], o: { string?: number; frets?: number[]; slot?: number } = {}): TabNote[] {
  const frets = o.frets ?? [0];
  return times.map((time, i) => ({
    time,
    slot: o.slot ?? 0,
    string: o.string ?? 0,
    fret: frets[i % frets.length],
    measure: measures.findIndex((m) => time >= m.start && time < m.start + m.length),
  }));
}

function tabScore(o: { unit: number; measures: TabMeasure[]; notes: TabNote[]; tuning?: number[]; capo?: number }): TabScore {
  const notes = o.notes
    .slice()
    .sort((a, b) => a.time - b.time || a.slot - b.slot || a.string - b.string);
  return { unit: o.unit, tuning: o.tuning ?? STANDARD, capo: o.capo ?? 0, measures: o.measures, notes, notices: [] };
}

/** times from `from` (inclusive) to `to` (exclusive) every `step` */
function every(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let t = from; t < to; t += step) out.push(t);
  return out;
}

/** The generated text parsed back: column x positions, bar x positions, block count. */
function parsed(text: string): { cols: TabColumn[]; xs: number[]; bars: number[]; breaks: number; events: ReturnType<typeof importTabText>['events'] } {
  const { events, warnings } = importTabText(text);
  expect(warnings).toEqual([]);
  const cols = events.flatMap((e) => (e.kind === 'col' ? [e.col] : []));
  return {
    cols,
    xs: cols.map((c) => c.x),
    bars: events.flatMap((e) => (e.kind === 'bar' ? [e.x as number] : [])),
    breaks: events.filter((e) => e.kind === 'break').length,
    events,
  };
}

/** The six-line blocks of the text, without the headers. */
function blocksOf(text: string): string[][] {
  return text
    .trimEnd()
    .split('\n\n')
    .slice(1)
    .map((b) => b.split('\n'));
}

/** Bars per block: the `|` count on the top line, less the opening one. */
function barsPerBlock(text: string): number[] {
  return blocksOf(text).map((lines) => [...lines[0]].filter((c) => c === '|').length - 1);
}

describe('headers and labels', () => {
  const one = (tuning: number[], capo = 0) => {
    const measures = measuresOf([4]);
    return writeTabText(tabScore({ unit: 1, measures, notes: notesAt(measures, [0, 1, 2, 3]), tuning, capo }));
  };

  it('writes the tuning low to high with octaves, the capo and a blank line', () => {
    const lines = one(STANDARD).split('\n');
    expect(lines.slice(0, 3)).toEqual(['Tuning: E2 A2 D3 G3 B3 E4', 'Capo: 0', '']);
    expect(one(STANDARD, 3).split('\n')[1]).toBe('Capo: 3');
  });

  it('labels the strings with tuningLabels, top string lower-cased when it repeats the bottom', () => {
    expect(blocksOf(one(STANDARD))[0].map((l) => l.slice(0, 2))).toEqual(['e|', 'B|', 'G|', 'D|', 'A|', 'E|']);
    const halfDown = [63, 58, 54, 49, 44, 39];
    const text = one(halfDown);
    expect(text.split('\n')[0]).toBe('Tuning: D#2 G#2 C#3 F#3 A#3 D#4');
    expect(blocksOf(text)[0].map((l) => l.slice(0, 3))).toEqual(['d#|', 'A#|', 'F#|', 'C#|', 'G#|', 'D#|']);
    expect(importTabText(text).tuning?.courses).toEqual(halfDown);
  });

  it('writes sharps in ASCII in the header', () => {
    const lute = [64, 59, 54, 50, 45, 40];
    const text = one(lute);
    expect(text.split('\n')[0]).toBe('Tuning: E2 A2 D3 F#3 B3 E4');
    expect(importTabText(text).tuning?.courses).toEqual(lute);
  });

  it('pads labels of different lengths so every line starts its tab together', () => {
    const text = one([64, 59, 55, 50, 45, 37]); // low C#
    const lines = blocksOf(text)[0];
    expect(lines.map((l) => l.indexOf('|'))).toEqual([2, 2, 2, 2, 2, 2]);
    expect(lines[0].startsWith('E |')).toBe(true);
    expect(lines[5].startsWith('C#|')).toBe(true);
  });
});

describe('scale', () => {
  it('gives a 16th 3 characters and the barline a character of its own, outside the time', () => {
    const measures = measuresOf([4, 4]);
    const text = writeTabText(tabScore({ unit: 4, measures, notes: notesAt(measures, every(0, 8, 1)) }));
    expect(blocksOf(text)[0][0]).toBe('e|0--0--0--0--|0--0--0--0--|');
    const { xs, bars, events } = parsed(text);
    expect(xs).toEqual([1, 4, 7, 10, 14, 17, 20, 23]);
    expect(bars).toEqual([13, 26]);
    expect(events.flatMap((e) => (e.kind === 'col' ? [e.col.t] : []))).toEqual(every(0, 24, 3));
  });

  it('squeezes a single 32nd instead of scaling the piece by it', () => {
    // unit 8: a 16th is 2, a 32nd 1; bar 1 = dotted 16th, 32nd, then 16ths; bar 2 = 16ths
    const measures = measuresOf([32, 32]);
    const notes = notesAt(measures, [0, 3, ...every(4, 64, 2)]);
    const { xs, bars } = parsed(writeTabText(tabScore({ unit: 8, measures, notes })));
    expect(xs.slice(0, 5)).toEqual([1, 6, 8, 10, 13]);
    expect(bars).toEqual([49, 98]);
    expect(xs.slice(16)).toEqual(every(50, 97, 3));
  });

  it('keeps the musical 16th when snapped clusters leave a few uneven gaps', () => {
    // divisions 100: a 16th is 25; voice 2 enters at 24, so the 16th at 25 snaps to 24 (gaps 24, 26)
    const sixteenths = Array.from({ length: 16 }, (_, i) => n({ s: 1, f: i % 4, d: 25 })).join('');
    const late = backup(400) + n({ v: 2, rest: true, d: 24 }) + n({ v: 2, s: 6, f: 0, d: 376 });
    const xml = score([
      {
        id: 'P1',
        measures: [tabAttrs({ divisions: 100 }) + sixteenths + late, sixteenths + late, sixteenths, sixteenths],
      },
    ]);
    const s = readMusicXml(parseXml(xml, parser));
    expect(s.notes.some((x) => x.time === 24)).toBe(true);
    const { xs, bars } = parsed(writeTabText(s));
    expect(bars).toEqual([49, 98, 147, 196]);
    expect(xs.slice(-16)).toEqual(every(148, 195, 3));
  });

  it('falls back to the most common gap when none makes up 5%', () => {
    // gaps 1..25 once each, and the gap of 2 again to the end of the measure
    const times = every(0, 26, 1).map((k) => (k * (k + 1)) / 2);
    const measures = measuresOf([times[times.length - 1] + 2]);
    const { bars } = parsed(writeTabText(tabScore({ unit: 4, measures, notes: notesAt(measures, times) })));
    expect(bars).toEqual([Math.round((327 * 3) / 2) + 1]);
  });

  it('gives a quarter 12 characters in a single-column piece', () => {
    const measures = measuresOf([4]);
    const text = writeTabText(tabScore({ unit: 4, measures, notes: notesAt(measures, [0], { frets: [3] }) }));
    expect(blocksOf(text)[0][0]).toBe('e|3' + '-'.repeat(11) + '|');
    expect(parsed(text).bars).toEqual([13]);
  });
});

describe('placement', () => {
  it('keeps at least one dash after a two-digit fret', () => {
    const measures = measuresOf([4, 4]);
    const notes = notesAt(measures, every(0, 8, 1), { frets: [12] });
    const text = writeTabText(tabScore({ unit: 4, measures, notes }));
    expect(blocksOf(text)[0][0]).toBe('e|12-12-12-12-|12-12-12-12-|');
    expect(parsed(text).cols.map((c) => c.notes[0].fret)).toEqual(Array(8).fill(12));
  });

  it('takes 3 characters from the gap before for a grace column when free, else shifts the rest', () => {
    // unit 4: 16ths at 0..3, a half note at 4, a quarter at 12; graces before the 16th at 2 and the quarter at 12
    const measures = measuresOf([16]);
    const main = notesAt(measures, [0, 1, 2, 3, 4, 12]);
    const graces = notesAt(measures, [2, 12], { slot: -1, string: 1, frets: [2] });
    const { xs, bars } = parsed(writeTabText(tabScore({ unit: 4, measures, notes: [...main, ...graces] })));
    expect(xs).toEqual([1, 4, 6, 8, 10, 13, 34, 37]);
    expect(bars).toEqual([49]);
  });

  it('keeps a grace before a downbeat in its own bar, moving the barline instead of the downbeat', () => {
    const measures = measuresOf([16, 16]);
    const main = notesAt(measures, [0, 8, ...every(16, 32, 1)]);
    const grace = notesAt(measures, [16], { slot: -1, string: 1, frets: [2] });
    const { xs, bars, events } = parsed(writeTabText(tabScore({ unit: 4, measures, notes: [...main, ...grace] })));
    expect(xs.slice(0, 5)).toEqual([1, 25, 47, 50, 53]);
    expect(bars).toEqual([46, 98]);
    const firstBar = events.findIndex((e) => e.kind === 'bar');
    expect(events[firstBar + 1]).toMatchObject({ kind: 'col', col: { x: 47 } });
    // the downbeat keeps its time: 16 sixteenths of 3 characters
    expect(events[firstBar + 2]).toMatchObject({ kind: 'col', col: { t: 48 } });
  });

  it('shifts a downbeat when the gap before has no room for its grace', () => {
    const measures = measuresOf([16, 16]);
    const main = notesAt(measures, every(0, 32, 1));
    const grace = notesAt(measures, [16], { slot: -1, string: 1, frets: [2] });
    const { xs, bars } = parsed(writeTabText(tabScore({ unit: 4, measures, notes: [...main, ...grace] })));
    // the last 16th of bar 1 sits at 46: the barline goes straight after it, then grace, downbeat
    expect(xs.slice(15, 20)).toEqual([46, 48, 50, 53, 56]);
    expect(bars).toEqual([47, 98]);
  });

  it('starts the piece with a grace on the first note straight after the opening barline', () => {
    const measures = measuresOf([16]);
    const main = notesAt(measures, every(0, 16, 1));
    const grace = notesAt(measures, [0], { slot: -1, string: 1, frets: [2] });
    const { xs, bars } = parsed(writeTabText(tabScore({ unit: 4, measures, notes: [...main, ...grace] })));
    expect(xs.slice(0, 3)).toEqual([1, 4, 7]);
    expect(bars).toEqual([52]);
  });
});

describe('blocks', () => {
  const six = findPreset('lute-6-g')!;
  /** Lute layout systems for the parsed text (each column a dummy note): one per block when nothing wraps. */
  const luteSystems = (text: string): number => {
    let index = 0;
    const tab: LuteTabEvent[] = importTabText(text).events.map((e) =>
      e.kind === 'col'
        ? { kind: 'col', index: index++, x: e.col.x, notes: [{ placement: { course: 0, fret: 0 }, pitch: 0, shifted: 0, pinned: false, srcNoteIndex: 0 }], dropped: [] }
        : { kind: e.kind },
    );
    return layoutLuteTab(tab, six, 'french', LUTE_VIEW_WIDTH).systems.length;
  };
  const sixteenths = (beats: number, count: number) => {
    const measures = measuresOf(Array(count).fill(beats * 4));
    return writeTabText(tabScore({ unit: 4, measures, notes: notesAt(measures, every(0, beats * 4 * count, 1), { frets: [0, 1, 2] }) }));
  };

  it.each([
    [3, 9, [3, 3, 3]],
    [4, 6, [2, 2, 2]],
    [2, 8, [4, 4]],
  ])('fills a lute line: %i/4 in 16ths', (beats, count, expected) => {
    const text = sixteenths(beats, count);
    expect(barsPerBlock(text)).toEqual(expected);
    expect(parsed(text).breaks).toBe(expected.length);
    expect(luteSystems(text)).toBe(expected.length);
  });

  it('starts and ends every line of a block with a barline, continuing in time', () => {
    const text = sixteenths(4, 4);
    for (const lines of blocksOf(text)) {
      expect(lines).toHaveLength(6);
      for (const l of lines) expect(l).toMatch(/^[A-Ga-g]#? ?\|.*\|$/);
    }
    const ts = parsed(text).events.flatMap((e) => (e.kind === 'col' ? [e.col.t] : []));
    expect(ts).toEqual(ts.map((_, i) => 3 * i));
  });

  it('starts a block at newBlock, never an empty one before the first measure', () => {
    const measures = measuresOf([4, 4, 4, 4], [0, 2]);
    const text = writeTabText(tabScore({ unit: 1, measures, notes: notesAt(measures, every(0, 16, 1)) }));
    expect(barsPerBlock(text)).toEqual([2, 2]);
    expect(parsed(text).breaks).toBe(2);
  });

  it('merges a block too short to read as tab into the one before', () => {
    // the parser needs 3 dashes on every line: a lone one-16th bar would be `|0-|`
    const measures = measuresOf([16, 1], [1]);
    const text = writeTabText(tabScore({ unit: 4, measures, notes: notesAt(measures, every(0, 17, 1)) }));
    expect(barsPerBlock(text)).toEqual([2]);
    expect(parsed(text).bars).toEqual([49, 53]);
  });

  it('pads the end of a single block too short to read as tab', () => {
    const measures = measuresOf([4, 4]);
    const text = writeTabText(tabScore({ unit: 1, measures, notes: notesAt(measures, [0, 4], { frets: [12, 13] }) }));
    expect(blocksOf(text)[0][0]).toBe('e|12-|13--|');
    expect(parsed(text).xs).toEqual([1, 5]);
  });

  it('keeps a lone measure wider than a lute line whole', () => {
    const measures = measuresOf([48, 4]);
    const text = writeTabText(tabScore({ unit: 4, measures, notes: notesAt(measures, every(0, 52, 1)) }));
    expect(barsPerBlock(text)).toEqual([1, 1]);
    expect(parsed(text).xs).toHaveLength(52);
  });
});
