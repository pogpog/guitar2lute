import type { Midi, Tuning } from './model';
import { nameToMidi, pitchClass, midiToName, preferFlats, prettyName } from './pitch';

function mk(id: string, name: string, notes: string[], fretted = notes.length): Tuning {
  return {
    id,
    name,
    courses: notes.map((n) => {
      const m = nameToMidi(n);
      if (m === null) throw new Error(`Bad note ${n}`);
      return m;
    }),
    frettedCourses: fretted,
  };
}

const REN = ['G4', 'D4', 'A3', 'F3', 'C3', 'G2'];

export const GUITAR_PRESETS: Tuning[] = [
  mk('guitar-standard', 'Standard (E A D G B E)', ['E4', 'B3', 'G3', 'D3', 'A2', 'E2']),
  mk('guitar-drop-d', 'Drop D', ['E4', 'B3', 'G3', 'D3', 'A2', 'D2']),
  mk('guitar-dadgad', 'DADGAD', ['D4', 'A3', 'G3', 'D3', 'A2', 'D2']),
  mk('guitar-open-g', 'Open G', ['D4', 'B3', 'G3', 'D3', 'G2', 'D2']),
  mk('guitar-open-d', 'Open D', ['D4', 'A3', 'F#3', 'D3', 'A2', 'D2']),
  mk('guitar-half-down', 'Half-step down (E♭)', ['Eb4', 'Bb3', 'Gb3', 'Db3', 'Ab2', 'Eb2']),
];

export const LUTE_PRESETS: Tuning[] = [
  mk('lute-6-g', 'Renaissance 6-course in G', REN, 6),
  mk('lute-7-g', 'Renaissance 7-course in G', [...REN, 'F2'], 7),
  mk('lute-8-g', 'Renaissance 8-course in G', [...REN, 'F2', 'D2'], 7),
  mk('lute-10-g', 'Renaissance 10-course in G', [...REN, 'F2', 'Eb2', 'D2', 'C2'], 7),
  mk('lute-13-baroque-dm', 'Baroque 13-course D minor',
    ['F4', 'D4', 'A3', 'F3', 'D3', 'A2', 'G2', 'F2', 'E2', 'D2', 'C2', 'B1', 'A1'], 6),
];

export const STANDARD_GUITAR = GUITAR_PRESETS[0];
export const DEFAULT_LUTE = LUTE_PRESETS[0];

export function cloneTuning(t: Tuning): Tuning {
  return { ...t, courses: [...t.courses] };
}

export function findPreset(id: string): Tuning | undefined {
  const t = [...GUITAR_PRESETS, ...LUTE_PRESETS].find((p) => p.id === id);
  return t ? cloneTuning(t) : undefined;
}

const ALIASES: Record<string, string> = {
  standard: 'guitar-standard',
  estandard: 'guitar-standard',
  eadgbe: 'guitar-standard',
  dropd: 'guitar-drop-d',
  dadgbe: 'guitar-drop-d',
  dadgad: 'guitar-dadgad',
  openg: 'guitar-open-g',
  dgdgbd: 'guitar-open-g',
  opend: 'guitar-open-d',
  'dadf#ad': 'guitar-open-d',
  halfstepdown: 'guitar-half-down',
  halfstep: 'guitar-half-down',
  ebstandard: 'guitar-half-down',
  eb: 'guitar-half-down',
  ebabdbgbbbeb: 'guitar-half-down',
};

export function guitarTuningByName(name: string): Tuning | null {
  const key = name
    .toLowerCase()
    .replace(/♭/g, 'b')
    .replace(/♯/g, '#')
    .replace(/[\s\-_().,:]/g, '')
    .replace(/tuning$/, '');
  let id = ALIASES[key];
  if (!id) {
    const prefix = Object.keys(ALIASES)
      .filter((a) => a.length >= 5 && key.startsWith(a))
      .sort((a, b) => b.length - a.length)[0];
    if (prefix) id = ALIASES[prefix];
  }
  return id ? findPreset(id) ?? null : null;
}

/** Labels give pitch classes; place each in the octave nearest the standard-tuning string. */
export function inferGuitarTuning(pcsHighToLow: number[]): Tuning {
  const std = STANDARD_GUITAR.courses;
  const courses = pcsHighToLow.map((pc, i) => {
    const base = std[i];
    let d = pitchClass(pc - base);
    if (d > 5) d -= 12;
    return base + d;
  });
  return guitarTuning(courses);
}

/** The matching preset, or a custom tuning named by its notes from low to high. */
function guitarTuning(courses: Midi[]): Tuning {
  const match = GUITAR_PRESETS.find((t) => t.courses.every((m, i) => m === courses[i]));
  if (match) return cloneTuning(match);
  const label = [...courses].reverse().map((m) => midiToName(m, false, false)).join(' ');
  return { id: 'guitar-custom', name: `Custom (${label})`, courses, frettedCourses: 6 };
}

export function setGuitarStringPitch(t: Tuning, string: number, midi: Midi): Tuning {
  const courses = [...t.courses];
  courses[string] = midi;
  return guitarTuning(courses);
}

const NATURAL = new Set([0, 2, 4, 5, 7, 9, 11]);

function custom(t: Tuning, patch: Partial<Tuning>): Tuning {
  return { ...t, ...patch, id: 'lute-custom', name: 'Custom' };
}

export function addBassCourse(t: Tuning): Tuning {
  let m = t.courses[t.courses.length - 1] - 1;
  while (!NATURAL.has(pitchClass(m))) m--;
  return custom(t, { courses: [...t.courses, m] });
}

export function removeBassCourse(t: Tuning): Tuning {
  if (t.courses.length <= 6) return t;
  const courses = t.courses.slice(0, -1);
  return custom(t, { courses, frettedCourses: Math.min(t.frettedCourses, courses.length) });
}

export function setCoursePitch(t: Tuning, course: number, midi: Midi): Tuning {
  const courses = [...t.courses];
  courses[course] = midi;
  return custom(t, { courses });
}

export function setFrettedCourses(t: Tuning, n: number): Tuning {
  return custom(t, { frettedCourses: Math.max(1, Math.min(t.courses.length, n)) });
}

export interface CourseLabel {
  /** 1-based, 1 = highest */
  course: number;
  /** pitch with octave, e.g. "G4", "E♭2" */
  name: string;
  /** open-only bass course */
  diapason: boolean;
}

export function courseLabels(t: Tuning): CourseLabel[] {
  const flats = preferFlats(t.courses);
  return t.courses.map((m, i) => ({
    course: i + 1,
    name: prettyName(midiToName(m, flats)),
    diapason: i >= t.frettedCourses,
  }));
}
