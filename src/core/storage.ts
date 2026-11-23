import type { Piece, TabEvent } from './model';
import { SCHEMA_VERSION } from './model';
import { newId } from './piece';
import { parseAsciiTab } from './parse/asciiTab';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  readonly length: number;
  key(index: number): string | null;
}

export interface PieceMeta { id: string; title: string; updatedAt: string; }

export class MemoryStorage implements StorageLike {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  get length(): number {
    return this.map.size;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
}

export function browserStorage(): StorageLike {
  try {
    const ls = window.localStorage;
    ls.getItem('g2l:probe');
    return ls;
  } catch {
    return new MemoryStorage();
  }
}

const INDEX_KEY = 'g2l:index';
const PIECE_PREFIX = 'g2l:piece:';
/** A piece's contents without what an imported copy changes: its id, and the "(imported)" added to its title. */
const contentKey = (p: Piece) => JSON.stringify({ ...p, id: '', title: p.title.replace(/(?: \(imported\))+$/, '') });
const pieceKey = (id: string) => `${PIECE_PREFIX}${id}`;

function newerVersionError(v: number): Error {
  return new Error(`This file was made by a newer version of the app (schema ${v}).`);
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);
/** an integer in [lo, hi]: the ranges the app's own controls can produce */
const inRange = (v: unknown, lo: number, hi: number): v is number => isInt(v) && v >= lo && v <= hi;
const MAX_GUITAR_FRET = 24;
const isStringState = (v: unknown) => v === null || v === 'x' || inRange(v, 0, MAX_GUITAR_FRET);
const isPlacement = (v: unknown) => isObj(v) && isInt(v.course) && isInt(v.fret);
const isTuning = (v: unknown) =>
  isObj(v) && typeof v.id === 'string' && typeof v.name === 'string' &&
  Array.isArray(v.courses) && v.courses.length > 0 && v.courses.every((m) => inRange(m, 0, 127)) &&
  inRange(v.frettedCourses, 1, v.courses.length);
const isEvent = (v: unknown) =>
  isObj(v) &&
  (v.kind === 'bar' || v.kind === 'break' ||
    (v.kind === 'col' && isObj(v.col) && typeof v.col.x === 'number' && Array.isArray(v.col.notes) &&
      v.col.notes.every((n) => isObj(n) && inRange(n.string, 0, 5) && inRange(n.fret, 0, MAX_GUITAR_FRET))));
const isChord = (v: unknown) =>
  isObj(v) && typeof v.name === 'string' && inRange(v.baseFret, 1, 15) && Array.isArray(v.frets) && v.frets.length === 6 && v.frets.every(isStringState);
const isRecordOf = (v: unknown, ok: (x: unknown) => boolean) => isObj(v) && Object.values(v).every(ok);

/** Checks the whole structure, so data that parses but has the wrong shape never reaches the converter. */
function invalidField(r: Obj): string | null {
  if (typeof r.id !== 'string') return 'id';
  if (typeof r.title !== 'string') return 'title';
  const g = r.guitar;
  if (!isObj(g)) return 'guitar';
  if (!isTuning(g.tuning) || (g.tuning as Obj & { courses: unknown[] }).courses.length !== 6) return 'guitar.tuning';
  if (!inRange(g.capo, 0, 12)) return 'guitar.capo';
  if (!Array.isArray(g.chords) || !g.chords.every(isChord)) return 'guitar.chords';
  if (!Array.isArray(g.tab) || !g.tab.every(isEvent)) return 'guitar.tab';
  if (g.sourceText !== undefined && typeof g.sourceText !== 'string') return 'guitar.sourceText';
  const l = r.lute;
  if (!isObj(l)) return 'lute';
  if (!isTuning(l.tuning)) return 'lute.tuning';
  const ranges: [string, number, number][] = [['transpose', -12, 12], ['maxFret', 4, 12], ['maxStretch', 2, 6]];
  for (const [k, lo, hi] of ranges) if (!inRange(l[k], lo, hi)) return `lute.${k}`;
  if (!['french', 'italian', 'modern'].includes(l.notation as string)) return 'lute.notation';
  const o = r.overrides;
  if (!isObj(o)) return 'overrides';
  if (!isRecordOf(o.chordVoicing, isInt)) return 'overrides.chordVoicing';
  if (!isRecordOf(o.chordPins, (x) => isRecordOf(x, isPlacement))) return 'overrides.chordPins';
  if (!isRecordOf(o.tabPins, (x) => isRecordOf(x, isPlacement))) return 'overrides.tabPins';
  return null;
}

/** Validate and upgrade stored/imported data. Add migration steps here when SCHEMA_VERSION increases. */
export function migrate(raw: unknown): Piece {
  if (!isObj(raw)) throw new Error('Not a piece file.');
  const v = raw.schemaVersion;
  if (typeof v === 'number' && v > SCHEMA_VERSION) throw newerVersionError(v);
  if (v !== SCHEMA_VERSION) throw new Error('Missing or unknown schemaVersion.');
  const bad = invalidField(raw);
  if (bad) throw new Error(`Invalid piece (${bad}).`);
  return retimeTab(raw as unknown as Piece);
}

const notesKey = (events: TabEvent[]): string =>
  JSON.stringify(events.flatMap((e) => (e.kind === 'col' ? [e.col.notes.map((n) => [n.string, n.fret])] : [])));

/**
 * Re-read the tab from its source text, so pieces saved by an older parser get its current timing
 * (e.g. no gap at line breaks). Only when the notes come out identical, so lute pins (keyed by
 * column) stay on the same notes; otherwise the stored tab is kept.
 */
function retimeTab(p: Piece): Piece {
  const text = p.guitar.sourceText;
  if (!text) return p;
  const events = parseAsciiTab(text).events;
  if (notesKey(events) !== notesKey(p.guitar.tab)) return p;
  return { ...p, guitar: { ...p.guitar, tab: events } };
}

export class PieceStore {
  constructor(private readonly storage: StorageLike) {}

