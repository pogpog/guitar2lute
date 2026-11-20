import type { Midi, Placement, Tuning } from '../model';

export interface Limits { tuning: Tuning; maxFret: number; maxStretch: number; }

export interface NoteOption { placement: Placement; shifted: number; pinned: boolean; }

export interface SolvedNote {
  srcIndex: number;
  /** sounding pitch, including octave shift */
  pitch: Midi;
  shifted: number;
  placement: Placement;
  pinned: boolean;
}

export interface ColumnCandidate {
  notes: SolvedNote[];
  dropped: { srcIndex: number; pitch: Midi }[];
  cost: number;
  /** lowest stopped fret, or null when everything is open */
  hand: number | null;
  /** lowest sounding note */
  bass: { course: number; pitch: Midi } | null;
  /** deterministic tie-break key: "course:fret" per note in srcIndex order */
  key: string;
}

export interface ColumnSolution { candidates: ColumnCandidate[]; badPins: number[]; }
