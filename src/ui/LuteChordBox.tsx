import type { LuteChord, LuteNote, Notation, Tuning } from '../core/model';
import { diapasonLabel, fretGlyph } from '../core/notation';
import { midiToName, prettyName } from '../core/pitch';

const LEFT = 18;
const TOP = 34;
const SG = 17;
const FG = 22;
const DIAP_W = 26;

export interface LuteChordBoxProps {
  chord: LuteChord;
  tuning: Tuning;
  notation: Notation;
  flats: boolean;
  onCycle: (noteIndex: number) => void;
  onVoicing: (delta: -1 | 1) => void;
  onPlay: () => void;
}

export function LuteChordBox({ chord, tuning, notation, flats, onCycle, onVoicing, onPlay }: LuteChordBoxProps) {
  // A clicked (pinned) chord has a single voicing; ◀/▶ stay enabled because choosing a voicing clears the pins.
  const pinned = chord.voicings[chord.chosen]?.notes.some((n) => n.pinned) ?? false;
  const v = chord.voicings[chord.chosen];
  const controls = (
    <div className="box-controls">
      <button type="button" aria-label="Previous voicing" disabled={!pinned && chord.chosen <= 0} onClick={() => onVoicing(-1)}>◀</button>
      <span>{`${chord.voicings.length ? chord.chosen + 1 : 0}/${chord.voicings.length}`}</span>
      <button type="button" aria-label="Next voicing" disabled={!pinned && chord.chosen >= chord.voicings.length - 1} onClick={() => onVoicing(1)}>▶</button>
      <button type="button" className="play-chord" aria-label="Play chord" onClick={onPlay}>♪ Play</button>
    </div>
  );
  if (!v) {
    return (
      <figure className="chordbox lute" data-testid="lute-chordbox">
        <div className="chord-title">{chord.name ? prettyName(chord.name) : '—'}</div>
        <p className="muted">No playable voicing</p>
        {controls}
      </figure>
    );
  }
  const lines = Math.min(tuning.frettedCourses, tuning.courses.length);
  const onBoard = v.notes.filter((n) => n.placement.course < lines);
  const diapasons = v.notes.filter((n) => n.placement.course >= lines).sort((a, b) => a.placement.course - b.placement.course);
  const stopped = onBoard.filter((n) => n.placement.fret > 0).map((n) => n.placement.fret);
  const maxF = stopped.length ? Math.max(...stopped) : 0;
  const base = maxF > 5 ? Math.min(...stopped) : 1;
  const rows = Math.max(4, maxF - base + 1);
  const xOf = (c: number) => LEFT + (lines - 1 - c) * SG;
  const yOf = (i: number) => TOP + i * FG;
  const gridBottom = yOf(rows);
  // modern labels carry the course number ("13:0"), so they need more room
  const diapW = notation === 'modern' ? DIAP_W + 8 : DIAP_W;
  const width = Math.max(LEFT * 2 + (lines - 1) * SG, LEFT + diapasons.length * diapW);
  const height = gridBottom + (diapasons.length ? 26 : 8);
  const played = new Set(v.notes.map((n) => n.placement.course));
  const cls = (n: LuteNote, base: string) => `${base}${n.shifted ? ' shifted' : ''}${n.pinned ? ' pinned' : ''}`;
  const names = [...v.notes].sort((a, b) => a.pitch - b.pitch).map((n) => prettyName(midiToName(n.pitch, flats, false))).join(' ');

  return (
    <figure className="chordbox lute" data-testid="lute-chordbox">
      <div className="chord-title">{chord.name ? prettyName(chord.name) : '—'}</div>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="chordbox-svg">
        {base === 1 ? (
          <rect x={xOf(lines - 1)} y={TOP - 3} width={xOf(0) - xOf(lines - 1)} height={4} fill="currentColor" />
        ) : (
          <text x={2} y={TOP + FG / 2 + 4} fontSize={11} fill="currentColor">{base}</text>
        )}
        {Array.from({ length: rows + 1 }, (_, i) => (
          <line key={`f${i}`} x1={xOf(lines - 1)} x2={xOf(0)} y1={yOf(i)} y2={yOf(i)} stroke="currentColor" strokeWidth={1} />
        ))}
        {Array.from({ length: lines }, (_, c) => (
          <line key={`c${c}`} x1={xOf(c)} x2={xOf(c)} y1={yOf(0)} y2={gridBottom} stroke="currentColor" strokeWidth={1} />
        ))}
        {Array.from({ length: lines }, (_, c) =>
          played.has(c) ? null : (
            <text key={`m${c}`} x={xOf(c)} y={TOP - 8} textAnchor="middle" fontSize={12} fill="currentColor">×</text>
          ),
        )}
        {onBoard.map((n) =>
          n.placement.fret === 0 ? (
            <circle
              key={`n${n.srcNoteIndex}`}
              data-testid={`lute-note-${n.srcNoteIndex}`}
              className={cls(n, 'lute-dot open')}
              cx={xOf(n.placement.course)}
              cy={TOP - 13}
              r={5}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              onClick={() => onCycle(n.srcNoteIndex)}
            />
          ) : (
            <g key={`n${n.srcNoteIndex}`} data-testid={`lute-note-${n.srcNoteIndex}`} className={cls(n, 'lute-dot')} onClick={() => onCycle(n.srcNoteIndex)}>
              <circle cx={xOf(n.placement.course)} cy={yOf(n.placement.fret - base) + FG / 2} r={7.5} fill="currentColor" />
              <text className="dot-text" x={xOf(n.placement.course)} y={yOf(n.placement.fret - base) + FG / 2 + 4} textAnchor="middle" fontSize={10} fill="#ffffff">
                {fretGlyph(n.placement.fret, notation)}
              </text>
            </g>
          ),
        )}
        {diapasons.map((n, i) => (
          <text
            key={`d${n.srcNoteIndex}`}
            data-testid={`lute-note-${n.srcNoteIndex}`}
            className={cls(n, 'lute-dot diapason')}
            x={LEFT + i * diapW}
            y={gridBottom + 18}
            fontSize={12}
            fill="currentColor"
            onClick={() => onCycle(n.srcNoteIndex)}
          >
            {diapasonLabel(n.placement.course, n.placement.fret, notation)}
          </text>
        ))}
      </svg>
      <figcaption className="notes">{names || '—'}</figcaption>
      {v.dropped.length > 0 && (
        <div className="warn-inline">{`Dropped: ${v.dropped.map((p) => prettyName(midiToName(p, flats, false))).join(' ')}`}</div>
      )}
      {controls}
    </figure>
  );
}
