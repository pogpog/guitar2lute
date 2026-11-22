import { describe, it, expect } from 'vitest';
import { parseHeaders } from '../../../src/core/parse/headers';

describe('parseHeaders', () => {
  it('reads capo in common forms', () => {
    expect(parseHeaders('Capo 2').capo).toBe(2);
    expect(parseHeaders('capo: 3rd fret').capo).toBe(3);
    expect(parseHeaders('Capo on 5th fret').capo).toBe(5);
    expect(parseHeaders('No capo').capo).toBe(0);
    expect(parseHeaders('nothing here').capo).toBeNull();
  });
  it('reads tuning by name or note list', () => {
    expect(parseHeaders('Tuning: Drop D').tuning!.id).toBe('guitar-drop-d');
    expect(parseHeaders('tuning - DADGAD').tuning!.id).toBe('guitar-dadgad');
    expect(parseHeaders('Tuning: D A D G B E').tuning!.id).toBe('guitar-drop-d');
    expect(parseHeaders('Tuning: Eb Ab Db Gb Bb Eb').tuning!.id).toBe('guitar-half-down');
    expect(parseHeaders('no tuning line').tuning).toBeNull();
  });
  it('takes octaves as written', () => {
    expect(parseHeaders('Tuning: E3 A3 D4 G4 B3 E4').tuning!.courses).toEqual([64, 59, 67, 62, 57, 52]);
  });
  it('matches a preset when octaves agree', () => {
    expect(parseHeaders('Tuning: E2 A2 D3 F#3 B3 E4').tuning!.courses).toEqual([64, 59, 54, 50, 45, 40]);
    expect(parseHeaders('Tuning: E2 A2 D3 G3 B3 E4').tuning!.id).toBe('guitar-standard');
  });
  it('rejects a mix of octave and plain names', () => {
    expect(parseHeaders('Tuning: E2 A D3 G3 B3 E4').tuning).toBeNull();
  });
  it('still reads plain names and dashes', () => {
    expect(parseHeaders('Tuning: D-A-D-G-B-E').tuning!.id).toBe('guitar-drop-d');
  });
});
