import { capoFromText } from './capo';
import { childElements, childText, ImportError } from './xml';

/** One struck note. `time` in integer units; `slot` 0 = main, −k = k-th grace column before (−1 nearest), +k = after-grace; `string` 0 = highest. */
export interface TabNote {
  time: number;
  slot: number;
  string: number;
  fret: number;
  measure: number;
  /** Sounding MIDI pitch, when the note was written with a `<pitch>`; used by the pitch check only. */
  pitch?: number;
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

const NO_STRING_FRET: BarWording = (count, bars) =>
  `${count} ${count === 1 ? 'note' : 'notes'} without string/fret ${count === 1 ? 'was' : 'were'} skipped (${bars}).`;
const HARMONIC: BarWording = (count, bars) =>
  `${count} ${count === 1 ? 'harmonic was' : 'harmonics were'} skipped (${bars}).`;
const HIGH_FRET: BarWording = (count, bars) =>
  `${count} ${count === 1 ? 'note' : 'notes'} above fret 24 ${count === 1 ? 'was' : 'were'} skipped (${bars}).`;
const BAD_STRING: BarWording = (count, bars) =>
  `${count} ${count === 1 ? 'note' : 'notes'} on a string outside 1–6 ${count === 1 ? 'was' : 'were'} skipped (${bars}).`;
const CLASH: BarWording = (count, bars) =>
  `${count} ${count === 1 ? 'place had' : 'places had'} two notes on one string; the first was kept (${bars}).`;
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

/** `<staff-tuning line="1..6">` (line 1 = lowest) → MIDI, index 0 = highest. Strings it leaves out stay standard. */
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

/** True when the note continues a tie: `<tie type="stop"/>`, or without any `<tie>` the visual `<tied>` stop/continue. */
function continuesTie(note: Element): boolean {
  const ties = childElements(note, 'tie');
  if (ties.length > 0) return ties.some((t) => t.getAttribute('type') === 'stop');
  return childElements(note, 'notations').some((nt) =>
    childElements(nt, 'tied').some((t) => ['stop', 'continue'].includes(t.getAttribute('type') ?? '')),
  );
}

/** Written MIDI pitch of a `<pitch>`, or null. */
function writtenPitch(note: Element): number | null {
  const pitch = childElements(note, 'pitch')[0];
  if (!pitch) return null;
  const step = STEP_PC[childText(pitch, 'step') ?? ''];
  const octave = numberText(pitch, 'octave');
  if (step === undefined || octave === null) return null;
  return 12 * (octave + 1) + step + Math.round(numberText(pitch, 'alter') ?? 0);
}

/** A tab-staff note at `time` → the note it strikes, or null (spec §5.5 "Notes"). `bar` names the bar in notices. */
function tabNote(
  note: Element,
  time: number,
  measure: number,
  bar: string,
  shift: number,
  notices: Notices,
): TabNote | null {
  if (childElements(note, 'rest').length > 0) return null;
  if (childElements(note, 'cue').length > 0 || childElements(note, 'unpitched').length > 0) return null;
  if (childText(note, 'notehead') === 'x') return null;
  if (continuesTie(note)) return null;
  const technical = technicalOf(note);
  const string = technical ? numberText(technical, 'string') : null;
  const fret = technical ? numberText(technical, 'fret') : null;
  if (!technical || string === null || fret === null) {
    notices.inBar(NO_STRING_FRET, bar);
    return null;
  }
  if (childElements(technical, 'harmonic').length > 0) {
    notices.inBar(HARMONIC, bar);
    return null;
  }
  if (string < 1 || string > 6) {
    notices.inBar(BAD_STRING, bar);
    return null;
  }
  if (fret > 24) {
    notices.inBar(HIGH_FRET, bar);
    return null;
  }
  const written = writtenPitch(note);
  const result: TabNote = { time, slot: 0, string: string - 1, fret, measure };
  if (written !== null) result.pitch = written + shift;
  return result;
}

/** Walks the part's measures with one cursor (spec §5.5 "Time"). */
function readTime(part: Element, ctx: Context): { measures: TabMeasure[]; notes: TabNote[] } {
  const measures: TabMeasure[] = [];
  const notes: TabNote[] = [];
  let start = 0;
  let divisions = 1;
  let quarters = 4;
  /** Semitones from written to sounding pitch on the tab staff. */
  let shift = 0;
  childElements(part, 'measure').forEach((measure, index) => {
    const number = measure.getAttribute('number') || String(index + 1);
    let cursor = start;
    let reached = start;
    let lastStart = start;
    /** Per voice: grace columns waiting for the note they precede, and the time of the last note. */
    const pending = new Map<string, TabNote[][]>();
    const lastTime = new Map<string, number>();
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
          for (const t of childElements(el, 'transpose')) {
            if (hasNumber(t) && staffOf(t) !== ctx.staff) continue;
            shift = Math.round(numberText(t, 'chromatic') ?? 0) + 12 * Math.round(numberText(t, 'octave-change') ?? 0);
          }
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
            const note = tabNote(el, at, index, number, shift, ctx.notices);
            const voice = childText(el, 'voice') ?? '1';
            if (childElements(el, 'grace').length > 0) {
              const groups = pending.get(voice) ?? [];
              pending.set(voice, groups);
              if (note) {
                if (childElements(el, 'chord').length > 0 && groups.length > 0) groups[groups.length - 1].push(note);
                else groups.push([note]);
              }
            } else {
              const groups = pending.get(voice) ?? [];
              groups.forEach((group, i) =>
                group.forEach((g) => notes.push({ ...g, time: at, slot: i - groups.length })),
              );
              pending.delete(voice);
              lastTime.set(voice, at);
              if (note) notes.push(note);
            }
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
    for (const [voice, groups] of pending) {
      groups.forEach((group, i) =>
        group.forEach((g) => notes.push({ ...g, time: lastTime.get(voice) ?? start, slot: i + 1 })),
      );
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

/** Two notes on one string in one column: the same fret merges silently, otherwise the first stays and the bar gets a notice. */
function dropClashes(notes: TabNote[], measures: TabMeasure[], notices: Notices): TabNote[] {
  const seen = new Map<string, TabNote>();
  const clashed = new Set<string>();
  const kept: TabNote[] = [];
  for (const note of notes) {
    const column = `${note.time}:${note.slot}`;
    const key = `${column}:${note.string}`;
    const first = seen.get(key);
    if (!first) {
      seen.set(key, note);
      kept.push(note);
    } else if (first.fret !== note.fret && !clashed.has(column)) {
      clashed.add(column);
      notices.inBar(CLASH, measures[note.measure].number);
    }
  }
  return kept;
}

// ---- Capo ----

const PITCH_CHECK: BarWording = (_count, bars) =>
  `The written pitches don't match the tab's tuning and frets in ${bars}; check the tuning and capo.`;

/** The capo the score names (spec §5.5 "Tuning, capo and the pitch check"); 0 when none, or when it is out of range. */
function findCapo(root: Element, tab: TabStaff, notices: Notices): number {
  const declared = tab.details ? numberText(tab.details, 'capo') : null;
  let capo = 0;
  if (declared !== null && declared > 0) {
    capo = Math.round(declared);
  } else {
    const found: number[] = [];
    const take = (text: string): void => {
      const value = capoFromText(text);
      if (value !== null) found.push(value);
    };
    for (const el of childElements(root)) {
      if (el.nodeName === 'credit') {
        for (const w of Array.from(el.getElementsByTagName('credit-words'))) take(w.textContent ?? '');
      } else if (el.nodeName === 'part') {
        for (const measure of childElements(el, 'measure')) {
          for (const direction of childElements(measure, 'direction')) {
            const words = Array.from(direction.getElementsByTagName('words')).map((w) => (w.textContent ?? '').trim());
            if (words.length > 0) take(words.join(' '));
          }
        }
      }
    }
    if (found.length === 0) return 0;
    capo = found[0];
    if (found.some((v) => v !== capo)) notices.add(`The score names more than one capo; used capo ${capo}.`);
  }
  if (capo > 12) {
    notices.add(`The score says capo ${capo}, which is more than 12; set the capo yourself.`);
    return 0;
  }
  return capo;
}

/** A later clef, tuning or capo that differs from the first (the first one is used): notice naming the first such bar. */
function laterChanges(tab: TabStaff, notices: Notices): void {
  const tuningOf = (d: Element): string =>
    childElements(d, 'staff-tuning')
      .map((s) => `${s.getAttribute('line')}:${tuningMidi(s)}`)
      .join(',');
  const baseTuning = tab.details ? tuningOf(tab.details) : '';
  const baseCapo = (tab.details ? numberText(tab.details, 'capo') : null) ?? 0;
  for (const [index, measure] of childElements(tab.part, 'measure').entries()) {
    for (const attrs of childElements(measure, 'attributes')) {
      const clef = childElements(attrs, 'clef').find((c) => staffOf(c) === tab.staff);
      const details = childElements(attrs, 'staff-details').find((d) => !hasNumber(d) || staffOf(d) === tab.staff);
      const capo = details ? numberText(details, 'capo') : null;
      const tuning = details ? tuningOf(details) : '';
      const changed =
        (clef !== undefined && childText(clef, 'sign') !== 'TAB') ||
        (tuning !== '' && tuning !== baseTuning) ||
        (capo !== null && capo !== baseCapo);
      if (changed) {
        const bar = measure.getAttribute('number') || String(index + 1);
        notices.add(`The tab's tuning or capo changes in bar ${bar}; the first one was used.`);
        return;
      }
    }
  }
}

// ---- Tuning from the notes, pitch check ----

/** Most common value; ties go to the one `rank` scores lowest. */
function mostCommon(values: number[], rank: (v: number) => number): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || rank(a[0]) - rank(b[0]))[0][0];
}

/** Each string's open pitch = the most common sounding pitch − fret over its notes; strings without pitched notes stay standard. */
function tuningFromNotes(notes: TabNote[]): number[] {
  return STANDARD_TUNING.map((standard, string) => {
    const values = notes.filter((n) => n.string === string).map((n) => (n.pitch as number) - n.fret);
    return values.length === 0 ? standard : mostCommon(values, (v) => Math.abs(v - standard));
  });
}

/** d = sounding pitch − (open string + fret); expected 0 or the capo for most notes, otherwise one notice naming the bars off both. */
function pitchCheck(notes: TabNote[], tuning: number[], capo: number, measures: TabMeasure[], notices: Notices): void {
  const diffs = notes.map((n) => ({ n, d: (n.pitch as number) - (tuning[n.string] + n.fret) }));
  if (diffs.length === 0) return;
  const common = mostCommon(
    diffs.map((x) => x.d),
    (d) => (d === 0 ? 0 : d === capo ? 1 : 2 + Math.abs(d)),
  );
  if (common === 0 || common === capo) return;
  for (const { n, d } of diffs) {
    if (d !== 0 && d !== capo) notices.inBar(PITCH_CHECK, measures[n.measure].number);
  }
}

// ---- Layout marks and repeats ----

/** Per measure: does a `<print>` start a new system or page? */
function printMarks(part: Element): boolean[] {
  return childElements(part, 'measure').map((m) =>
    childElements(m, 'print').some((p) => p.getAttribute('new-system') === 'yes' || p.getAttribute('new-page') === 'yes'),
  );
}

/** Read from the tab part, else from the first part, where exporters usually put layout. */
function layoutMarks(root: Element, tabPart: Element): boolean[] {
  const own = printMarks(tabPart);
  if (own.some(Boolean)) return own;
  const first = childElements(root, 'part')[0];
  return first ? printMarks(first) : own;
}

function hasRepeats(root: Element): boolean {
  if (['repeat', 'ending', 'segno', 'coda'].some((name) => root.getElementsByTagName(name).length > 0)) return true;
  return Array.from(root.getElementsByTagName('sound')).some((s) =>
    ['dacapo', 'dalsegno', 'tocoda', 'fine'].some((a) => s.hasAttribute(a)),
  );
}

const REPEATS =
  'This score has repeats or D.C./D.S. marks; they are not followed: the music plays straight through as written, with first and second endings one after the other.';

export function readMusicXml(doc: Document): TabScore {
  const root = doc.documentElement;
  const notices = new Notices();
  const tab = findTabStaff(root, notices);
  let tuning = readTuning(tab.details);
  const unit = partUnit(tab.part);
  const { measures, notes } = readTime(tab.part, { unit, staff: tab.staff, notices });
  snap(notes, unit);
  const kept = dropClashes(notes, measures, notices);
  kept.sort((a, b) => a.time - b.time || a.slot - b.slot || a.string - b.string);
  const capo = findCapo(root, tab, notices);
  laterChanges(tab, notices);
  const pitched = kept.filter((n) => n.pitch !== undefined);
  if (!tab.details || childElements(tab.details, 'staff-tuning').length === 0) {
    if (pitched.length === 0) {
      notices.add('The tab has no tuning; standard tuning was used.');
    } else {
      tuning = tuningFromNotes(pitched);
      notices.add(
        'The tab has no tuning, so it was worked out from the notes.' +
          (capo > 0
            ? ` The written pitches may already include the capo, so the tuning could be ${capo} ${capo === 1 ? 'semitone' : 'semitones'} high.`
            : ''),
      );
    }
  }
  pitchCheck(pitched, tuning, capo, measures, notices);
  layoutMarks(root, tab.part).forEach((mark, i) => {
    if (measures[i]) measures[i].newBlock = mark;
  });
  if (hasRepeats(root)) notices.add(REPEATS);
  return { unit, tuning, capo, measures, notes: kept, notices: notices.list() };
}
