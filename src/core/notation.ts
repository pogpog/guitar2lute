import type { Notation } from './model';

/** fret 0..12; French tablature skips j */
export const FRENCH_FRETS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'k', 'l', 'm', 'n'];
/** fret 0..12; X = 10, overlined digits for 11 and 12 */
export const ITALIAN_FRETS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'X', '1̄', '2̄'];

export function fretGlyph(fret: number, notation: Notation): string {
  if (notation === 'french') return FRENCH_FRETS[fret] ?? String(fret);
  if (notation === 'italian') return ITALIAN_FRETS[fret] ?? String(fret);
  return String(fret);
}

/**
 * Glyph for a note on 0-based course `course`.
 * Courses 0-6 (1st-7th) use the fret glyph (the 7th course is drawn on a ledger line by the layout).
 * French diapasons: 8th = /a, 9th = //a, 10th = ///a, 11th+ = 4, 5, 6 ...
 * Italian diapasons: the course number. Modern: the fret number (each course has its own line).
 */
export function noteGlyph(course: number, fret: number, notation: Notation): string {
  if (course <= 6 || notation === 'modern') return fretGlyph(fret, notation);
  if (notation === 'french') {
    if (course <= 9) return '/'.repeat(course - 6) + fretGlyph(fret, 'french');
    return fret === 0 ? String(course - 6) : `${course - 6}${fretGlyph(fret, 'french')}`;
  }
  return fret === 0 ? String(course + 1) : `${course + 1}:${fretGlyph(fret, 'italian')}`;
}
