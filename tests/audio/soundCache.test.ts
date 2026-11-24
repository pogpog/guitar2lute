import { describe, it, expect } from 'vitest';
import { SoundCache } from '../../src/audio/soundCache';

describe('SoundCache', () => {
  it('makes each (kind, note, standard) once', () => {
    const c = new SoundCache<string>({ pluck: 4, tuning: 4 });
    let made = 0;
    const make = () => `v${++made}`;
    expect(c.get('pluck', 60, 440, make)).toBe('v1');
    expect(c.get('pluck', 60, 440, make)).toBe('v1');
    expect(made).toBe(1);
  });
  it('keeps kinds and standards apart', () => {
    const c = new SoundCache<string>({ pluck: 4, tuning: 4 });
    const a = c.get('pluck', 60, 440, () => 'pluck440');
    const b = c.get('tuning', 60, 440, () => 'tuning440');
    const d = c.get('pluck', 60, 415, () => 'pluck415');
    expect(new Set([a, b, d]).size).toBe(3);
  });
  it('never grows past its cap, per kind', () => {
    const c = new SoundCache<number>({ pluck: 64, tuning: 16 });
    c.get('pluck', 60, 440, () => 0);
    for (let a4 = 380; a4 <= 480; a4++) c.get('tuning', 60, a4, () => a4);
    expect(c.size('tuning')).toBe(16);
    expect(c.size('pluck')).toBe(1);
  });
  it('drops the least recently used first', () => {
    const c = new SoundCache<string>({ pluck: 2, tuning: 2 });
    c.get('pluck', 1, 440, () => 'a');
    c.get('pluck', 2, 440, () => 'b');
    c.get('pluck', 1, 440, () => 'a2'); // hit: 1 is now the most recent
    c.get('pluck', 3, 440, () => 'c'); // evicts 2
    let remade = false;
    c.get('pluck', 1, 440, () => ((remade = true), 'x'));
    expect(remade).toBe(false);
    c.get('pluck', 2, 440, () => ((remade = true), 'y'));
    expect(remade).toBe(true);
  });
});
