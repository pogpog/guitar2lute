import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { parseXml, type XmlParser } from '../../../src/import/musicxml/xml';
import { readMusicXml, type TabScore } from '../../../src/import/musicxml/read';
import { doubleBar, ending, n, print, repeatBar, score, segno, sound, tabAttrs, wordsOf } from './build';

const parser = new DOMParser({ onError: () => {} }) as unknown as XmlParser;

function read(xml: string): TabScore {
  return readMusicXml(parseXml(xml, parser));
}

function tab(measures: string[], opts: Parameters<typeof tabAttrs>[0] = {}): TabScore {
  const [first, ...rest] = measures;
  return read(score([{ id: 'P1', measures: [tabAttrs(opts) + first, ...rest] }]));
}

const MISMATCH = (bars: string) =>
  `The written pitches don't match the tab's tuning and frets in ${bars}; check the tuning and capo.`;
const REPEATS =
  'This score has repeats or D.C./D.S. marks; they are not followed: the music plays straight through as written, with first and second endings one after the other.';

/** Low E string (6) open and the top string (1) at fret 3, pitches as sounding with standard tuning. */
const GOOD = n({ s: 6, f: 0, pitch: 'E2' }) + n({ s: 1, f: 3, pitch: 'G4' });

describe('transposition and the pitch check', () => {
  it('passes when pitches match tuning plus frets', () => {
    expect(tab([GOOD]).notices).toEqual([]);
  });

  it('applies <octave-change> -1 so an octave-up written part passes', () => {
    const s = tab([n({ s: 6, f: 0, pitch: 'E3' }) + n({ s: 1, f: 3, pitch: 'G5' })], {
      transpose: { chromatic: 0, octave: -1 },
    });
    expect(s.notices).toEqual([]);
  });

  it('reports an octave-up written part without a transpose', () => {
    const s = tab([n({ s: 6, f: 0, pitch: 'E3' }) + n({ s: 1, f: 3, pitch: 'G5' })]);
    expect(s.notices).toEqual([MISMATCH('bar 1')]);
  });

  it('applies <transpose number="2"> to staff 2 only', () => {
    const notes = n({ staff: 2, s: 6, f: 0, pitch: 'E3' });
    const on2 = read(
      score([{ id: 'P1', measures: [tabAttrs({ staves: 2, transpose: { chromatic: 0, octave: -1, number: 2 } }) + notes] }]),
    );
    expect(on2.notices).toEqual([]);
    const on1 = read(
      score([{ id: 'P1', measures: [tabAttrs({ staves: 2, transpose: { chromatic: 0, octave: -1, number: 1 } }) + notes] }]),
    );
    expect(on1.notices).toEqual([MISMATCH('bar 1')]);
  });

  it('lets a later <transpose> replace the earlier one from that point', () => {
    const up = n({ s: 6, f: 0, pitch: 'E3' });
    const later = '<attributes><transpose><chromatic>0</chromatic><octave-change>0</octave-change></transpose></attributes>';
    const s = tab([up, later + n({ s: 6, f: 0, pitch: 'E2' })], { transpose: { chromatic: 0, octave: -1 } });
    expect(s.notices).toEqual([]);
  });

  it('names the bars whose pitches are off by one', () => {
    const ok = n({ s: 1, f: 3, pitch: 'G4' });
    const off = n({ s: 1, f: 3, pitch: 'G#4' });
    expect(tab([ok, ok, off, ok, off, ok]).notices).toEqual([MISMATCH('bars 3, 5')]);
  });

  it('names the bar of a single off note', () => {
    const ok = n({ s: 1, f: 3, pitch: 'G4' });
    const off = n({ s: 1, f: 3, pitch: 'G#4' });
    expect(tab([ok, ok, off, ok, ok]).notices).toEqual([MISMATCH('bar 3')]);
  });

  it('accepts a capo-sized difference without a notice', () => {
    const s = tab([n({ s: 6, f: 0, pitch: 'G2' }) + n({ s: 1, f: 3, pitch: 'A#4' })], { capo: 3 });
    expect(s.capo).toBe(3);
    expect(s.notices).toEqual([]);
  });

  it('does not count notes without a <pitch>', () => {
    expect(tab([n({ s: 6, f: 0 })]).notices).toEqual([]);
  });
});

