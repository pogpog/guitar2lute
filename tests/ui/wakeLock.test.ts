import { describe, it, expect, vi } from 'vitest';
import { holdWakeLock } from '../../src/ui/wakeLock';

function fakes(opts: { reject?: boolean } = {}) {
  const sentinels: { release: ReturnType<typeof vi.fn> }[] = [];
  const nav = {
    wakeLock: {
      request: vi.fn(() => {
        if (opts.reject) return Promise.reject(new Error('NotAllowedError'));
        const s = { release: vi.fn(() => Promise.resolve()) };
        sentinels.push(s);
        return Promise.resolve(s);
      }),
    },
  };
  const listeners = new Set<() => void>();
  const doc = {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: (_t: string, f: () => void) => listeners.add(f),
    removeEventListener: (_t: string, f: () => void) => listeners.delete(f),
  };
  const fire = (state: DocumentVisibilityState) => {
    doc.visibilityState = state;
    listeners.forEach((f) => f());
  };
  return { nav, doc, fire, sentinels, listeners };
}
const flush = async () => {
  for (let i = 0; i < 3; i++) await Promise.resolve();
};

describe('holdWakeLock', () => {
  it('asks again each time the page becomes visible', async () => {
    const f = fakes();
    const release = holdWakeLock(f.nav, f.doc as unknown as Document);
    expect(f.nav.wakeLock.request).toHaveBeenCalledTimes(1);
    f.fire('hidden');
    expect(f.nav.wakeLock.request).toHaveBeenCalledTimes(1);
    f.fire('visible');
    expect(f.nav.wakeLock.request).toHaveBeenCalledTimes(2);
    await flush();
    release();
    await flush();
    expect(f.sentinels.at(-1)!.release).toHaveBeenCalled();
    expect(f.listeners.size).toBe(0);
  });
  it('releases a lock that arrives after release', async () => {
    const f = fakes();
    const release = holdWakeLock(f.nav, f.doc as unknown as Document);
    release();
    await flush();
    expect(f.sentinels[0].release).toHaveBeenCalled();
  });
  it('does nothing without wake lock support, and swallows refusals', async () => {
    expect(() => holdWakeLock({}, fakes().doc as unknown as Document)()).not.toThrow();
    const f = fakes({ reject: true });
    const release = holdWakeLock(f.nav, f.doc as unknown as Document);
    await flush();
    expect(() => release()).not.toThrow();
  });
});
