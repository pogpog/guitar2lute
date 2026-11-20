export type Midi = number;

export interface Tuning {
  id: string;
  name: string;
  /** index 0 = course/string 1 = highest */
  courses: Midi[];
  /** courses with index >= this are open-only (diapasons) */
  frettedCourses: number;
}

/** fret number (0 = open), 'x' = muted, null = unset */
export type StringState = number | 'x' | null;

export interface ChordShape {
  name: string;
  /** per guitar string, index 0 = high e */
  frets: StringState[];
  /** first fret shown in the diagram (1 = nut) */
  baseFret: number;
}

export interface TabNote { string: number; fret: number; }
export interface TabColumn { notes: TabNote[]; x: number; src?: { line: number; col: number }; }
export type TabEvent =
  | { kind: 'col'; col: TabColumn }
  /** x: where the barline was in the source, on the same scale as TabColumn.x (absent in pieces imported before it was recorded) */
  | { kind: 'bar'; x?: number }
  /** next: where the next block's lines begin in the source, on the same scale as TabColumn.x */
  | { kind: 'break'; next?: number };

export interface Placement { course: number; fret: number; }

export type Notation = 'french' | 'italian' | 'modern';

export interface LuteSettings {
  tuning: Tuning;
  transpose: number;
  maxFret: number;
  maxStretch: number;
  notation: Notation;
}

export interface Overrides {
  chordVoicing: Record<number, number>;
  chordPins: Record<number, Record<number, Placement>>;
  tabPins: Record<number, Record<number, Placement>>;
}

export const SCHEMA_VERSION = 1 as const;

export interface Piece {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  title: string;
  updatedAt: string;
  guitar: {
    tuning: Tuning;
    capo: number;
    chords: ChordShape[];
    tab: TabEvent[];
    sourceText?: string;
  };
  lute: LuteSettings;
  overrides: Overrides;
}

export type WarningKind = 'parse' | 'pdf' | 'shift' | 'inversion' | 'drop' | 'pin';

export interface Warning {
  kind: WarningKind;
  message: string;
  /** 1-based source text line */
  line?: number;
  /** 1-based source text column */
  textColumn?: number;
  /** 0-based tab column index */
  tabColumn?: number;
  /** 0-based chord index */
  chord?: number;
}

export interface LuteNote {
  placement: Placement;
  /** sounding pitch (input pitch + transpose + shifted) */
  pitch: Midi;
  /** octave shift applied: 0, ±12, ±24 */
  shifted: number;
  pinned: boolean;
  /** index of the note in the guitar input (chord sounding strings / tab column notes) */
  srcNoteIndex: number;
}

export interface LuteVoicing { notes: LuteNote[]; dropped: Midi[]; cost: number; }
export interface LuteChord { name: string; voicings: LuteVoicing[]; chosen: number; }
export interface LuteColumn { kind: 'col'; index: number; x: number; notes: LuteNote[]; dropped: Midi[]; }
export type LuteTabEvent = LuteColumn | { kind: 'bar' } | { kind: 'break' };

export interface LuteResult {
  chords: LuteChord[];
  tab: LuteTabEvent[];
  warnings: Warning[];
  totalCost: number;
  stats: { shifted: number; dropped: number };
  flats: boolean;
}

export function emptyOverrides(): Overrides {
  return { chordVoicing: {}, chordPins: {}, tabPins: {} };
}
