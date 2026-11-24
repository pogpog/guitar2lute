import { useEffect, useRef, useState } from 'react';
import type { Midi, Tuning } from '../core/model';
import { tuneGroups, type TuneCourse } from '../core/tunings';
import { midiToFreq } from '../audio/pluck';
import { holdWakeLock } from './wakeLock';

/** Plays and stops the tuning aid's note, at the side's pitch standard. */
export interface Tuner {
  /** play open note `m`; `onEnd` runs once, when the note finishes or is stopped */
  play(m: Midi, onEnd: () => void): void;
  /** stop the tuning note only */
  stop(): void;
}

export const tuneButtonText = (c: TuneCourse, a4: number): string =>
  `${c.course} ${c.name} · ${midiToFreq(c.midi, a4).toFixed(1)} Hz`;

export interface TunePanelProps {
  tuning: Tuning;
  a4: number;
  instrument: 'lute' | 'guitar';
  tuner: Tuner;
  onClose: () => void;
}

/** One large button per open course; the course sounding stays lit until its note ends. */
export function TunePanel({ tuning, a4, instrument, tuner, onClose }: TunePanelProps) {
  const [lit, setLit] = useState<number | null>(null);
  const tunerRef = useRef(tuner);
  tunerRef.current = tuner;
  // only on mount and unmount: the parent passes a new tuner object on every render
  useEffect(() => {
    const release = holdWakeLock(navigator, document);
    return () => {
      release();
      tunerRef.current.stop();
    };
  }, []);

  const tap = (c: TuneCourse) => {
    tuner.play(c.midi, () => setLit((l) => (l === c.course ? null : l)));
    setLit(c.course);
  };

  return (
    <div className="tune-panel" data-testid="tune-panel">
      {tuneGroups(tuning, instrument).map((g) => (
        <div key={g.label}>
          <h3 className="tune-group-label">{g.label}</h3>
          <div className="tune-buttons">
            {g.courses.map((c) => (
              <button
                key={c.course}
                type="button"
                className="tune-course"
                data-testid={`tune-course-${c.course}`}
                aria-pressed={lit === c.course}
                onClick={() => tap(c)}
              >
                {tuneButtonText(c, a4)}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="row end">
        <button type="button" data-testid="tune-close" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
