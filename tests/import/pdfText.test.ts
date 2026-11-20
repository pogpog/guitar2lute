import { describe, it, expect } from 'vitest';
import { reconstructPage, reconstructText, looksLikeNotationPdf } from '../../src/import/pdfText';

const item = (str: string, x: number, y: number, fontName = 'F1') => ({ str, x, y, width: str.length * 6, height: 10, fontName });

describe('reconstructPage', () => {
  it('orders lines top to bottom', () => {
    const lines = reconstructPage([item('B|--1--|', 40, 788), item('e|--0--|', 40, 800)]);
    expect(lines.map((l) => l.text)).toEqual(['e|--0--|', 'B|--1--|']);
  });
  it('joins split items by character column', () => {
    expect(reconstructPage([item('e|--', 40, 800), item('0--|', 64, 800)])[0].text).toBe('e|--0--|');
    expect(reconstructPage([item('e|--', 40, 800), item('0', 76, 800)])[0].text).toBe('e|--  0');
  });
  it('groups items with slightly different y', () => {
    expect(reconstructPage([item('e|--', 40, 800), item('0--|', 64, 801.5)])).toHaveLength(1);
  });
  it('drops private-use music-font glyphs', () => {
    expect(reconstructPage([item('e|--0--|', 40, 800)])[0].text).toBe('e|--0--|');
  });
});

describe('reconstructText', () => {
  it('removes repeated headers and page numbers', () => {
    const page = (n: number) => [item('My Song Book', 40, 820), item('e|--0--|', 40, 800), item(String(n), 280, 20)];
    expect(reconstructText([page(1), page(2)])).toBe('e|--0--|\ne|--0--|');
  });
  it('keeps identical tab lines at page edges', () => {
    const page = () => [item('e|--0--|', 40, 800), item('E|-----|', 40, 788)];
    expect(reconstructText([page(), page()]).split('\n')).toHaveLength(4);
  });
});

describe('looksLikeNotationPdf', () => {
  it('flags digits without dash runs', () => {
    expect(looksLikeNotationPdf('0 2 3\n5 7')).toBe(true);
    expect(looksLikeNotationPdf('e|---0---|')).toBe(false);
    expect(looksLikeNotationPdf('e|\u2013\u2013\u20130\u2014\u2014\u2014|')).toBe(false);
  });
});
