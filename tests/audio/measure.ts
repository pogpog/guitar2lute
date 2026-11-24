/** phase of the `f` Hz component in a Hann window of `len` samples starting at `start` */
function phaseAt(x: Float32Array, sr: number, f: number, start: number, len: number): number {
  let re = 0;
  let im = 0;
  for (let i = 0; i < len; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / len);
    const a = (2 * Math.PI * f * (start + i)) / sr;
    re += x[start + i] * w * Math.cos(a);
    im += x[start + i] * w * Math.sin(a);
  }
  return Math.atan2(im, re);
}

/** `f` corrected by the phase its component gains between two windows `gap` seconds apart */
function refine(x: Float32Array, sr: number, f: number, gap: number): number {
  const len = Math.floor(sr * 0.2);
  const a = Math.floor(sr * 0.3);
  const b = a + Math.floor(sr * gap);
  let d = phaseAt(x, sr, f, b, len) - phaseAt(x, sr, f, a, len);
  d = ((((d + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
  return f - (d * sr) / (2 * Math.PI * (b - a));
}

/** Fundamental of `x` in Hz; `approx` must be within about 3 % (needs at least 2.2 s of sound). */
export function measureFundamental(x: Float32Array, sr: number, approx: number): number {
  return refine(x, sr, refine(x, sr, refine(x, sr, approx, 0.02), 0.2), 1.5);
}

export const cents = (a: number, b: number) => 1200 * Math.log2(a / b);
export const rms = (a: Float32Array) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);

/** A repeatable random source for the pluck's noise burst. */
export function seeded(seed = 7): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
