/** The two sounds a note can have: the short playback pluck and the long tuning note. */
export type SoundKind = 'pluck' | 'tuning';

/**
 * Rendered sounds by kind, note and pitch standard, with at most `caps[kind]` of each kind kept:
 * past that the least recently used goes. Dropping one is safe, as a scheduled note holds its own.
 */
export class SoundCache<V> {
  private readonly maps: Record<SoundKind, Map<string, V>> = { pluck: new Map(), tuning: new Map() };

  constructor(private readonly caps: Record<SoundKind, number>) {}

  get(kind: SoundKind, midi: number, a4: number, make: () => V): V {
    const map = this.maps[kind];
    const key = `${midi}@${a4}`;
    let v = map.get(key);
    if (v !== undefined) {
      map.delete(key); // re-inserted below as the most recent
    } else {
      v = make();
      while (map.size >= this.caps[kind]) map.delete(map.keys().next().value as string);
    }
    map.set(key, v);
    return v;
  }

  size(kind: SoundKind): number {
    return this.maps[kind].size;
  }
}
