import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { parseXml, type XmlParser } from '../../../src/import/musicxml/xml';
import { readMusicXml, type TabScore } from '../../../src/import/musicxml/read';
import { capoFromText } from '../../../src/import/musicxml/capo';
import { n, score, tabAttrs, wordsOf } from './build';

const parser = new DOMParser({ onError: () => {} }) as unknown as XmlParser;

function read(xml: string): TabScore {
  return readMusicXml(parseXml(xml, parser));
}

const NOTE = n({ s: 1, f: 0 });

describe('capoFromText', () => {
  it.each([
    ['Capo III', 3],
    ['capo 3', 3],
    ['Capo: III', 3],
    ['Capo. 2', 2],
    ['Capo on 2', 2],
    ['Capo at fret 3', 3],
    ['Capo 14', 14],
    ['Capo 2nd fret', 2],
    ['Capo on the 3rd fret', 3],
    ['Da-Capo 2', null],
    ['Play with capo VII please', 7],
    ['Da Capo al Fine (2x)', null],
    ['D.C. al Fine', null],
    ['Capo XIII', null],
    ['Capo', null],
    ['Capo 0', null],
    ['Capotasto', null],
  ])('%s -> %s', (text, expected) => {
    expect(capoFromText(text)).toBe(expected);
  });

  it('skips a Da Capo and finds a later capo', () => {
    expect(capoFromText('Da Capo then Capo 2')).toBe(2);
  });
});

describe('capo in the reader', () => {
  it('reads <staff-details><capo> over words', () => {
    const s = read(
      score([{ id: 'P1', measures: [tabAttrs({ capo: 2 }) + wordsOf('Capo III') + NOTE] }]),
    );
    expect(s.capo).toBe(2);
    expect(s.notices).toEqual([]);
  });

  it('joins the <words> of one direction', () => {
    const s = read(score([{ id: 'P1', measures: [tabAttrs() + wordsOf('Capo', 'III') + NOTE] }]));
    expect(s.capo).toBe(3);
  });

  it('accepts the same capo in both parts without a notice', () => {
    const s = read(
      score([
        {
          id: 'P1',
          measures: [
            '<attributes><divisions>1</divisions><clef><sign>G</sign><line>2</line></clef></attributes>' +
              wordsOf('Capo III') +
              '<note><rest/><duration>4</duration></note>',
          ],
        },
        { id: 'P2', measures: [tabAttrs() + wordsOf('Capo III') + NOTE] },
      ]),
    );
    expect(s.capo).toBe(3);
    expect(s.notices).toEqual([]);
  });

  it('reads <credit-words>', () => {
    const s = read(score([{ id: 'P1', measures: [tabAttrs() + NOTE] }], { credits: ['Capo 2'] }));
    expect(s.capo).toBe(2);
  });

  it('uses the first of two different capos and says so', () => {
    const s = read(score([{ id: 'P1', measures: [tabAttrs() + wordsOf('Capo III') + wordsOf('Capo 5') + NOTE] }]));
    expect(s.capo).toBe(3);
    expect(s.notices).toEqual(['The score names more than one capo; used capo 3.']);
  });

  it('writes capo 0 for a capo above 12 and says so', () => {
    const s = read(score([{ id: 'P1', measures: [tabAttrs() + wordsOf('Capo 14') + NOTE] }]));
    expect(s.capo).toBe(0);
    expect(s.notices).toEqual(['The score says capo 14, which is more than 12; set the capo yourself.']);
  });

  it('has capo 0 when none is named, and ignores Da Capo', () => {
    const s = read(score([{ id: 'P1', measures: [tabAttrs() + wordsOf('Da Capo al Fine') + NOTE] }]));
    expect(s.capo).toBe(0);
    expect(s.notices).toEqual([]);
  });
});
