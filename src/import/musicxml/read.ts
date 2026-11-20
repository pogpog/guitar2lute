import { childElements, childText, ImportError } from './xml';

/** One struck note. `time` in integer units; `slot` 0 = main, −k = k-th grace column before (−1 nearest), +k = after-grace; `string` 0 = highest. */
export interface TabNote {
  time: number;
  slot: number;
  string: number;
  fret: number;
  measure: number;
}

export interface TabMeasure {
  number: string;
  start: number;
  length: number;
  newBlock: boolean;
}

export interface TabScore {
  /** Time units per quarter = LCM of every `<divisions>` in the part; a duration d under divisions D is round(d × unit / D). */
  unit: number;
  /** 6 open strings, MIDI, index 0 = highest. */
  tuning: number[];
  /** 0..12 */
  capo: number;
  measures: TabMeasure[];
  /** Sorted by time, slot, string. */
  notes: TabNote[];
  /** Aggregated, final wording. */
  notices: string[];
}

const NO_TAB =
  'This MusicXML file has no tab staff (only standard notation). Only tab staves can be imported in this version.';
const STANDARD_TUNING = [64, 59, 55, 50, 45, 40];
const STEP_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Wording of a notice that names bars: `count` occurrences, `bars` already written out ("bar 2", "bars 2, 5"). */
type BarWording = (count: number, bars: string) => string;

const TIMING: BarWording = (_count, bars) => `Timing in ${bars} went before the start of the bar and was corrected.`;

interface BarItem {
  wording: BarWording;
  count: number;
  bars: string[];
}

/** Notices in order of first appearance; those of one wording collect their bars into one notice. */
class Notices {
  private items: (string | BarItem)[] = [];

  add(text: string): void {
    this.items.push(text);
  }

  inBar(wording: BarWording, bar: string): void {
    let item = this.items.find((i): i is BarItem => typeof i !== 'string' && i.wording === wording);
    if (!item) {
      item = { wording, count: 0, bars: [] };
      this.items.push(item);
    }
    item.count++;
    if (!item.bars.includes(bar)) item.bars.push(bar);
  }

  list(): string[] {
    return this.items.map((i) => (typeof i === 'string' ? i : i.wording(i.count, barList(i.bars))));
  }
}

/** "bar 2", "bars 2, 5", at most 10 bars then "…". */
function barList(bars: string[]): string {
  const shown = bars.slice(0, 10).join(', ') + (bars.length > 10 ? ', …' : '');
  return `${bars.length === 1 ? 'bar' : 'bars'} ${shown}`;
}

