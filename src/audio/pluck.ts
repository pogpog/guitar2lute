import type { Midi } from '../core/model';

export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export function karplusStrong(freq: number, sampleRate: number, seconds: number, decay = 0.996, rand: () => number = Math.random): Float32Array {
  const n = Math.floor(sampleRate * seconds);
  const period = Math.max(2, Math.round(sampleRate / freq));
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
  private sources: AudioBufferSourceNode[] = [];
  private timers: number[] = [];

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
    this.sources.push(src);
  }

  playChord(pitches: Midi[]): void {
    this.stop();
    const ctx = this.ensure();
    [...pitches].sort((a, b) => a - b).forEach((m, i) => this.pluck(ctx, m, ctx.currentTime + 0.05 + i * 0.03));
  }

  playSteps(steps: Step[], onStep: (index: number | null) => void): void {
    this.stop();
    if (!steps.length) return;
    const ctx = this.ensure();
    const lead = 0.1;
    const t0 = ctx.currentTime + lead;
    for (const s of steps) {
      s.pitches.forEach((m) => this.pluck(ctx, m, t0 + s.time));
      this.timers.push(window.setTimeout(() => onStep(s.index), (s.time + lead) * 1000));
    }
    const end = steps[steps.length - 1].time + 1.5 + lead;
    this.timers.push(window.setTimeout(() => onStep(null), end * 1000));
  }

  stop(): void {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources = [];
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers = [];
  }
}
