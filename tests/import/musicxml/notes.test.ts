import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { parseXml, type XmlParser } from '../../../src/import/musicxml/xml';
import { readMusicXml, type TabScore } from '../../../src/import/musicxml/read';
import { backup, n, score, tabAttrs } from './build';

const parser = new DOMParser({ onError: () => {} }) as unknown as XmlParser;

function tab(measures: string[]): TabScore {
  return readMusicXml(parseXml(score([{ id: 'P1', measures }]), parser));
}

/** One measure with the default tab attributes. */
function one(...notes: string[]): TabScore {
  return tab([tabAttrs() + notes.join('')]);
}

/** [time, slot, string, fret] per note. */
function placed(s: TabScore): number[][] {
  return s.notes.map((x) => [x.time, x.slot, x.string, x.fret]);
}

describe('ties', () => {
  it('<tie type="stop"/> makes no note but takes time', () => {
    const s = one(n({ s: 1, f: 3 }), n({ s: 1, f: 3, tie: 'stop' }), n({ s: 2, f: 1 }));
    expect(placed(s)).toEqual([
      [0, 0, 0, 3],
      [2, 0, 1, 1],
    ]);
  });

  it('<tied type="stop"/> alone makes no note', () => {
    expect(placed(one(n({ s: 1, f: 3 }), n({ s: 1, f: 3, tied: 'stop' })))).toEqual([[0, 0, 0, 3]]);
  });

  it('<tied type="continue"/> alone makes no note', () => {
    expect(placed(one(n({ s: 1, f: 3 }), n({ s: 1, f: 3, tied: 'continue' })))).toEqual([[0, 0, 0, 3]]);
  });

  it('when <tie> is present, <tied> is not consulted', () => {
    const s = one(n({ s: 1, f: 3, tie: 'start', tied: 'stop' }));
    expect(placed(s)).toEqual([[0, 0, 0, 3]]);
  });

  it('a column of only tie-stops makes no column', () => {
    const s = one(n({ s: 1, f: 3 }), n({ s: 1, f: 3, tie: 'stop' }), n({ s: 2, f: 3, tie: 'stop', chord: true }));
    expect(s.notes.map((x) => x.time)).toEqual([0]);
  });

  it('tie-stops are ignored by the clash check', () => {
    const s = one(n({ s: 1, f: 3 }), n({ s: 1, f: 5, tie: 'stop', v: 2 }), backup(1), n({ s: 1, f: 7, v: 2 }));
    expect(s.notices).toEqual([]);
  });
});

describe('notes that take time but make none', () => {
  it('skips cue, unpitched and dead notes silently', () => {
    const unpitched = '<note><unpitched/><duration>1</duration><voice>1</voice></note>';
    const s = one(n({ s: 1, f: 1, cue: true }), unpitched, n({ s: 1, f: 2, head: 'x' }), n({ s: 1, f: 4 }));
    expect(placed(s)).toEqual([[3, 0, 0, 4]]);
    expect(s.notices).toEqual([]);
  });

  it('keeps print-object="no" notes', () => {
    const hidden = '<note print-object="no"><duration>1</duration><voice>1</voice><notations><technical><string>1</string><fret>2</fret></technical></notations></note>';
    expect(placed(one(hidden))).toEqual([[0, 0, 0, 2]]);
  });
});