function numberText(el: Element, name: string): number | null {
  const text = childText(el, name);
  if (text === null || text === '') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** The staff an element's `number` attribute names; 1 when absent. */
function staffOf(el: Element): number {
  const n = el.getAttribute('number');
  return n === null || n === '' ? 1 : Number(n);
}

function hasNumber(el: Element): boolean {
  const n = el.getAttribute('number');
  return n !== null && n !== '';
}

// ---- Which staff ----

interface TabStaff {
  part: Element;
  staff: number;
  details: Element | null;
}

function partNames(root: Element): Map<string, string> {
  const names = new Map<string, string>();
  for (const list of childElements(root, 'part-list')) {
    for (const sp of childElements(list, 'score-part')) {
      const name = childText(sp, 'part-name');
      if (name) names.set(sp.getAttribute('id') ?? '', name);
    }
  }
  return names;
}

/** First TAB-clef staff with 6 strings (spec §5.5 "Which staff"); the first clef and staff-details of each staff count. */
function findTabStaff(root: Element, notices: Notices): TabStaff {
  const names = partNames(root);
  const found: (TabStaff & { strings: number; name: string })[] = [];
  for (const part of childElements(root, 'part')) {
    const id = part.getAttribute('id') ?? '';
    const stavesEl = part.getElementsByTagName('staves')[0];
    const staves = stavesEl ? Math.max(1, Math.round(Number(stavesEl.textContent)) || 1) : 1;
    const clefs = Array.from(part.getElementsByTagName('clef'));
    const allDetails = Array.from(part.getElementsByTagName('staff-details'));
    for (let staff = 1; staff <= staves; staff++) {
      const clef = clefs.find((c) => staffOf(c) === staff);
      if (!clef || childText(clef, 'sign') !== 'TAB') continue;
      const details = allDetails.find((d) => !hasNumber(d) || staffOf(d) === staff) ?? null;
      const tunings = details ? childElements(details, 'staff-tuning').length : 0;
      const lines = details ? numberText(details, 'staff-lines') : null;
      const strings = tunings || (lines ?? 5);
      found.push({ part, staff, details, strings, name: names.get(id) || id });
    }
  }
  const chosen = found.find((f) => f.strings === 6);
  if (!chosen) {
    if (found.length === 0) throw new ImportError(NO_TAB);
    throw new ImportError(`The tab staff has ${found[0].strings} strings; only 6-string guitar tab can be imported.`);
  }
  const others = found.filter((f) => f !== chosen);
  if (others.length > 0) {
    notices.add(`Other tab staves were not imported: ${others.map((o) => `${o.name} (${o.strings} strings)`).join(', ')}.`);
  }
  return { part: chosen.part, staff: chosen.staff, details: chosen.details };
}

// ---- Tuning ----

function tuningMidi(st: Element): number | null {
  const step = STEP_PC[childText(st, 'tuning-step') ?? ''];
  const octave = numberText(st, 'tuning-octave');
  if (step === undefined || octave === null) return null;
  return 12 * (octave + 1) + step + Math.round(numberText(st, 'tuning-alter') ?? 0);
}

/** `<staff-tuning line="1..6">` (line 1 = lowest) → MIDI, index 0 = highest. Strings it leaves out stay standard (Task 8 decides the rest). */
function readTuning(details: Element | null): number[] {
  const tuning = STANDARD_TUNING.slice();
  if (!details) return tuning;
  for (const st of childElements(details, 'staff-tuning')) {
    const line = Number(st.getAttribute('line'));
    const midi = tuningMidi(st);
    if (Number.isInteger(line) && line >= 1 && line <= 6 && midi !== null) tuning[6 - line] = midi;
  }
  return tuning;
}

// ---- Time ----

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

function divisionsOf(el: Element): number {
  const value = Math.round(Number(el.textContent));
  return value >= 1 ? value : 1;
}

/** LCM of every `<divisions>` in the part. */
function partUnit(part: Element): number {
  let unit = 1;
  for (const d of Array.from(part.getElementsByTagName('divisions'))) {
    const v = divisionsOf(d);
    unit = (unit / gcd(unit, v)) * v;
  }
  return unit;
}

/** Quarters in a measure of this `<time>`, or null when it has no usable beats ("3+2" adds up). */
function timeQuarters(time: Element): number | null {
  const beats = (childText(time, 'beats') ?? '').split('+').reduce((sum, b) => sum + Number(b), 0);
  const beatType = numberText(time, 'beat-type');
  if (!(beats > 0) || beatType === null || !(beatType > 0)) return null;
  return (beats * 4) / beatType;
}

interface Context {
  unit: number;
  staff: number;
  notices: Notices;
}

function noteStaff(note: Element): number {
  return numberText(note, 'staff') ?? 1;
}

function technicalOf(note: Element): Element | null {
  for (const notations of childElements(note, 'notations')) {
    const technical = childElements(notations, 'technical')[0];
    if (technical) return technical;
  }
  return null;
}

/** A tab-staff note at `time` → the note it strikes, or null. The note rules of spec §5.5 "Notes" belong here. */
function tabNote(note: Element, time: number, measure: number): TabNote | null {
  if (childElements(note, 'rest').length > 0) return null;
  const technical = technicalOf(note);
  if (!technical) return null;
  const string = numberText(technical, 'string');
  const fret = numberText(technical, 'fret');
  if (string === null || fret === null) return null;
  return { time, slot: 0, string: string - 1, fret, measure };
}

/** Walks the part's measures with one cursor (spec §5.5 "Time"). */
function readTime(part: Element, ctx: Context): { measures: TabMeasure[]; notes: TabNote[] } {
  const measures: TabMeasure[] = [];
  const notes: TabNote[] = [];
  let start = 0;
  let divisions = 1;
  let quarters = 4;
  childElements(part, 'measure').forEach((measure, index) => {
    const number = measure.getAttribute('number') || String(index + 1);
    let cursor = start;
    let reached = start;
    let lastStart = start;
    const duration = (el: Element): number => {
      const d = numberText(el, 'duration') ?? 0;
      if (d < 0) {
        ctx.notices.inBar(TIMING, number);
        return 0;
      }
      return Math.round((d * ctx.unit) / divisions);
    };
    for (const el of childElements(measure)) {
      switch (el.nodeName) {
        case 'attributes': {
          const div = childElements(el, 'divisions')[0];
          if (div) divisions = divisionsOf(div);
          const time = childElements(el, 'time')[0];
          const q = time ? timeQuarters(time) : null;
          if (q !== null) quarters = q;
          break;
        }
        case 'note': {
          let at = cursor;
          if (childElements(el, 'chord').length > 0) at = lastStart;
          else {
            lastStart = cursor;
            cursor += duration(el);
            reached = Math.max(reached, cursor);
          }
          if (noteStaff(el) === ctx.staff) {
            const note = tabNote(el, at, index);
            if (note) notes.push(note);
          }
          break;
        }
        case 'backup':
          cursor -= duration(el);
          if (cursor < start) {
            cursor = start;
            ctx.notices.inBar(TIMING, number);
          }
          break;
        case 'forward':
          cursor += duration(el);
          reached = Math.max(reached, cursor);
          break;
      }
    }
    const length = reached > start ? reached - start : Math.round(quarters * ctx.unit);
    measures.push({ number, start, length, newBlock: false });
    start += length;
  });
  return { measures, notes };
}

/** Onsets less than 1/48 of a quarter after the first onset of their cluster join it (exporters round tuplets). */
function snap(notes: TabNote[], unit: number): void {
  const tolerance = unit / 48;
  const order = notes.slice().sort((a, b) => a.measure - b.measure || a.time - b.time);
  let measure = -1;
  let anchor = 0;
  for (const note of order) {
    if (note.measure !== measure || note.time - anchor >= tolerance) {
      measure = note.measure;
      anchor = note.time;
    }
    note.time = anchor;
  }
}

export function readMusicXml(doc: Document): TabScore {
  const root = doc.documentElement;
  const notices = new Notices();
  const tab = findTabStaff(root, notices);
  const tuning = readTuning(tab.details);
  const unit = partUnit(tab.part);
  const { measures, notes } = readTime(tab.part, { unit, staff: tab.staff, notices });
  snap(notes, unit);
  notes.sort((a, b) => a.time - b.time || a.slot - b.slot || a.string - b.string);
  return { unit, tuning, capo: 0, measures, notes, notices: notices.list() };
}
