import { describe, it, expect } from 'vitest';
import { karplusStrong, midiToFreq, playbackRateFor, renderTuningNote, TUNING_SECONDS } from '../../src/audio/pluck';
import { cents, measureFundamental, rms, seeded } from './measure';

/** lowest diapason (A1) to the top course (G4) */
const NOTES = [33, 43, 55, 62, 64, 67];
const A4S = [380, 392, 415, 440, 480];

describe('pitch', () => {
  it('midiToFreq honours the standard', () => {
    expect(midiToFreq(69, 415)).toBeCloseTo(415);
    expect(midiToFreq(57, 392)).toBeCloseTo(196);
    expect(midiToFreq(69)).toBeCloseTo(440);
  });
  for (const sr of [44100, 48000]) {
    it(`playback lands within 2 cents for both kinds of sound at ${sr} Hz`, () => {
      for (const a4 of A4S) {
        for (const m of NOTES) {
          const f = midiToFreq(m, a4);
          for (const buf of [karplusStrong(f, sr, 2.5, 0.996, seeded()), renderTuningNote(f, sr, seeded())]) {
            const heard = measureFundamental(buf, sr, f) * playbackRateFor(f, sr);
            expect(Math.abs(cents(heard, f)), `${m}@${a4}`).toBeLessThan(2);
          }
        }
      }
    });
    it(`every tuning note is still audible at 5 s at ${sr} Hz`, () => {
      for (const a4 of [380, 480]) {
        for (const m of NOTES) {
          const buf = renderTuningNote(midiToFreq(m, a4), sr, seeded());
          expect(buf.length).toBe(TUNING_SECONDS * sr);
          const q = Math.floor(sr * 0.25);
          const db = 20 * Math.log10(rms(buf.subarray(5 * sr - q, 5 * sr)) / rms(buf.subarray(0, q)));
          expect(db, `${m}@${a4}`).toBeGreaterThanOrEqual(-30);
        }
      }
    });
  }
  it('the tuning note fades to silence at its end', () => {
    const buf = renderTuningNote(196, 8000, seeded());
    expect(Math.abs(buf[buf.length - 1])).toBeLessThan(1e-3);
  });
});
