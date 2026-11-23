import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { musicXmlToTabText } from '../../../src/import/musicxml';
import { readMusicXml, type TabScore } from '../../../src/import/musicxml/read';
import { writeTabText } from '../../../src/import/musicxml/write';
import { ImportError, parseXml, type XmlParser } from '../../../src/import/musicxml/xml';
import { importTabText } from '../../../src/core/parse/importText';
import { stepsFromColumns } from '../../../src/audio/pluck';
import type { TabEvent } from '../../../src/core/model';
import { backup, n, print, repeatBar, score, tabAttrs, words } from './build';

const parser = new DOMParser({ onError: () => {} }) as unknown as XmlParser;

function read(xml: string): TabScore {
  return readMusicXml(parseXml(xml, parser));
}

function tabPart(measures: string[]): string {
  return score([{ id: 'P1', name: 'Guitar', measures }]);
}

const repeat = <T,>(count: number, f: (i: number) => T): T[] => Array.from({ length: count }, (_, i) => f(i));

/** Every note: tuning E3 A3 D4 G4 B3 E4 (string labels alone would give standard), capo 3, chords, graces, two-digit frets. */
const NOTES = tabPart([
  tabAttrs({ divisions: 4, tuning: ['E3', 'A3', 'D4', 'G4', 'B3', 'E4'], capo: 3 }) +
    n({ s: 1, f: 12, d: 4 }) + n({ s: 6, f: 0, d: 4, chord: true }) +
    n({ s: 2, f: 3, d: 2 }) + n({ s: 3, f: 10, d: 2 }) +
    n({ s: 1, f: 5, grace: true }) + n({ s: 1, f: 7, d: 4 }) +
    n({ s: 4, f: 2, d: 4 }),
  repeat(16, (i) => n({ s: 1 + (i % 3), f: i, d: 1 })).join(''),
]);

/** Nothing pushed: 16ths, 8ths, quarters and a bass voice, with a system break before bar 3. */
const RHYTHM = tabPart([
  tabAttrs({ divisions: 4 }) +
    repeat(16, (i) => n({ s: 1, f: [0, 2, 3, 5][i % 4], d: 1 })).join('') +
    backup(16) + repeat(4, () => n({ v: 2, s: 6, f: 0, d: 4 })).join(''),
  repeat(8, (i) => n({ s: 2, f: i % 4, d: 2 })).join('') + backup(16) + n({ v: 2, s: 5, f: 2, d: 8 }) + n({ v: 2, s: 5, f: 0, d: 8 }),
  print({ system: true }) +
    n({ s: 1, f: 0, d: 4 }) + repeat(4, (i) => n({ s: 3, f: i, d: 1 })).join('') + n({ s: 2, f: 1, d: 2 }) + n({ s: 2, f: 3, d: 2 }) + n({ s: 1, f: 5, d: 4 }),
  n({ s: 4, f: 2, d: 6 }) + n({ s: 3, f: 2, d: 2 }) + n({ s: 2, f: 3, d: 8 }),
]);

/** divisions 8: bar 1 ends with a 32nd run (frets 1, 1, 2, 12) squeezed onto the barline; bar 2 starts with 12. */
const sixteenths = (s: number) => repeat(16, (i) => n({ s, f: i % 5, d: 2 })).join('');
const PUSHED = tabPart([
  tabAttrs({ divisions: 8 }) +
    repeat(14, (i) => n({ s: 2, f: i % 5, d: 2 })).join('') + [1, 1, 2, 12].map((f) => n({ s: 1, f, d: 1 })).join(''),
  n({ s: 1, f: 12, d: 2 }) + repeat(15, (i) => n({ s: 3, f: i % 5, d: 2 })).join(''),
  sixteenths(2),
  sixteenths(4),
  sixteenths(5),
  sixteenths(6),
]);

/** Shaped like the Dowland galliard: notation part P1 holding the layout, tab part P2, a one-beat pickup in 3/4. */
const NOTATION_ATTRS =
  '<attributes><divisions>2</divisions><time><beats>3</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>';
const dowlandBar = (i: number) =>
  repeat(6, (k) => n({ s: 1 + (k % 2), f: (i + k) % 4, d: 1 })).join('') +
  backup(6) + n({ v: 2, s: 5 + (i % 2), f: 0, d: 6 }) +
  backup(6) + n({ v: 4, rest: true, d: 2 }) + n({ v: 4, s: 4, f: 2, d: 2 }) + n({ v: 4, rest: true, d: 2 });
const pickup = (body: string) => `<measure number="0" implicit="yes">${body}</measure>`;
const numbered = (i: number, body: string) => `<measure number="${i}">${body}</measure>`;
const DOWLAND = score([
  {
    id: 'P1',
    name: 'Lute',
    measures: [
      pickup(NOTATION_ATTRS + words('Capo III') + n({ rest: true, d: 2 })),
      ...repeat(5, (i) => numbered(i + 1, (i + 1 === 4 ? print({ page: true }) : '') + n({ rest: true, d: 6 }))),
    ],
  },
  {
    id: 'P2',
    name: 'Lute tab',
    measures: [
      pickup(tabAttrs({ divisions: 2, beats: '3/4' }) + words('Capo III') + n({ s: 1, f: 0, d: 1 }) + n({ s: 2, f: 1, d: 1 }) + backup(2) + n({ v: 2, s: 5, f: 2, d: 2 })),
      ...repeat(5, (i) => numbered(i + 1, dowlandBar(i))),
    ],
  },
]);

