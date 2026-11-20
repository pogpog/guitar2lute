import type { Midi } from './model';

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function pitchClass(m: number): number {
  return ((m % 12) + 12) % 12;
}

export function octaveOf(m: Midi): number {
  return Math.floor(m / 12) - 1;
}

export function pcName(pc: number, flats = false): string {
  return (flats ? FLAT_NAMES : SHARP_NAMES)[pitchClass(pc)];
}

export function midiToName(m: Midi, flats = false, withOctave = true): string {
  const name = pcName(m, flats);
  return withOctave ? `${name}${octaveOf(m)}` : name;
}

function accidental(a: string): number {
  if (a === '#' || a === '♯') return 1;
  if (a === 'b' || a === '♭') return -1;
  return 0;
}

export function parsePitchClass(s: string): number | null {
  const m = /^([A-Ga-g])([#b♯♭]?)$/.exec(s.trim());
  if (!m) return null;
  return pitchClass(LETTER_PC[m[1].toUpperCase()] + accidental(m[2]));
}

export function nameToMidi(s: string): Midi | null {
  const m = /^([A-Ga-g])([#b♯♭]?)(-?\d)$/.exec(s.trim());
  if (!m) return null;
  return (Number(m[3]) + 1) * 12 + LETTER_PC[m[1].toUpperCase()] + accidental(m[2]);
}

export function prettyName(s: string): string {
  return s.replace(/#/g, '♯').replace(/([A-G])b/g, '$1♭');
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
/** tie-break order: C, then flat keys, then sharp keys */
const TONIC_ORDER = [0, 5, 10, 3, 8, 1, 7, 2, 9, 4, 11, 6];
const SHARP_KEYS = new Set([7, 2, 9, 4, 11, 6]);

/** Pick the major key that contains most of the pitches; flats unless that key is a sharp key. */
export function preferFlats(pitches: Midi[]): boolean {
  if (pitches.length === 0) return true;
  const pcs = pitches.map(pitchClass);
  let best = 0;
  let bestScore = -1;
  for (const t of TONIC_ORDER) {
    const scale = new Set(MAJOR.map((i) => (t + i) % 12));
    const score = pcs.filter((pc) => scale.has(pc)).length;
    if (score > bestScore) {
      best = t;
      bestScore = score;
    }
  }
  return !SHARP_KEYS.has(best);
}