describe('tuning from the notes', () => {
  it('works the tuning out when there is no <staff-tuning>', () => {
    const s = tab([n({ s: 6, f: 2, pitch: 'F#2' }) + n({ s: 1, f: 0, pitch: 'E4' })], { tuning: [], lines: 6 });
    expect(s.tuning[5]).toBe(40);
    expect(s.tuning[0]).toBe(64);
    expect(s.notices).toEqual(['The tab has no tuning, so it was worked out from the notes.']);
  });

  it('takes the most common value per string and sounding pitch, not an octave high', () => {
    const s = tab([n({ s: 6, f: 0, pitch: 'E3' }) + n({ s: 6, f: 2, pitch: 'F#3' }) + n({ s: 6, f: 1, pitch: 'A3' })], {
      tuning: [], lines: 6,
      transpose: { chromatic: 0, octave: -1 },
    });
    expect(s.tuning[5]).toBe(40);
  });

  it('adds the capo sentence when a capo was found', () => {
    const s = tab([n({ s: 6, f: 0, pitch: 'G2' })], { tuning: [], lines: 6, capo: 3 });
    expect(s.tuning[5]).toBe(43);
    expect(s.notices).toEqual([
      'The tab has no tuning, so it was worked out from the notes. The written pitches may already include the capo, so the tuning could be 3 semitones high.',
    ]);
  });

  it('uses standard tuning with a notice when there are no pitches either', () => {
    const s = tab([n({ s: 6, f: 0 })], { tuning: [], lines: 6 });
    expect(s.tuning).toEqual([64, 59, 55, 50, 45, 40]);
    expect(s.notices).toEqual(['The tab has no tuning; standard tuning was used.']);
  });
});

describe('later changes', () => {
  it('keeps the first tuning and capo and names the bar of a later change', () => {
    const change = tabAttrs({ capo: 2 });
    const s = tab([n({ s: 1, f: 0 }), n({ s: 1, f: 0 }), change + n({ s: 1, f: 0 })]);
    expect(s.capo).toBe(0);
    expect(s.notices).toEqual(["The tab's tuning or capo changes in bar 3; the first one was used."]);
  });

  it('is silent when attributes repeat unchanged', () => {
    const s = tab([n({ s: 1, f: 0 }), tabAttrs() + n({ s: 1, f: 0 })]);
    expect(s.notices).toEqual([]);
  });
});

describe('layout marks', () => {
  const m = (...x: string[]) => x.join('') + n({ s: 1, f: 0, d: 4 });

  it('sets newBlock from new-system and new-page', () => {
    const s = tab([m(), m(print({ system: true })), m(print({ page: true })), m(print({}))]);
    expect(s.measures.map((x) => x.newBlock)).toEqual([false, true, true, false]);
  });

  it('reads <print> from the first part when the tab part has none', () => {
    const notation = '<attributes><divisions>1</divisions><clef><sign>G</sign><line>2</line></clef></attributes>';
    const s = read(
      score([
        { id: 'P1', measures: [notation + '<note><rest/><duration>4</duration></note>', print({ system: true }) + '<note><rest/><duration>4</duration></note>'] },
        { id: 'P2', measures: [tabAttrs() + m(), m()] },
      ]),
    );
    expect(s.measures.map((x) => x.newBlock)).toEqual([false, true]);
  });

  it('prefers the tab part when it has marks', () => {
    const notation = '<attributes><divisions>1</divisions><clef><sign>G</sign><line>2</line></clef></attributes>';
    const s = read(
      score([
        { id: 'P1', measures: [notation + '<note><rest/><duration>4</duration></note>', print({ system: true }) + '<note><rest/><duration>4</duration></note>'] },
        { id: 'P2', measures: [tabAttrs() + m(), m(), m(print({ system: true }))] },
      ]),
    );
    expect(s.measures.map((x) => x.newBlock)).toEqual([false, false, true]);
  });
});

describe('repeats', () => {
  it.each([
    ['repeat', repeatBar()],
    ['ending', ending()],
    ['segno', segno()],
    ['sound dacapo', sound({ dacapo: 'yes' })],
  ])('gives one notice for %s', (_name, mark) => {
    const s = tab([n({ s: 1, f: 0 }) + mark, n({ s: 1, f: 0 }) + repeatBar()]);
    expect(s.notices).toEqual([REPEATS]);
  });

  it('gives none for a light-light double barline or a plain tempo sound', () => {
    const s = tab([n({ s: 1, f: 0 }) + doubleBar() + sound({ tempo: '90' }) + wordsOf('Allegro')]);
    expect(s.notices).toEqual([]);
  });
});
