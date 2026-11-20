import { describe, it, expect } from 'vitest';
import { midiToName, nameToMidi, parsePitchClass, prettyName, preferFlats, octaveOf, pitchClass } from '../../src/core/pitch';

describe('pitch', () => {
  it('converts MIDI to names', () => {
    expect(midiToName(64)).toBe('E4');
    expect(midiToName(70)).toBe('A#4');
    expect(midiToName(70, true)).toBe('Bb4');
    expect(midiToName(43, false, false)).toBe('G');
  });
  it('parses note names', () => {
    expect(nameToMidi('G2')).toBe(43);
    expect(nameToMidi('Bb1')).toBe(34);
    expect(nameToMidi('Cb4')).toBe(59);
    expect(nameToMidi('F#3')).toBe(54);
    expect(nameToMidi('H2')).toBeNull();
    expect(parsePitchClass('e')).toBe(4);
    expect(parsePitchClass('Eb')).toBe(3);
    expect(parsePitchClass('X')).toBeNull();
  });
  it('handles pitch classes and octaves', () => {
    expect(pitchClass(-1)).toBe(11);
    expect(octaveOf(60)).toBe(4);
  });
  it('prettifies accidentals', () => {
    expect(prettyName('Bb')).toBe('B♭');
    expect(prettyName('F#m')).toBe('F♯m');
  });
  it('prefers sharps for sharp keys and flats otherwise', () => {
    expect(preferFlats([40, 47, 52, 56, 59, 64])).toBe(false); // E major chord
    expect(preferFlats([58, 62, 65])).toBe(true); // Bb major chord
    expect(preferFlats([])).toBe(true);
  });
});
