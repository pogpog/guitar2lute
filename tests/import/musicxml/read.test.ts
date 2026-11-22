import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { ImportError, parseXml, type XmlParser } from '../../../src/import/musicxml/xml';
import { readMusicXml, type TabScore } from '../../../src/import/musicxml/read';
import { backup, forward, n, score, tabAttrs } from './build';

const DAMAGED = 'Could not read this MusicXML file; it may be damaged.';
const NO_TAB =
  'This MusicXML file has no tab staff (only standard notation). Only tab staves can be imported in this version.';

// xmldom's Document type is not lib.dom's; the silent onError keeps xmldom from logging (it still throws).
const parser = new DOMParser({ onError: () => {} }) as unknown as XmlParser;

function read(xml: string): TabScore {
  return readMusicXml(parseXml(xml, parser));
}

function tab(measures: string[]): TabScore {
  return read(score([{ id: 'P1', name: 'Guitar', measures }]));
}

/** [time, string, fret] per note. */
function placed(s: TabScore): number[][] {
  return s.notes.map((x) => [x.time, x.string, x.fret]);
}

function errorOf(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error('expected an error');
}

const NOTATION = '<attributes><divisions>1</divisions><clef><sign>G</sign><line>2</line></clef></attributes>';

describe('parseXml', () => {
  it('throws the damaged message when the parser throws (xmldom)', () => {
    const e = errorOf(() => parseXml('<score-partwise><part>', parser));
    expect(e).toBeInstanceOf(ImportError);
    expect((e as Error).name).toBe('ImportError');
    expect((e as Error).message).toBe(DAMAGED);
  });

  it('throws the damaged message when the result contains a parsererror (browser)', () => {
    const stub: XmlParser = {
      parseFromString: () => parser.parseFromString('<score-partwise><parsererror>bad</parsererror></score-partwise>', 'application/xml'),
    };
    expect(() => parseXml('<score-partwise/>', stub)).toThrow(new ImportError(DAMAGED));
  });

  it('returns the document otherwise', () => {
    expect(parseXml('<score-partwise/>', parser).documentElement.nodeName).toBe('score-partwise');
  });
});

