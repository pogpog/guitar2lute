import type { ChordShape, Tuning } from '../core/model';
import { chordPitches } from '../core/piece';
import { detectChordName } from '../core/chordName';
import { midiToName, prettyName } from '../core/pitch';
import { cycleOpen, shiftBaseFret, toggleFret } from '../core/edit';

const LEFT = 21;
const TOP = 34;
const SG = 18;
const FG = 22;
const FRETS = 5;

export interface GuitarChordBoxProps {
  shape: ChordShape;
  tuning: Tuning;
  capo: number;
  flats: boolean;
  onChange: (s: ChordShape) => void;
  onPlay: () => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}

export function GuitarChordBox({ shape, tuning, capo, flats, onChange, onPlay, onRemove, onMove }: GuitarChordBoxProps) {
  const n = tuning.courses.length;
  const W = LEFT * 2 + (n - 1) * SG;
  const H = TOP + FRETS * FG + 8;
  const xOf = (s: number) => LEFT + (n - 1 - s) * SG;
  const yOf = (i: number) => TOP + i * FG;
  const pitches = chordPitches(shape, tuning, capo).map((p) => p.pitch);
  const detected = detectChordName(pitches, flats);
  const names = [...pitches].reverse().map((p) => prettyName(midiToName(p, flats, false))).join(' ');
  const strings = Array.from({ length: n }, (_, s) => s);
  const rows = Array.from({ length: FRETS }, (_, i) => i);
  return (
    <figure className="chordbox" data-testid="guitar-chordbox">
      <input
        className="chord-name"
        aria-label="Chord name"
        value={shape.name}
        placeholder={detected ? prettyName(detected) : 'Name'}
        onChange={(e) => onChange({ ...shape, name: e.target.value })}
      />
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="chordbox-svg">
        {shape.baseFret === 1 ? (
          <rect x={xOf(n - 1)} y={TOP - 3} width={xOf(0) - xOf(n - 1)} height={4} fill="currentColor" />
        ) : (
          <text className="base-fret" x={2} y={TOP + FG / 2 + 4} fontSize={11} fill="currentColor">{shape.baseFret}</text>
        )}
        {Array.from({ length: FRETS + 1 }, (_, i) => (
          <line key={`f${i}`} x1={xOf(n - 1)} x2={xOf(0)} y1={yOf(i)} y2={yOf(i)} stroke="currentColor" strokeWidth={1} />
        ))}
        {strings.map((s) => (
          <line key={`s${s}`} x1={xOf(s)} x2={xOf(s)} y1={yOf(0)} y2={yOf(FRETS)} stroke="currentColor" strokeWidth={1} />
        ))}
        {strings.map((s) => {
          const st = shape.frets[s];
          return (
            <g key={`o${s}`}>
              {st === 0 && <circle cx={xOf(s)} cy={TOP - 13} r={5} fill="none" stroke="currentColor" strokeWidth={1.5} />}
              {st === 'x' && <text x={xOf(s)} y={TOP - 8} textAnchor="middle" fontSize={13} fill="currentColor">×</text>}
              <rect
                className="hit"
                data-testid={`open-${s}`}
                x={xOf(s) - SG / 2}
                y={TOP - 24}
                width={SG}
                height={20}
                fill="transparent"
                onClick={() => onChange(cycleOpen(shape, s))}
              />
            </g>
          );
        })}
        {strings.map((s) =>
          rows.map((i) => {
            const fret = shape.baseFret + i;
            return (
              <rect
                key={`c${s}-${i}`}
                className="hit"
                data-testid={`cell-${s}-${fret}`}
                x={xOf(s) - SG / 2}
                y={yOf(i)}
                width={SG}
                height={FG}
                fill="transparent"
                onClick={() => onChange(toggleFret(shape, s, fret))}
              />
            );
          }),
        )}
        {strings.map((s) => {
          const f = shape.frets[s];
          if (typeof f !== 'number' || f === 0 || f < shape.baseFret || f >= shape.baseFret + FRETS) return null;
          return <circle key={`d${s}`} className="dot" cx={xOf(s)} cy={yOf(f - shape.baseFret) + FG / 2} r={6.5} fill="currentColor" pointerEvents="none" />;
        })}
      </svg>
      <figcaption className="notes">{names || '—'}</figcaption>
      <div className="box-controls">
        <button type="button" className="play-chord" aria-label="Play chord" onClick={onPlay}>♪ Play</button>
      </div>
      <div className="box-controls">
        <button type="button" aria-label="Show lower frets" onClick={() => onChange(shiftBaseFret(shape, -1))}>▲</button>
        <button type="button" aria-label="Show higher frets" onClick={() => onChange(shiftBaseFret(shape, 1))}>▼</button>
        <button type="button" aria-label="Move chord left" onClick={() => onMove(-1)}>◀</button>
        <button type="button" aria-label="Move chord right" onClick={() => onMove(1)}>▶</button>
        <button type="button" aria-label="Delete chord" onClick={onRemove}>✕</button>
      </div>
    </figure>
  );
}