/** 400 bars, two voices, 16ths. */
const LONG = tabPart(
  repeat(
    400,
    (i) =>
      (i === 0 ? tabAttrs({ divisions: 4 }) : '') +
      repeat(16, (k) => n({ s: 1 + (k % 2), f: (i + k) % 13, d: 1 })).join('') +
      backup(16) + repeat(4, (k) => n({ v: 2, s: 6, f: k, d: 4 })).join(''),
  ),
);

const REPEATS = tabPart([tabAttrs() + n({ s: 1, f: 0, d: 4 }) + repeatBar(), n({ s: 1, f: 1, d: 4 })]);

const FIXTURES: Record<string, string> = { NOTES, RHYTHM, PUSHED, DOWLAND, LONG, REPEATS };

const columns = (events: TabEvent[]) => events.flatMap((e) => (e.kind === 'col' ? [e.col] : []));

/** [bar index, string, fret] for every note, the bar index counted from `bar` events. */
function notesByBar(events: TabEvent[]): number[][] {
  let bar = 0;
  const out: number[][] = [];
  for (const e of events) {
    if (e.kind === 'bar') bar++;
    if (e.kind === 'col') for (const x of e.col.notes) out.push([bar, x.string, x.fret]);
  }
  return out;
}

describe('MusicXML → tab text → tab', () => {
  it('gives back every note', () => {
    const s = read(NOTES);
    const back = importTabText(musicXmlToTabText(NOTES, parser).text);
    expect(columns(back.events).flatMap((c) => c.notes.map((x) => [x.string, x.fret]))).toEqual(
      s.notes.map((x) => [x.string, x.fret]),
    );
    expect(back.tuning?.courses).toEqual([64, 59, 67, 62, 57, 52]);
    expect(back.capo).toBe(3);
  });

  it.each(Object.keys(FIXTURES))('gives back every note in its bar: %s', (name) => {
    const s = read(FIXTURES[name]);
    const back = importTabText(writeTabText(s));
    expect(notesByBar(back.events)).toEqual(s.notes.map((x) => [x.measure, x.string, x.fret]));
  });

  it('keeps the rhythm across barlines and a block break', () => {
    const s = read(RHYTHM);
    const text = writeTabText(s);
    const { events } = importTabText(text);
    expect(events.filter((e) => e.kind === 'break')).toHaveLength(2);
    const cols = columns(events).map((c, index) => ({ x: c.t!, pitches: [], index }));
    const steps = stepsFromColumns(cols, 120);
    const onsets = [...new Set(s.notes.filter((x) => x.slot === 0).map((x) => x.time))];
    expect(steps).toHaveLength(onsets.length);
    // a 16th (1 unit) is 3 characters of 120 ms
    steps.forEach((step, i) => expect(step.time).toBeCloseTo((onsets[i] - onsets[0]) * 3 * 0.12, 6));
  });

  it('keeps pushed notes in their bars, in order, never touching on a string', () => {
    const s = read(PUSHED);
    const text = writeTabText(s);
    const { events } = importTabText(text);
    expect(notesByBar(events)).toEqual(s.notes.map((x) => [x.measure, x.string, x.fret]));
    expect(text).toContain('1-1-2-12|12');
    const lines = text.trimEnd().split('\n\n').slice(1).map((b) => b.split('\n'));
    for (let string = 0; string < 6; string++) {
      const numbers = lines.flatMap((block) => block[string].slice(2).match(/\d+/g) ?? []).map(Number);
      expect(numbers).toEqual(s.notes.filter((x) => x.string === string).map((x) => x.fret));
    }
  });

  it.each(Object.keys(FIXTURES))('generated text parses without warnings: %s', (name) => {
    expect(importTabText(musicXmlToTabText(FIXTURES[name], parser).text).warnings).toEqual([]);
  });

  it('converts a 400-measure score quickly', () => {
    const t0 = performance.now();
    const { text } = musicXmlToTabText(LONG, parser);
    expect(performance.now() - t0).toBeLessThan(1500);
    expect(text.split('\n\n').length).toBeGreaterThan(100);
  });

  it('reads a Dowland-shaped score: capo, pickup, page break', () => {
    const s = read(DOWLAND);
    const { text, notices } = musicXmlToTabText(DOWLAND, parser);
    expect(notices).toEqual([]);
    const back = importTabText(text);
    expect(back.capo).toBe(3);
    expect(s.measures[0].length).toBe(s.unit);
    // 8ths at 3 characters: the one-beat pickup fills characters 1–6, its bar sits at 7, bar 1 starts at 8
    const bars = back.events.flatMap((e) => (e.kind === 'bar' ? [e.x] : []));
    expect(bars[0]).toBe(7);
    expect(columns(back.events)[2].x).toBe(8);
    // blocks: bars 0–3, then the page mark at bar 4; without the mark it all fits one line
    const barsPerBlock = (t: string) => t.trimEnd().split('\n\n').slice(1).map((b) => b.split('\n')[0].split('|').length - 2);
    expect(barsPerBlock(text)).toEqual([4, 2]);
    expect(barsPerBlock(writeTabText({ ...s, measures: s.measures.map((m) => ({ ...m, newBlock: false })) }))).toEqual([6]);
  });

  it('passes the reader notices through and throws ImportError on a damaged file', () => {
    expect(musicXmlToTabText(REPEATS, parser).notices).toEqual(read(REPEATS).notices);
    expect(read(REPEATS).notices).toHaveLength(1);
    expect(() => musicXmlToTabText('<score-partwise><part>', parser)).toThrow(ImportError);
  });
});
