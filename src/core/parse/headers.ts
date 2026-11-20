import type { Tuning } from '../model';
import { nameToMidi, parsePitchClass } from '../pitch';
import { guitarTuningByName, guitarTuningFromCourses, inferGuitarTuning } from '../tunings';

export interface TabHeaders { capo: number | null; tuning: Tuning | null; }

const NOTE_LIST = /^(?:[A-Ga-g][#b♯♭]?\d?[\s,\-]*){6}$/;
const NOTE_NAME = /[A-Ga-g][#b♯♭]?\d?/g;

export function parseHeaders(text: string): TabHeaders {
  let capo: number | null = null;
  const capoMatch = /\bcapo\b[^\d\n]{0,15}(\d{1,2})/i.exec(text);
  if (capoMatch) {
    const n = Number(capoMatch[1]);
    if (n >= 0 && n <= 12) capo = n;
  }
  if (/\bno\s+capo\b/i.test(text)) capo = 0;

  let tuning: Tuning | null = null;
  const tm = /^\s*tuning\s*[:\-]?\s*(.+?)\s*$/im.exec(text);
  if (tm) {
    tuning = guitarTuningByName(tm[1]);
    if (!tuning && NOTE_LIST.test(tm[1])) {
      const notes = tm[1].match(NOTE_NAME) ?? [];
      const withOctave = notes.filter((n) => /\d$/.test(n)).length;
      if (withOctave === 6) {
        const midis = notes.map((n) => nameToMidi(n));
        if (midis.every((m) => m !== null)) tuning = guitarTuningFromCourses((midis as number[]).reverse());
      } else if (withOctave === 0) {
        const pcs = notes.map((n) => parsePitchClass(n));
        if (pcs.every((p) => p !== null)) tuning = inferGuitarTuning((pcs as number[]).reverse());
      }
    }
  }
  return { capo, tuning };
}
