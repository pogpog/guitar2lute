import { describe, it, expect } from 'vitest';
import { detectChordName, transposeChordName } from '../../src/core/chordName';

describe('detectChordName', () => {
  it('names common chords', () => {
    expect(detectChordName([40, 47, 52, 56, 59, 64], false)).toBe('E');
    expect(detectChordName([45, 52, 57, 60, 64], false)).toBe('Am');
    expect(detectChordName([43, 47, 50, 53], false)).toBe('G7');
    expect(detectChordName([58, 62, 65], true)).toBe('Bb');
  });
  it('handles power chords, single notes and empty input', () => {
    expect(detectChordName([43, 50], false)).toBe('G5');
    expect(detectChordName([60], false)).toBe('C');
    expect(detectChordName([], false)).toBe('');
  });
});

describe('transposeChordName', () => {
  it('transposes root, quality and bass', () => {
    expect(transposeChordName('E', 3, true)).toBe('G');
    expect(transposeChordName('Am', 3, true)).toBe('Cm');
    expect(transposeChordName('D/F#', 3, true)).toBe('F/A');
    expect(transposeChordName('E7', 1, true)).toBe('F7');
    expect(transposeChordName('C', 1, false)).toBe('C#');
    expect(transposeChordName('C', 1, true)).toBe('Db');
    expect(transposeChordName('weird', 2, true)).toBe('weird');
    expect(transposeChordName('Am', 0, true)).toBe('Am');
  });
});
