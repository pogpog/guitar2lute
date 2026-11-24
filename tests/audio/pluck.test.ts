import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { midiToFreq, karplusStrong, stepsFromColumns, playbackRateFor, Player } from '../../src/audio/pluck';

const rms = (a: Float32Array) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);

describe('pluck synthesis', () => {
  it('converts MIDI to frequency', () => {
    expect(midiToFreq(69)).toBeCloseTo(440);
    expect(midiToFreq(57)).toBeCloseTo(220);
  });
  it('produces a decaying, deterministic buffer', () => {
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const buf = karplusStrong(220, 8000, 1, 0.996, rand);
    expect(buf.length).toBe(8000);
    expect(rms(buf.subarray(0, 800))).toBeGreaterThan(0.05);
    expect(rms(buf.subarray(7200))).toBeLessThan(rms(buf.subarray(0, 800)));
  });
});

describe('stepsFromColumns', () => {
  it('spaces steps by x offset and keeps them strictly increasing', () => {
    const steps = stepsFromColumns([
      { x: 2, pitches: [60], index: 0 },
      { x: 5, pitches: [62], index: 1 },
      { x: 5, pitches: [64], index: 2 },
    ], 100);
    expect(steps.map((s) => s.time)).toEqual([0, 0.3, 0.4]);
    expect(steps.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(stepsFromColumns([], 100)).toEqual([]);
  });
});

describe('Player', () => {
  /** what each source the player made was given, and whether it was stopped */
  type Src = { when: number | null; stopped: boolean; length: number; rate: number; ended: () => void };
  let made: Src[];
  let ctx: { currentTime: number };
  const last = () => made[made.length - 1];
  const flush = async () => {
    for (let i = 0; i < 3; i++) await Promise.resolve();
  };

  beforeEach(() => {
    made = [];
    vi.useFakeTimers();
    class FakeCtx {
      state = 'running';
      currentTime = 0;
      sampleRate = 8000;
      destination = {};
      constructor() {
        ctx = this;
      }
      createBuffer(_c: number, n: number) {
        return { length: n, getChannelData: () => new Float32Array(n) };
      }
      createBufferSource() {
        const rec: Src = { when: null, stopped: false, length: 0, rate: 1, ended: () => {} };
        made.push(rec);
        const node = {
          onended: null as null | (() => void),
          playbackRate: {
            get value() {
              return rec.rate;
            },
            set value(v: number) {
              rec.rate = v;
            },
          },
          set buffer(b: { length: number } | null) {
            rec.length = b?.length ?? 0;
          },
          connect: (g: unknown) => g,
          start(when: number) {
            rec.when = when;
          },
          stop() {
            rec.stopped = true;
            // browsers report a stopped source's end later, not during stop()
            queueMicrotask(() => node.onended?.());
          },
        };
        rec.ended = () => node.onended?.();
        return node;
      }
      createGain() {
        return { gain: { value: 0 }, connect: (d: unknown) => d };
      }
      resume() {
        return Promise.resolve();
      }
    }
    vi.stubGlobal('AudioContext', FakeCtx);
    vi.stubGlobal('window', globalThis);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const steps = [0, 1, 2, 3].map((time, i) => ({ time, pitches: [60 + i], index: i }));
  const when = () => made.filter((m) => !m.stopped).map((m) => Math.round(m.when! * 1000) / 1000);

  it('tells the tab listener that playback ended when a chord interrupts it', () => {
    const p = new Player();
    const seen: (number | null)[] = [];
    p.playSteps([{ time: 0, pitches: [60], index: 3 }], (i) => seen.push(i));
    p.playChord([64]);
    expect(seen).toEqual([null]);
    p.stop();
    expect(seen).toEqual([null]);
  });

  describe('changing speed during playback', () => {
    it('keeps played notes and reschedules the rest from the current position', () => {
      const p = new Player();
      const seen: (number | null)[] = [];
      p.playSteps(steps, (i) => seen.push(i));
      // t0 = 0.1; 1.5 s into the piece
      vi.advanceTimersByTime(1600);
      ctx.currentTime = 1.6;
      expect(seen).toEqual([0, 1]);
      p.setSpeed(2);
      // steps at 2 and 3 were 0.5 and 1.5 s away; at half speed 1 and 3 s
      expect(when()).toEqual([0.1, 1.1, 2.6, 4.6]);
      vi.advanceTimersByTime(999);
      expect(seen).toEqual([0, 1]);
      vi.advanceTimersByTime(1);
      expect(seen).toEqual([0, 1, 2]);
      vi.advanceTimersByTime(2000);
      expect(seen).toEqual([0, 1, 2, 3]);
      // ends after the last note's 1.5 s ring-out, which doesn't scale with speed
      vi.advanceTimersByTime(1499);
      expect(seen).toEqual([0, 1, 2, 3]);
      vi.advanceTimersByTime(1);
      expect(seen).toEqual([0, 1, 2, 3, null]);
    });

    it('does nothing when nothing is playing', () => {
      const p = new Player();
      p.setSpeed(2);
      p.playSteps(steps, () => {});
      p.stop();
      p.setSpeed(0.5);
      expect(made.filter((m) => !m.stopped)).toEqual([]);
    });

    it('keeps the standard when the speed changes', () => {
      const p = new Player();
      p.playSteps(steps, () => {}, 415);
      ctx.currentTime = 1.6;
      p.setSpeed(2);
      const live = made.filter((m) => !m.stopped);
      expect(live.at(-1)!.rate).toBeCloseTo(playbackRateFor(midiToFreq(63, 415), 8000));
    });
  });

  describe('pitch standard', () => {
    it('plays chords and tab at the standard it is given', () => {
      const p = new Player();
      p.playChord([60], 415);
      expect(last().rate).toBeCloseTo(playbackRateFor(midiToFreq(60, 415), 8000));
      p.playChord([60], 440);
      expect(last().rate).toBeCloseTo(playbackRateFor(midiToFreq(60, 440), 8000));
      p.playSteps([{ time: 0, pitches: [62], index: 0 }], () => {}, 392);
      expect(last().rate).toBeCloseTo(playbackRateFor(midiToFreq(62, 392), 8000));
    });
    it('defaults to A = 440', () => {
      const p = new Player();
      p.playChord([60]);
      expect(last().rate).toBeCloseTo(playbackRateFor(midiToFreq(60, 440), 8000));
    });
  });

  describe('tuning note', () => {
    it('never serves one kind of sound for the other', () => {
      const p = new Player();
      p.playTuningNote(60, 440, () => {});
      expect(last().length).toBe(6 * 8000);
      p.playChord([60], 440);
      expect(last().length).toBe(2.5 * 8000);
      const q = new Player();
      q.playChord([62], 440);
      expect(last().length).toBe(2.5 * 8000);
      q.playTuningNote(62, 440, () => {});
      expect(last().length).toBe(6 * 8000);
    });
    it('reports its end once, when it finishes', () => {
      const p = new Player();
      let ends = 0;
      p.playTuningNote(60, 440, () => ends++);
      last().ended();
      last().ended();
      expect(ends).toBe(1);
    });
    it("ignores a stopped note's late end report", async () => {
      const p = new Player();
      const ends: string[] = [];
      p.playTuningNote(60, 440, () => ends.push('a'));
      p.playTuningNote(62, 440, () => ends.push('b')); // stops a; a's end report arrives later
      await flush();
      expect(ends).toEqual(['a']);
      p.playTuningNote(62, 440, () => ends.push('c')); // the same course again
      await flush();
      expect(ends).toEqual(['a', 'b']);
    });
    it('stopTuningNote leaves tab playback running', () => {
      const p = new Player();
      const seen: (number | null)[] = [];
      p.playSteps(steps, (i) => seen.push(i));
      p.stopTuningNote();
      expect(made.filter((m) => m.stopped)).toEqual([]);
      expect(seen).not.toContain(null);
      vi.advanceTimersByTime(1100);
      expect(seen).toEqual([0, 1]);
    });
    it('stopTuningNote and stop() each end the tuning note once, at once', () => {
      const p = new Player();
      let ends = 0;
      p.playTuningNote(60, 440, () => ends++);
      p.stopTuningNote();
      expect(ends).toBe(1);
      expect(last().stopped).toBe(true);
      p.stopTuningNote();
      expect(ends).toBe(1);
      p.playTuningNote(60, 440, () => ends++);
      p.stop();
      expect(ends).toBe(2);
    });
    it('stops tab playback when a course is tapped', () => {
      const p = new Player();
      const seen: (number | null)[] = [];
      p.playSteps(steps, (i) => seen.push(i));
      p.playTuningNote(60, 415, () => {});
      expect(seen).toEqual([null]);
      expect(last().rate).toBeCloseTo(playbackRateFor(midiToFreq(60, 415), 8000));
      expect(made.filter((m) => !m.stopped)).toHaveLength(1);
    });
  });
});
