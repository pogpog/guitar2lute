import { describe, it, expect } from 'vitest';
import { midiToFreq, karplusStrong, stepsFromColumns } from '../../src/audio/pluck';

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
