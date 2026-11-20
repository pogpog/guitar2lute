import { describe, it, expect } from 'vitest';
import { FRENCH_FRETS, fretGlyph, noteGlyph } from '../../src/core/notation';

describe('fret glyphs', () => {
  it('uses French letters without j', () => {
    expect(FRENCH_FRETS).not.toContain('j');
    expect(fretGlyph(0, 'french')).toBe('a');
    expect(fretGlyph(8, 'french')).toBe('i');
    expect(fretGlyph(9, 'french')).toBe('k');
  });
  it('uses X for fret 10 in Italian', () => {
    expect(fretGlyph(3, 'italian')).toBe('3');
    expect(fretGlyph(10, 'italian')).toBe('X');
  });
  it('uses plain numbers in modern', () => {
    expect(fretGlyph(10, 'modern')).toBe('10');
  });
});

describe('diapason glyphs (0-based course index)', () => {
  it('writes the fretted 7th course as a normal fret glyph', () => {
    expect(noteGlyph(6, 2, 'french')).toBe('c');
    expect(noteGlyph(6, 2, 'italian')).toBe('2');
  });
  it('writes French open diapasons with slashes then numerals', () => {
    expect(noteGlyph(7, 0, 'french')).toBe('/a');
    expect(noteGlyph(8, 0, 'french')).toBe('//a');
    expect(noteGlyph(9, 0, 'french')).toBe('///a');
    expect(noteGlyph(10, 0, 'french')).toBe('4');
    expect(noteGlyph(12, 0, 'french')).toBe('6');
  });
  it('writes Italian diapasons as course numbers and modern as frets', () => {
    expect(noteGlyph(7, 0, 'italian')).toBe('8');
    expect(noteGlyph(12, 0, 'italian')).toBe('13');
    expect(noteGlyph(7, 0, 'modern')).toBe('0');
  });
});