describe('which staff', () => {
  it('finds a tab part', () => {
    const s = read(
      score([
        { id: 'P1', name: 'Voice', measures: [NOTATION + n({ pitch: 'C4', d: 4 })] },
        { id: 'P2', name: 'Guitar', measures: [tabAttrs() + n({ s: 2, f: 1 }) + n({ s: 3, f: 0, d: 3 })] },
      ]),
    );
    expect(placed(s)).toEqual([
      [0, 1, 1],
      [1, 2, 0],
    ]);
    expect(s.notices).toEqual([]);
  });

  it('finds a tab staff inside a two-staff part', () => {
    const s = tab([
      tabAttrs({ staves: 2, tabStaff: 2 }) +
        n({ pitch: 'C4', d: 2, staff: 1 }) +
        n({ pitch: 'E4', d: 2, staff: 1 }) +
        backup(4) +
        n({ s: 1, f: 3, d: 4, staff: 2 }),
    ]);
    expect(placed(s)).toEqual([[0, 0, 3]]);
  });

  it('applies staff-details without number', () => {
    const attrs =
      '<attributes><divisions>1</divisions><staves>2</staves>' +
      '<clef number="1"><sign>G</sign><line>2</line></clef>' +
      '<clef number="2"><sign>TAB</sign><line>5</line></clef>' +
      '<staff-details><staff-lines>6</staff-lines>' +
      ['D2', 'A2', 'D3', 'G3', 'B3', 'E4']
        .map((p, i) => `<staff-tuning line="${i + 1}"><tuning-step>${p[0]}</tuning-step><tuning-octave>${p[1]}</tuning-octave></staff-tuning>`)
        .join('') +
      '</staff-details></attributes>';
    const s = tab([attrs + n({ pitch: 'C4', d: 4, staff: 1 }) + backup(4) + n({ s: 6, f: 0, d: 4, staff: 2 })]);
    expect(s.tuning).toEqual([64, 59, 55, 50, 45, 38]);
    expect(placed(s)).toEqual([[0, 5, 0]]);
  });

  it('prefers the staff-details numbered for the tab staff over an unnumbered one before it', () => {
    const tunings = ['D2', 'A2', 'D3', 'G3', 'B3', 'E4']
      .map((p, i) => `<staff-tuning line="${i + 1}"><tuning-step>${p[0]}</tuning-step><tuning-octave>${p[1]}</tuning-octave></staff-tuning>`)
      .join('');
    const attrs =
      '<attributes><divisions>1</divisions><staves>2</staves>' +
      '<clef number="1"><sign>G</sign><line>2</line></clef>' +
      '<clef number="2"><sign>TAB</sign><line>5</line></clef>' +
      '<staff-details print-object="yes"/>' +
      `<staff-details number="2">${tunings}</staff-details></attributes>`;
    const s = tab([attrs + n({ pitch: 'C4', d: 4, staff: 1 }) + backup(4) + n({ s: 6, f: 0, d: 4, staff: 2 })]);
    expect(s.tuning).toEqual([64, 59, 55, 50, 45, 38]);
    expect(placed(s)).toEqual([[0, 5, 0]]);
  });

  it('keeps the first bar\'s unnumbered staff-details when a later bar adds numbered capo-only details', () => {
    const tunings = ['D2', 'A2', 'D3', 'G3', 'B3', 'E4']
      .map((p, i) => `<staff-tuning line="${i + 1}"><tuning-step>${p[0]}</tuning-step><tuning-octave>${p[1]}</tuning-octave></staff-tuning>`)
      .join('');
    const attrs =
      '<attributes><divisions>1</divisions><staves>2</staves>' +
      '<clef number="1"><sign>G</sign><line>2</line></clef>' +
      '<clef number="2"><sign>TAB</sign><line>5</line></clef>' +
      `<staff-details><staff-lines>6</staff-lines>${tunings}</staff-details></attributes>`;
    const later = '<attributes><staff-details number="2"><capo>2</capo></staff-details></attributes>';
    const s = tab([
      attrs + n({ pitch: 'C4', d: 4, staff: 1 }) + backup(4) + n({ s: 6, f: 0, d: 4, staff: 2 }),
      later + n({ pitch: 'C4', d: 4, staff: 1 }) + backup(4) + n({ s: 6, f: 0, d: 4, staff: 2 }),
    ]);
    expect(s.tuning).toEqual([64, 59, 55, 50, 45, 38]);
    expect(s.notices).toEqual(["The tab's tuning or capo changes in bar 2; the first one was used."]);
  });

  it('skips a 4-string tab staff before a 6-string one', () => {
    const s = read(
      score([
        { id: 'P1', name: 'Bass', measures: [tabAttrs({ tuning: ['E1', 'A1', 'D2', 'G2'] }) + n({ s: 4, f: 3, d: 4 })] },
        { id: 'P2', name: 'Guitar', measures: [tabAttrs() + n({ s: 1, f: 5, d: 4 })] },
      ]),
    );
    expect(placed(s)).toEqual([[0, 0, 5]]);
    expect(s.notices).toEqual(['Other tab staves were not imported: Bass (4 strings).']);
  });

  it('names a later tab staff too', () => {
    const s = read(
      score([
        { id: 'P1', name: 'Guitar 1', measures: [tabAttrs() + n({ s: 1, f: 5, d: 4 })] },
        { id: 'P2', name: 'Guitar 2', measures: [tabAttrs() + n({ s: 2, f: 5, d: 4 })] },
      ]),
    );
    expect(placed(s)).toEqual([[0, 0, 5]]);
    expect(s.notices).toEqual(['Other tab staves were not imported: Guitar 2 (6 strings).']);
  });

  it('counts strings from staff-lines when there is no staff-tuning', () => {
    const s = tab([tabAttrs({ tuning: [], lines: 6 }) + n({ s: 1, f: 0, d: 4 })]);
    expect(placed(s)).toEqual([[0, 0, 0]]);
  });

  it('counts 5 strings when there are neither staff-tuning nor staff-lines', () => {
    expect(() => tab([tabAttrs({ tuning: [] }) + n({ s: 1, f: 0, d: 4 })])).toThrow(
      new ImportError('The tab staff has 5 strings; only 6-string guitar tab can be imported.'),
    );
  });

  it('refuses a score without a tab staff', () => {
    const e = errorOf(() => read(score([{ id: 'P1', name: 'Voice', measures: [NOTATION + n({ pitch: 'C4', d: 4 })] }])));
    expect(e).toBeInstanceOf(ImportError);
    expect((e as Error).message).toBe(NO_TAB);
  });

  it('refuses a 7-string tab staff', () => {
    const seven = ['B1', 'E2', 'A2', 'D3', 'G3', 'B3', 'E4'];
    expect(() => tab([tabAttrs({ tuning: seven }) + n({ s: 1, f: 0, d: 4 })])).toThrow(
      new ImportError('The tab staff has 7 strings; only 6-string guitar tab can be imported.'),
    );
  });
});

