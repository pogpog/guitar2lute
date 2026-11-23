import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { midiToFreq, karplusStrong, stepsFromColumns, Player } from '../../src/audio/pluck';

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
  afterEach(() => vi.unstubAllGlobals());
  it('tells the tab listener that playback ended when a chord interrupts it', () => {
    class FakeCtx {
      state = 'running';
      currentTime = 0;
      sampleRate = 8000;
      destination = {};
      createBuffer(_c: number, n: number) {
        return { getChannelData: () => new Float32Array(n) };
      }
      createBufferSource() {
        return { buffer: null, connect: (g: unknown) => g, start() {}, stop() {} };
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
    const p = new Player();
    const seen: (number | null)[] = [];
    p.playSteps([{ time: 0, pitches: [60], index: 3 }], (i) => seen.push(i));
    p.playChord([64]);
    expect(seen).toEqual([null]);
    p.stop();
    expect(seen).toEqual([null]);
  });

  describe('changing speed during playback', () => {
    type Src = { pitch: number; when: number | null; stopped: boolean };
    let made: Src[];
    let ctx: { currentTime: number };
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
          return { getChannelData: () => new Float32Array(n) };
        }
        createBufferSource() {
          const rec: Src = { pitch: -1, when: null, stopped: false };
          made.push(rec);
          return {
            set buffer(b: { pitch?: number } | null) {
              rec.pitch = b?.pitch ?? -1;
            },
            connect: (g: unknown) => g,
            start(when: number) {
              rec.when = when;
            },
            stop() {
              rec.stopped = true;
            },
          };
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
    afterEach(() => vi.useRealTimers());

    const steps = [0, 1, 2, 3].map((time, i) => ({ time, pitches: [60 + i], index: i }));
    const when = () => made.filter((m) => !m.stopped).map((m) => Math.round(m.when! * 1000) / 1000);

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
  });
});
