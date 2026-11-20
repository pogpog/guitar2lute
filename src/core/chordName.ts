import { Chord } from 'tonal';
import type { Midi } from './model';
import { pcName, parsePitchClass } from './pitch';

function tidy(name: string): string {
  return name.replace(/^([A-G][#b]?)M(\/[A-G][#b]?)?$/, '$1$2');
}

export function detectChordName(pitches: Midi[], flats: boolean): string {
  const sorted = [...pitches].sort((a, b) => a - b);
  const names: string[] = [];
  for (const p of sorted) {
    const n = pcName(p, flats);
    if (!names.includes(n)) names.push(n);
  }
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  const found = Chord.detect(names);
  if (found.length > 0) return tidy(found[0]);
  if (names.length === 2 && (sorted[sorted.length - 1] - sorted[0]) % 12 === 7) return `${names[0]}5`;
  return '';
}

export function transposeChordName(name: string, semis: number, flats: boolean): string {
  if (semis === 0) return name;
  const m = /^([A-G][#b♯♭]?)(.*?)(?:\/([A-G][#b♯♭]?))?$/.exec(name.trim());
  if (!m) return name;
  const root = parsePitchClass(m[1]);
  if (root === null) return name;
  let out = pcName(root + semis, flats) + m[2];
  if (m[3]) {
    const bass = parsePitchClass(m[3]);
    if (bass !== null) out += `/${pcName(bass + semis, flats)}`;
  }
  return out;
}