describe('tuning', () => {
  it('reads staff-tuning lines 1..6 into high-to-low MIDI', () => {
    expect(tab([tabAttrs() + n({ s: 1, f: 0, d: 4 })]).tuning).toEqual([64, 59, 55, 50, 45, 40]);
    const s = tab([tabAttrs({ tuning: ['Eb2', 'Ab2', 'Db3', 'F#3', 'Bb3', 'Eb4'] }) + n({ s: 1, f: 0, d: 4 })]);
    expect(s.tuning).toEqual([63, 58, 54, 49, 44, 39]);
  });
});

describe('time', () => {
  it('keeps one cursor per part', () => {
    const s = tab([
      tabAttrs({ beats: '3/4' }) + n({ s: 1, f: 0 }) + n({ s: 1, f: 1 }) + n({ s: 1, f: 2 }) + backup(1) + n({ s: 6, f: 3, v: 2 }),
    ]);
    expect(placed(s)).toEqual([
      [0, 0, 0],
      [1, 0, 1],
      [2, 0, 2],
      [2, 5, 3],
    ]);
    expect(s.measures).toEqual([{ number: '1', start: 0, length: 3, newBlock: false }]);
  });

  it('moves the cursor on with a forward without voice', () => {
    const s = tab([tabAttrs() + n({ s: 1, f: 0 }) + forward(2) + n({ s: 1, f: 1 })]);
    expect(placed(s)).toEqual([
      [0, 0, 0],
      [3, 0, 1],
    ]);
  });

  it('starts a chord note with the previous note and does not advance', () => {
    const s = tab([tabAttrs() + n({ s: 2, f: 1 }) + n({ s: 1, f: 0, chord: true, d: 3 }) + n({ s: 1, f: 2 })]);
    expect(placed(s)).toEqual([
      [0, 0, 0],
      [0, 1, 1],
      [1, 0, 2],
    ]);
    expect(s.measures[0].length).toBe(2);
  });

  it('moves the cursor with notes on the notation staff', () => {
    const s = tab([tabAttrs({ staves: 2, tabStaff: 2 }) + n({ pitch: 'C4', staff: 1 }) + n({ s: 1, f: 0, staff: 2 })]);
    expect(placed(s)).toEqual([[1, 0, 0]]);
  });

  it('puts every time on the LCM of divisions changing mid-piece', () => {
    const s = tab([
      tabAttrs({ divisions: 2 }) + n({ s: 1, f: 0, d: 2 }) + n({ s: 1, f: 1, d: 1 }),
      '<attributes><divisions>3</divisions></attributes>' + n({ s: 1, f: 2, d: 1 }) + n({ s: 1, f: 3, d: 3 }),
    ]);
    expect(s.unit).toBe(6);
    expect(placed(s)).toEqual([
      [0, 0, 0],
      [6, 0, 1],
      [9, 0, 2],
      [11, 0, 3],
    ]);
    expect(s.measures.map((m) => [m.start, m.length])).toEqual([
      [0, 9],
      [9, 8],
    ]);
  });

  it('rounds decimal durations to the grid', () => {
    const s = tab([tabAttrs({ divisions: 3 }) + n({ s: 1, f: 0, d: 0.9999 }) + n({ s: 1, f: 1, d: 2.0001 })]);
    expect(placed(s)).toEqual([
      [0, 0, 0],
      [1, 0, 1],
    ]);
  });

  it('makes a pickup measure as long as its content', () => {
    const s = tab([
      '<measure number="0" implicit="yes">' + tabAttrs({ divisions: 4, beats: '3/4' }) + n({ s: 3, f: 2, d: 4 }) + '</measure>',
      '<measure number="1">' + n({ s: 2, f: 1, d: 12 }) + '</measure>',
    ]);
    expect(s.unit).toBe(4);
    expect(s.measures).toEqual([
      { number: '0', start: 0, length: 4, newBlock: false },
      { number: '1', start: 4, length: 12, newBlock: false },
    ]);
    expect(placed(s)).toEqual([
      [0, 2, 2],
      [4, 1, 1],
    ]);
  });

  it('uses the time signature for an empty measure', () => {
    const s = tab([tabAttrs({ divisions: 2, beats: '3/4' }) + n({ s: 1, f: 0, d: 2 }), '', n({ s: 1, f: 1, d: 2 })]);
    expect(s.measures.map((m) => [m.start, m.length])).toEqual([
      [0, 2],
      [2, 6],
      [8, 2],
    ]);
    expect(placed(s)).toEqual([
      [0, 0, 0],
      [8, 0, 1],
    ]);
  });

  it('clamps a cursor driven below the measure start', () => {
    const s = tab([tabAttrs() + n({ s: 1, f: 0, d: 4 }), n({ s: 1, f: 1, d: 2 }) + backup(3) + n({ s: 6, f: 0, d: 4, v: 2 })]);
    expect(placed(s)).toEqual([
      [0, 0, 0],
      [4, 0, 1],
      [4, 5, 0],
    ]);
    expect(s.measures[1]).toEqual({ number: '2', start: 4, length: 4, newBlock: false });
    expect(s.notices).toEqual(['Timing in bar 2 was corrected (a duration was negative or went before the start of the bar).']);
  });

  it('clamps a negative duration', () => {
    const s = tab([tabAttrs() + n({ s: 1, f: 0, d: 2 }) + n({ s: 1, f: 1, d: -1 }) + n({ s: 2, f: 2, d: 2 })]);
    expect(placed(s)).toEqual([
      [0, 0, 0],
      [2, 0, 1],
      [2, 1, 2],
    ]);
    expect(s.notices).toEqual(['Timing in bar 1 was corrected (a duration was negative or went before the start of the bar).']);
  });
});