  /**
   * Most recent first. Index entries are coerced to strings and de-duplicated, and pieces whose
   * keys exist but are missing from the index (corrupt index, interrupted save) are added back.
   */
  list(): PieceMeta[] {
    const out: PieceMeta[] = [];
    const seen = new Set<string>();
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    for (const m of this.readIndex()) {
      if (!m || typeof m !== 'object' || typeof (m as PieceMeta).id !== 'string' || seen.has((m as PieceMeta).id)) continue;
      const e = m as Record<string, unknown>;
      seen.add(e.id as string);
      out.push({ id: e.id as string, title: str(e.title), updatedAt: str(e.updatedAt) });
    }
    const lost: PieceMeta[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const k = this.storage.key(i);
      if (!k || !k.startsWith(PIECE_PREFIX)) continue;
      const id = k.slice(PIECE_PREFIX.length);
      if (seen.has(id)) continue;
      seen.add(id);
      let title = '';
      let updatedAt = '';
      try {
        const d = JSON.parse(this.storage.getItem(k) ?? '') as Record<string, unknown>;
        title = str(d?.title);
        updatedAt = str(d?.updatedAt);
      } catch {
        /* listed anyway, so the user sees it and gets the error when opening it */
      }
      lost.push({ id, title, updatedAt });
    }
    lost.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
    return [...out, ...lost];
  }

  private readIndex(): unknown[] {
    try {
      const v: unknown = JSON.parse(this.storage.getItem(INDEX_KEY) ?? '[]');
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }

  load(id: string): Piece | null {
    const text = this.storage.getItem(pieceKey(id));
    return text === null ? null : migrate(JSON.parse(text));
  }

  save(p: Piece): void {
    this.storage.setItem(pieceKey(p.id), JSON.stringify(p));
    const list = this.list().filter((m) => m.id !== p.id);
    list.unshift({ id: p.id, title: p.title, updatedAt: p.updatedAt });
    this.storage.setItem(INDEX_KEY, JSON.stringify(list));
  }

  has(id: string): boolean {
    return this.storage.getItem(pieceKey(id)) !== null;
  }

  /** Content keys of every readable saved piece (see `contentKey`). */
  private savedContent(): Set<string> {
    const keys = new Set<string>();
    for (const m of this.list()) {
      try {
        keys.add(contentKey(JSON.parse(this.storage.getItem(pieceKey(m.id)) ?? '') as Piece));
      } catch {
        /* unreadable pieces can't match anything */
      }
    }
    return keys;
  }

  /** The incoming pieces that already exist here: same contents and title under any id, including an earlier "(imported)" copy. */
  duplicatesOf(pieces: Piece[]): Piece[] {
    const saved = this.savedContent();
    const seen = new Set<string>();
    return pieces.filter((p) => {
      const k = contentKey(p);
      if (seen.has(k) || !saved.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  /**
   * Saves imported pieces without ever overwriting a saved piece: a piece whose id is already taken (by an
   * edited original, or by one this version cannot read) arrives as a copy with a new id and "(imported)" in
   * its title. A piece that already exists (see `duplicatesOf`) is skipped unless `again` is set, in which
   * case it is imported as another copy. Repeats within one import are skipped.
   * Returns the pieces as saved, in import order.
   */
  addImported(pieces: Piece[], { again = false }: { again?: boolean } = {}): Piece[] {
    const out: Piece[] = [];
    const saved = this.savedContent();
    const seen = new Set<string>();
    const asCopy = (p: Piece): Piece => ({ ...p, id: newId(), title: `${p.title || 'Untitled'} (imported)` });
    for (const p of pieces) {
      const k = contentKey(p);
      if (seen.has(k)) continue;
      seen.add(k);
      const exists = saved.has(k);
      if (exists && !again) continue;
      const q = exists || this.has(p.id) ? asCopy(p) : p;
      this.save(q);
      out.push(q);
    }
    return out;
  }

  remove(id: string): void {
    this.storage.removeItem(pieceKey(id));
    this.storage.setItem(INDEX_KEY, JSON.stringify(this.list().filter((m) => m.id !== id)));
  }
}

export function exportPieces(pieces: Piece[]): string {
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, pieces }, null, 2);
}

export function importPieces(text: string): Piece[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Not valid JSON.');
  }
  const d = data as { schemaVersion?: unknown; pieces?: unknown } | null;
  if (d && Array.isArray(d.pieces)) {
    if (typeof d.schemaVersion === 'number' && d.schemaVersion > SCHEMA_VERSION) throw newerVersionError(d.schemaVersion);
    return d.pieces.map(migrate);
  }
  return [migrate(data)];
}
