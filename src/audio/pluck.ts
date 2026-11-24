import type { Midi } from '../core/model';

/** Frequency of MIDI note `m` with A4 at `a4` Hz. */
export function midiToFreq(m: number, a4 = 440): number {
  return a4 * Math.pow(2, (m - 69) / 12);
}

/** The whole number of samples `karplusStrong` loops over for `freq`. */
export function ksPeriod(freq: number, sampleRate: number): number {
  return Math.max(2, Math.round(sampleRate / freq));
}

/**
 * Playback rate that puts a `karplusStrong` buffer exactly on `freq`. The buffer repeats every
 * `period` samples less the half sample its averaging step takes (each new sample is the mean of
 * one sample and the next), so it sounds at `sampleRate / (period - 0.5)`: measured to 0.01 cents.
 */
export function playbackRateFor(freq: number, sampleRate: number): number {
  return (freq * (ksPeriod(freq, sampleRate) - 0.5)) / sampleRate;
}

/** Length a tuning note is rendered to, and how long it rings clearly. */
export const TUNING_SECONDS = 6;
export const TUNING_RING = 5;

/** Loop gain that lowers a tuning note's fundamental by 10 dB over TUNING_RING, whatever its pitch. */
export function tuningDecay(freq: number): number {
  return 10 ** (-10 / (20 * TUNING_RING * freq));
}

/** The long, slowly fading pluck the tuning aid plays, faded to silence over its last half second. */
export function renderTuningNote(freq: number, sampleRate: number, rand: () => number = Math.random): Float32Array {
  const out = karplusStrong(freq, sampleRate, TUNING_SECONDS, tuningDecay(freq), rand);
  const fade = Math.floor(sampleRate * 0.5);
  for (let i = 0; i < fade; i++) out[out.length - fade + i] *= 1 - (i + 1) / fade;
  return out;
}

export function karplusStrong(freq: number, sampleRate: number, seconds: number, decay = 0.996, rand: () => number = Math.random): Float32Array {
  const n = Math.floor(sampleRate * seconds);
  const period = ksPeriod(freq, sampleRate);
  const ring = new Float32Array(period);
  for (let i = 0; i < period; i++) ring[i] = rand() * 2 - 1;
  const out = new Float32Array(n);
  let idx = 0;
  for (let i = 0; i < n; i++) {
    const next = (idx + 1) % period;
    const v = ring[idx];
    out[i] = v;
    ring[idx] = decay * 0.5 * (v + ring[next]);
    idx = next;
  }
  return out;
}

export interface Step { time: number; pitches: Midi[]; index: number; }

export function stepsFromColumns(cols: { x: number; pitches: Midi[]; index: number }[], msPerUnit: number): Step[] {
  if (!cols.length) return [];
  const unit = msPerUnit / 1000;
  const x0 = cols[0].x;
  let last = -Infinity;
  return cols.map((c) => {
    let t = Math.round((c.x - x0) * unit * 1000) / 1000;
    if (t <= last) t = Math.round((last + unit) * 1000) / 1000;
    last = t;
    return { time: t, pitches: c.pitches, index: c.index };
  });
}

export class Player {
  private ctx: AudioContext | null = null;
  private readonly cache = new Map<number, AudioBuffer>();
  private sources: { src: AudioBufferSourceNode; when: number }[] = [];
  private timers: number[] = [];
  /** the tab being played: its steps and the context time its step times count from */
  private plan: { steps: Step[]; t0: number } | null = null;
  /** the current tab listener; told `null` when playback ends or is interrupted */
  private onStep: ((index: number | null) => void) | null = null;

  private ensure(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private buffer(ctx: AudioContext, m: Midi): AudioBuffer {
    let b = this.cache.get(m);
    if (!b) {
      const data = karplusStrong(midiToFreq(m), ctx.sampleRate, 2.5);
      b = ctx.createBuffer(1, data.length, ctx.sampleRate);
      b.getChannelData(0).set(data);
      this.cache.set(m, b);
    }
    return b;
  }

  private pluck(ctx: AudioContext, m: Midi, when: number): void {
    const src = ctx.createBufferSource();
    src.buffer = this.buffer(ctx, m);
    const gain = ctx.createGain();
    gain.gain.value = 0.25;
    src.connect(gain).connect(ctx.destination);
    src.start(when);
    this.sources.push({ src, when });
  }

  playChord(pitches: Midi[]): void {
    this.stop();
    const ctx = this.ensure();
    [...pitches].sort((a, b) => a - b).forEach((m, i) => this.pluck(ctx, m, ctx.currentTime + 0.05 + i * 0.03));
  }

  playSteps(steps: Step[], onStep: (index: number | null) => void): void {
    this.stop();
    if (!steps.length) return;
    this.onStep = onStep;
    const ctx = this.ensure();
    this.plan = { steps, t0: ctx.currentTime + 0.1 };
    this.schedule(ctx, -Infinity);
  }

  /**
   * Change the speed of the tab being played: `ratio` scales every step's time (2 = half as fast).
   * Notes already sounding ring on; the rest are rescheduled from the current position.
   */
  setSpeed(ratio: number): void {
    const ctx = this.ctx;
    if (!this.plan || !ctx || !(ratio > 0) || ratio === 1) return;
    const now = ctx.currentTime;
    const position = now - this.plan.t0;
    this.sources = this.sources.filter(({ src, when }) => {
      if (when <= now) return true;
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      return false;
    });
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers = [];
    const steps = this.plan.steps.map((s) => ({ ...s, time: s.time * ratio }));
    // before the first note (the short lead-in) the start stays put
    const t0 = position < 0 ? this.plan.t0 : now - position * ratio;
    this.plan = { steps, t0 };
    this.schedule(ctx, position < 0 ? -Infinity : position * ratio);
  }

  /** Plucks and step timers for the plan's steps after `after` (seconds into the tab). */
  private schedule(ctx: AudioContext, after: number): void {
    const { steps, t0 } = this.plan!;
    const onStep = this.onStep;
    const delay = (t: number) => Math.max(0, (t0 + t - ctx.currentTime) * 1000);
    for (const s of steps) {
      if (s.time <= after) continue;
      s.pitches.forEach((m) => this.pluck(ctx, m, t0 + s.time));
      this.timers.push(window.setTimeout(() => onStep?.(s.index), delay(s.time)));
    }
    this.timers.push(
      window.setTimeout(() => {
        this.onStep = null;
        this.plan = null;
        onStep?.(null);
      }, delay(steps[steps.length - 1].time + 1.5)),
    );
  }

  stop(): void {
    for (const s of this.sources) {
      try {
        s.src.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources = [];
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers = [];
    this.plan = null;
    const listener = this.onStep;
    this.onStep = null;
    listener?.(null);
  }
}