describe('timing notice', () => {
  it('names every bar in the plural', () => {
    const bad = n({ s: 1, f: 1, d: 2 }) + backup(3) + n({ s: 6, f: 0, d: 4, v: 2 });
    const s = tab([tabAttrs() + n({ s: 1, f: 0, d: 4 }), bad, n({ s: 1, f: 0, d: 4 }), bad]);
    expect(s.notices).toEqual(['Timing in bars 2, 4 was corrected (a duration was negative or went before the start of the bar).']);
  });
});

describe('snapping', () => {
  it('puts triplets against 16ths into shared columns where exporters rounded them', () => {
    // Divisions 100: 16ths are 25; triplet eighths rounded to 33, so the fourth one lands at 99 against a 16th at 100.
    const sixteenths = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => n({ s: 1, f: i, d: 25 })).join('');
    const triplets = [0, 1, 2, 3, 4, 5].map((i) => n({ s: 6, f: i, d: 33, v: 2 })).join('');
    const s = tab([tabAttrs({ divisions: 100 }) + sixteenths + backup(200) + triplets]);
    const times = (str: number) => s.notes.filter((x) => x.string === str).map((x) => x.time);
    expect(times(0)).toEqual([0, 25, 50, 75, 99, 125, 150, 175]);
    expect(times(5)).toEqual([0, 33, 66, 99, 132, 165]);
  });

  it('snaps onsets under 1/48 of a quarter apart, not at 1/48', () => {
    // Divisions 96: 1/48 of a quarter is 2.
    const s = tab([
      tabAttrs({ divisions: 96 }) +
        n({ s: 1, f: 0, d: 96 }) +
        backup(96) +
        n({ rest: true, d: 1, v: 2 }) +
        n({ s: 2, f: 0, d: 95, v: 2 }) +
        backup(96) +
        n({ rest: true, d: 2, v: 3 }) +
        n({ s: 3, f: 0, d: 94, v: 3 }),
    ]);
    expect(placed(s)).toEqual([
      [0, 0, 0],
      [0, 1, 0],
      [2, 2, 0],
    ]);
  });
});

describe('measures', () => {
  it('takes measure numbers from the number attribute', () => {
    const s = tab([
      '<measure number="0" implicit="yes">' + tabAttrs() + n({ s: 1, f: 0 }) + '</measure>',
      '<measure number="X1">' + n({ s: 1, f: 0, d: 4 }) + '</measure>',
    ]);
    expect(s.measures.map((m) => m.number)).toEqual(['0', 'X1']);
    expect(s.notes.map((x) => x.measure)).toEqual([0, 1]);
  });
});