describe('skipped notes', () => {
  it('counts a non-integer string or fret, or a negative fret, as without string/fret', () => {
    const s = one(n({ s: 2.5, f: 0 }) + n({ s: 1, f: 2.5 }) + n({ s: 1, f: -1 }) + n({ s: 1, f: 3 }));
    expect(s.notices).toEqual(['3 notes without string/fret were skipped (bar 1).']);
    expect(placed(s)).toEqual([[3, 0, 0, 3]]);
  });

  it('notes without string/fret', () => {
    const s = tab([tabAttrs() + n({}) + n({ s: 1 }), n({ f: 2 }) + n({ s: 1, f: 0 })]);
    expect(s.notices).toEqual(['3 notes without string/fret were skipped (bars 1, 2).']);
    expect(s.notes).toHaveLength(1);
  });

  it('harmonics', () => {
    const s = tab([tabAttrs() + n({ s: 1, f: 12, harmonic: true }), n({ s: 1, f: 12, harmonic: true })]);
    expect(s.notices).toEqual(['2 harmonics were skipped (bars 1, 2).']);
    expect(s.notes).toEqual([]);
  });

  it('frets above 24, singular', () => {
    const s = one(n({ s: 1, f: 25 }), n({ s: 1, f: 24 }));
    expect(s.notices).toEqual(['1 note above fret 24 was skipped (bar 1).']);
    expect(placed(s)).toEqual([[1, 0, 0, 24]]);
  });

  it('strings outside 1-6', () => {
    const s = one(n({ s: 7, f: 1 }), n({ s: 0, f: 1 }));
    expect(s.notices).toEqual(['2 notes on a string outside 1–6 were skipped (bar 1).']);
    expect(s.notes).toEqual([]);
  });

  it('lists at most 10 bars then an ellipsis', () => {
    const s = tab(Array.from({ length: 12 }, (_, i) => (i === 0 ? tabAttrs() : '') + n({ s: 7, f: 1 })));
    expect(s.notices).toEqual(['12 notes on a string outside 1–6 were skipped (bars 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, …).']);
  });
});

describe('same string at the same moment', () => {
  it('same fret from two voices makes one note, silently', () => {
    const s = one(n({ s: 2, f: 3 }), backup(1), n({ s: 2, f: 3, v: 2 }));
    expect(placed(s)).toEqual([[0, 0, 1, 3]]);
    expect(s.notices).toEqual([]);
  });

  it('different frets keep the first and give a notice', () => {
    const s = one(n({ s: 2, f: 3 }), backup(1), n({ s: 2, f: 5, v: 2 }));
    expect(placed(s)).toEqual([[0, 0, 1, 3]]);
    expect(s.notices).toEqual(['1 place had two notes on one string; the first was kept (bar 1).']);
  });

  it('counts one clash per column and aggregates bars', () => {
    const clash = n({ s: 1, f: 1 }) + n({ s: 2, f: 1, chord: true }) + backup(1) + n({ s: 1, f: 2, v: 2 }) + n({ s: 2, f: 2, v: 2, chord: true });
    const s = tab([tabAttrs() + clash, clash]);
    expect(s.notices).toEqual(['2 places had two notes on one string; the first was kept (bars 1, 2).']);
  });
});

describe('grace notes', () => {
  it('two graces before a main note take slots -2, -1 at its time', () => {
    const s = one(n({ s: 1, f: 0 }), n({ s: 2, f: 1, grace: true }), n({ s: 3, f: 2, grace: true }), n({ s: 4, f: 3 }));
    expect(placed(s)).toEqual([
      [0, 0, 0, 0],
      [1, -2, 1, 1],
      [1, -1, 2, 2],
      [1, 0, 3, 3],
    ]);
  });

  it('a grace without a following note in its voice and measure is slot +1 at the previous note', () => {
    const s = tab([tabAttrs() + n({ s: 1, f: 0 }) + n({ s: 2, f: 1 }) + n({ s: 3, f: 2, grace: true }), n({ s: 1, f: 5 })]);
    expect(placed(s)).toEqual([
      [0, 0, 0, 0],
      [1, 0, 1, 1],
      [1, 1, 2, 2],
      [2, 0, 0, 5],
    ]);
  });

  it('a grace looks for the next note in its own voice', () => {
    const s = one(n({ s: 1, f: 0, v: 1, d: 2 }), backup(2), n({ s: 2, f: 1, grace: true, v: 2 }), n({ s: 3, f: 2, v: 2 }), n({ s: 4, f: 3, v: 2 }));
    expect(placed(s)).toEqual([
      [0, -1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 2, 2],
      [1, 0, 3, 3],
    ]);
  });
});
