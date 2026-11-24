# Tuning Aid and Pitch Standard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a **Tune…** panel that plays each open course for tuning by ear, and a per-side pitch standard (A = 440, 415, 392 or a typed value) that every sound on that side uses, with notes landing within 2 cents of their target.

**Architecture:**
- A pure module stores and validates the two standards, under `g2l:pitch:lute` and `g2l:pitch:guitar`.
- The synth gains:
  - exact-pitch correction through each source's playback rate;
  - a second kind of sound, the tuning note: 6 s long, with a fade set from its pitch;
  - a capped cache keyed by note, standard and kind.
- The single `Player` takes the standard on every play call. It gains a tuning note with a generation-guarded end callback, and a stop that affects only that note.
- `App` owns both standards and hands each view its own. Each view's settings bar gets a **Pitch** control and a **Tune…** button that opens an inline `TunePanel`.

**Tech Stack:** React 18, TypeScript, Vite, Vitest (static-markup UI tests via `tests/ui/render.ts`), Playwright, Web Audio.

**Spec:** `docs/superpowers/specs/2026-11-24-tuning-aid-design.md`

## Global Constraints

- **Pitch choices:** "A = 440", "A = 415", "A = 392", "Other…".
- **Other… box:**
  - It accepts 380–480 Hz with up to one decimal place. Anything else is rejected and the previous value kept.
  - A stored non-preset value shows as "Other…" with the value in the box.
- **Default:** A = 440 on both sides when nothing valid is stored.
- **Storage:** keys `g2l:pitch:lute` and `g2l:pitch:guitar`. Standards are never saved in pieces or exports.
- **Scope of the standard:** the lute standard applies to every lute sound (tuning aid, lute tab playback, lute chord boxes). The guitar standard does the same for guitar sounds.
- **Pitch accuracy:** every note is within 2 cents of `a4 · 2^((midi − 69)/12)`.
- **Tuning note:**
  - It rings for about 5 s and is rendered to 6 s.
  - In the 250 ms before 5 s, its level is no more than 30 dB below its level in the first 250 ms.
- **Tab and chord notes:** they keep their current 2.5 s length and fade (`decay = 0.996`).
- **Button text:** `"<course> <name> · <Hz to 1 decimal> Hz"`, e.g. "6 G2 · 98.0 Hz". Names come from `courseLabels` (e.g. "E♭2").
- **Lute panel groups:** "Fretted" (courses 1…, ascending), then "Diapasons" (ascending). Each label sits on its own line above its buttons.
- **Guitar panel:** one group, "Strings", 1–6. The tuning aid ignores the capo.
- **Tapping a course:** stops everything (including tab playback) and plays that course alone. Tapping the same course again replays it.
- **What stops only the tuning note:** closing the panel, changing view, and changing that side's standard. Tab playback carries on.
- **When a lit button goes out:** when its note ends (reported by the player, never by a UI timer), on another tap, on Play or a chord box, on close, on a view change, and on a standard change. The light may outlast the audible ring by about a second. That is accepted; do not add a timer.
- **Screen wake lock:** held while the panel is open, and taken again on `visibilitychange` to visible.

## Review Focus

These are inputs the spec implies but doesn't spell out. Each one has a test in the task named.

1. **A comma decimal:** an Android keyboard set to a European locale types "415,3". It must be accepted as 415.3, because the user means it. Tested in Task 1.
2. **A corrupt stored value:** a hand-edited or old stored value ("abc", "1000", JSON) loads as 440 without throwing. Tested in Task 1.
3. **A double tap on the same course:** the light stays on and only one note sounds. A late end report from the first note must not put out the second note's light. Tested in Task 3.
4. **Choosing "Other…" and leaving the box empty or invalid:** the standard stays as it was. Tested in Task 4 (`commitOther`).
5. **The lowest course at the lowest standard:** A1 at A = 380 is about 47.5 Hz. It must still be in tune and audible. Tested in Task 2, where the pitch and audibility tables include it.

---

### Task 1: Pitch standard storage and validation

**Files:**
- Create: `src/core/pitchStandard.ts`
- Test: `tests/core/pitchStandard.test.ts`

**Interfaces:**
- Consumes: `StorageLike` from `src/core/storage.ts`, `MemoryStorage` (tests).
- Produces:
  - `type Side = 'lute' | 'guitar'`
  - `const PITCH_PRESETS: readonly [440, 415, 392]`
  - `const DEFAULT_A4 = 440`, `const MIN_A4 = 380`, `const MAX_A4 = 480`
  - `pitchKey(side: Side): string`, which returns `` `g2l:pitch:${side}` ``
  - `parseA4(text: string): number | null`. It trims, accepts `,` or `.` as the decimal separator and at most one decimal digit, and only 380–480 inclusive.
  - `isPresetA4(a4: number): boolean`
  - `loadA4(storage: StorageLike, side: Side): number`. It returns the stored value if it parses, else `DEFAULT_A4`, and never throws.
  - `saveA4(storage: StorageLike, side: Side, a4: number): void`. It stores `String(a4)` and swallows storage errors.

- [ ] **Step 1: Write the failing tests**

```ts
describe('parseA4', () => {
  it('accepts whole and one-decimal values in range', () => {
    expect(parseA4('415')).toBe(415);
    expect(parseA4(' 430.5 ')).toBe(430.5);
    expect(parseA4('415,3')).toBe(415.3);
    expect(parseA4('380')).toBe(380);
    expect(parseA4('480')).toBe(480);
  });
  it('rejects out of range, extra decimals and non-numbers', () => {
    for (const t of ['379.9', '480.1', '415.25', '', 'abc', '4e2', '-440', '440Hz']) expect(parseA4(t), t).toBeNull();
  });
});
describe('loadA4 / saveA4', () => {
  it('defaults to 440 and keeps the two sides apart', () => {
    const s = new MemoryStorage();
    expect(loadA4(s, 'lute')).toBe(440);
    saveA4(s, 'lute', 415);
    expect(loadA4(s, 'lute')).toBe(415);
    expect(loadA4(s, 'guitar')).toBe(440);
    expect(s.getItem('g2l:pitch:lute')).toBe('415');
  });
  it('falls back to 440 for a corrupt stored value', () => {
    const s = new MemoryStorage();
    for (const v of ['abc', '1000', '{"a":1}', '415.25']) {
      s.setItem(pitchKey('guitar'), v);
      expect(loadA4(s, 'guitar'), v).toBe(440);
    }
  });
  it('survives storage that throws', () => {
    const bad = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } } as unknown as StorageLike;
    expect(loadA4(bad, 'lute')).toBe(440);
    expect(() => saveA4(bad, 'lute', 415)).not.toThrow();
  });
});
it('knows the presets', () => {
  expect(PITCH_PRESETS).toEqual([440, 415, 392]);
  expect(isPresetA4(415)).toBe(true);
  expect(isPresetA4(430)).toBe(false);
});
```

- [ ] **Step 2: Run the tests to verify they fail.** Run `npx vitest run tests/core/pitchStandard.test.ts`. Expected: FAIL, because the module isn't found.
- [ ] **Step 3: Implement `src/core/pitchStandard.ts`** with the interfaces above. `parseA4` uses `/^\d{3}([.,]\d)?$/` on the trimmed text, then a range check.
- [ ] **Step 4: Run the tests to verify they pass.** Run `npx vitest run tests/core/pitchStandard.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** with message `feat(pitch): store and validate a pitch standard per instrument side`.

---

### Task 2: Exact pitch, the tuning-note sound and the sound cache

**Files:**
- Modify: `src/audio/pluck.ts`, adding the functions below. `karplusStrong` is unchanged.
- Create: `src/audio/soundCache.ts`
- Create: `tests/audio/measure.ts` (the test helper)
- Test: `tests/audio/pitch.test.ts`, `tests/audio/soundCache.test.ts`

**Interfaces:**
- Produces, in `src/audio/pluck.ts`:
  - `midiToFreq(m: number, a4 = 440): number`
  - `ksPeriod(freq: number, sampleRate: number): number`. This is the same rounding `karplusStrong` uses: `Math.max(2, Math.round(sampleRate / freq))`. `karplusStrong` must call it.
  - `playbackRateFor(freq: number, sampleRate: number): number`. It returns `freq * (ksPeriod(freq, sampleRate) - 0.5) / sampleRate`. A rendered buffer sounds at `sampleRate / (period − 0.5)`; this was measured to 0.01 cents (see the spec).
  - `const TUNING_SECONDS = 6`, `const TUNING_RING = 5`
  - `tuningDecay(freq: number): number`. It returns `10 ** (-10 / (20 * TUNING_RING * freq))`, a 10 dB fall of the loop gain over 5 s. It was measured to give −18.5 to −24.6 dB at 5 s across 43–430 Hz at 44.1 and 48 kHz.
  - `renderTuningNote(freq: number, sampleRate: number, rand?: () => number): Float32Array`. It is `karplusStrong(freq, sampleRate, TUNING_SECONDS, tuningDecay(freq), rand)`, with a linear fade to 0 over the last 0.5 s so the end has no click.
- Produces, in `src/audio/soundCache.ts`:
  - `type SoundKind = 'pluck' | 'tuning'`
  - `class SoundCache<V>`:
    - `constructor(caps: Record<SoundKind, number>)`
    - `get(kind: SoundKind, midi: number, a4: number, make: () => V): V`. It uses LRU per kind: a hit moves the entry to most-recent, and an insert past the cap evicts the least recent of that kind.
    - `size(kind: SoundKind): number`
  - The caps the Player uses: `{ pluck: 64, tuning: 16 }`.

- [ ] **Step 1: Write the measurement helper `tests/audio/measure.ts`.** The tests don't determine this algorithm, so here it is. It refines frequency from the phase advance of the fundamental between two Hann windows, with longer gaps each time. It was checked against `sampleRate / (period − 0.5)` to 0.001 cents for 52–480 Hz at 44.1 and 48 kHz.

```ts
/** phase of the `f` Hz component in a Hann window of `len` samples starting at `start` */
function phaseAt(x: Float32Array, sr: number, f: number, start: number, len: number): number {
  let re = 0, im = 0;
  for (let i = 0; i < len; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / len);
    const a = (2 * Math.PI * f * (start + i)) / sr;
    re += x[start + i] * w * Math.cos(a);
    im += x[start + i] * w * Math.sin(a);
  }
  return Math.atan2(im, re);
}
function refine(x: Float32Array, sr: number, f: number, gap: number): number {
  const len = Math.floor(sr * 0.2), a = Math.floor(sr * 0.3), b = a + Math.floor(sr * gap);
  let d = phaseAt(x, sr, f, b, len) - phaseAt(x, sr, f, a, len);
  d = (((d + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return f - (d * sr) / (2 * Math.PI * (b - a));
}
/** Fundamental of `x` in Hz; `approx` must be within about 3 % (needs ≥ 2.2 s of sound). */
export function measureFundamental(x: Float32Array, sr: number, approx: number): number {
  return refine(x, sr, refine(x, sr, refine(x, sr, approx, 0.02), 0.2), 1.5);
}
export const cents = (a: number, b: number) => 1200 * Math.log2(a / b);
export const rms = (a: Float32Array) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
```

- [ ] **Step 2: Write the failing tests in `tests/audio/pitch.test.ts`.** Use a seeded `rand` as in the existing pluck test.

```ts
const NOTES = [33 /* A1 */, 43, 55, 62, 64, 67 /* G4 */];
const A4S = [380, 392, 415, 440, 480];
it('midiToFreq honours the standard', () => {
  expect(midiToFreq(69, 415)).toBeCloseTo(415);
  expect(midiToFreq(57, 392)).toBeCloseTo(196);
});
for (const sr of [44100, 48000]) {
  it(`playback lands within 2 cents for both kinds of sound at ${sr} Hz`, () => {
    for (const a4 of A4S) for (const m of NOTES) {
      const f = midiToFreq(m, a4);
      for (const buf of [karplusStrong(f, sr, 2.5, 0.996, seeded()), renderTuningNote(f, sr, seeded())]) {
        const heard = measureFundamental(buf, sr, f) * playbackRateFor(f, sr);
        expect(Math.abs(cents(heard, f)), `${m}@${a4}`).toBeLessThan(2);
      }
    }
  });
  it(`every tuning note is still audible at 5 s at ${sr} Hz`, () => {
    for (const a4 of [380, 480]) for (const m of NOTES) {
      const buf = renderTuningNote(midiToFreq(m, a4), sr, seeded());
      expect(buf.length).toBe(TUNING_SECONDS * sr);
      const q = Math.floor(sr * 0.25);
      const db = 20 * Math.log10(rms(buf.subarray(5 * sr - q, 5 * sr)) / rms(buf.subarray(0, q)));
      expect(db, `${m}@${a4}`).toBeGreaterThanOrEqual(-30);
    }
  });
}
it('the tuning note fades to silence at its end', () => {
  const buf = renderTuningNote(196, 8000, seeded());
  expect(Math.abs(buf[buf.length - 1])).toBeLessThan(1e-3);
});
```

If the pitch loop is slow, trim `A4S` to `[380, 415, 480]` and note that in the commit message. Keep the lowest and highest notes at both ends of the range.

- [ ] **Step 3: Write the failing tests in `tests/audio/soundCache.test.ts`:**
  - `get` calls `make` once per (kind, midi, a4).
  - The same midi and a4 under different kinds gives different values.
  - The same midi under a4 415 and 440 gives different values.
  - Inserting 101 tuning entries (a4 380..480) leaves `size('tuning') === 16` with `size('pluck')` unaffected.
  - After the cap is reached, re-getting the oldest entry first keeps it: hits refresh recency.
- [ ] **Step 4: Run the tests to verify they fail.** Run `npx vitest run tests/audio/pitch.test.ts tests/audio/soundCache.test.ts`. Expected: FAIL, because of missing exports or modules.
- [ ] **Step 5: Implement the interfaces above.** `SoundCache` keys entries as `` `${midi}@${a4}` `` inside one `Map` per kind, and uses `Map` insertion order for LRU.
- [ ] **Step 6: Run the tests to verify they pass.** Run `npx vitest run tests/audio`. Expected: PASS. That includes the existing `pluck.test.ts`, whose `midiToFreq` cases still hold with the default `a4`.
- [ ] **Step 7: Commit** with message `feat(audio): exact-pitch playback rate, tuning-note sound and capped sound cache`.

---

### Task 3: Player: standard per call, two kinds of sound, the tuning note

**Files:**
- Modify: `src/audio/pluck.ts` (`Player`)
- Test: `tests/audio/pluck.test.ts`

**Interfaces:**
- Consumes (Task 2): `midiToFreq`, `playbackRateFor`, `renderTuningNote`, `karplusStrong`, `SoundCache`, `SoundKind`.
- Produces:
  - `playChord(pitches: Midi[], a4 = 440): void`
  - `playSteps(steps: Step[], onStep: (index: number | null) => void, a4 = 440): void`. The plan stores `a4`, so `setSpeed` reschedules at the same standard.
  - `playTuningNote(m: Midi, a4: number, onEnd: () => void): void`:
    - It calls `stop()` first, which ends any tab, chord or previous tuning note.
    - It then plays one `'tuning'` sound.
    - `onEnd` is called exactly once: when that source's `onended` fires while it is still the current tuning note, or synchronously when it is ended by `stopTuningNote()` or `stop()`.
    - An `onended` for a note that is no longer current is ignored, using a numeric id per tuning note.
  - `stopTuningNote(): void`. It stops only the tuning note and calls its `onEnd`. It leaves tab sources, timers, `plan` and `onStep` untouched.
  - `stop()`, as today, plus it ends the tuning note.
- Every source gets `src.playbackRate.value = playbackRateFor(freq, ctx.sampleRate)`.
- Buffers come from one `SoundCache<AudioBuffer>({ pluck: 64, tuning: 16 })`:
  - `'pluck'` sounds use `karplusStrong(freq, sr, 2.5)`, as today.
  - `'tuning'` sounds use `renderTuningNote`.
- The tuning source is kept out of `this.sources`. It has its own gain node at 0.25.

- [ ] **Step 1: Extend the two existing fake contexts in `tests/audio/pluck.test.ts`:**
  - `createBuffer(_c, n)` returns `{ length: n, getChannelData: () => new Float32Array(n) }`.
  - Sources gain `playbackRate: { value: 1 }`, a settable `onended`, and a `stop()` that queues `onended` with `queueMicrotask`, as browsers fire it asynchronously.
  - Record each source's `buffer.length`, `playbackRate.value` and `stopped`.
- [ ] **Step 2: Write the failing tests:**

```ts
it('plays chords and tab at the standard it is given', () => {
  // fake sampleRate 8000; a4 415 vs 440 give different playback rates for the same midi
  p.playChord([60], 415); const r415 = last().rate;
  p.playChord([60], 440); const r440 = last().rate;
  expect(r415).toBeCloseTo(playbackRateFor(midiToFreq(60, 415), 8000));
  expect(r440).toBeCloseTo(playbackRateFor(midiToFreq(60, 440), 8000));
});
it('keeps the standard when the speed changes during playback', () => { /* playSteps(..., 415); setSpeed(2); rescheduled sources use the 415 rate */ });
it('never serves one kind of sound for the other', () => {
  p.playTuningNote(60, 440, () => {}); expect(last().length).toBe(6 * 8000);
  p.playChord([60], 440);              expect(last().length).toBe(2.5 * 8000);
  // and in the other order on a fresh Player
});
it('ends the tuning note once, when it finishes', async () => { /* fire onended → onEnd called once */ });
it('ignores a stopped note\'s late end report', async () => {
  const ends: string[] = [];
  p.playTuningNote(60, 440, () => ends.push('a'));
  p.playTuningNote(62, 440, () => ends.push('b')); // stops a; a's onended arrives later
  await Promise.resolve(); await Promise.resolve();
  expect(ends).toEqual(['a']);            // b is still lit
});
it('stopTuningNote leaves tab playback running', () => {
  const seen: (number | null)[] = [];
  p.playSteps(steps, (i) => seen.push(i));
  p.stopTuningNote();                                  // the panel closes while the tab plays
  expect(made.filter((m) => m.stopped)).toEqual([]);   // no tab source stopped
  expect(seen).not.toContain(null);                    // the tab listener wasn't told it ended
  vi.advanceTimersByTime(1100);
  expect(seen).toEqual([0, 1]);                        // tab timers still fire
});
it('stopTuningNote and stop() each end the tuning note once, at once', () => {
  let ends = 0;
  p.playTuningNote(60, 440, () => ends++);
  p.stopTuningNote();
  expect(ends).toBe(1);
  expect(last().stopped).toBe(true);
  p.playTuningNote(60, 440, () => ends++);
  p.stop();
  expect(ends).toBe(2);
});
```

- [ ] **Step 3: Run the tests to verify they fail.** Run `npx vitest run tests/audio/pluck.test.ts`. Expected: the new tests FAIL. The existing ones still pass with the extended fakes.
- [ ] **Step 4: Implement the Player changes above.**
- [ ] **Step 5: Run the tests to verify they pass.** Run `npx vitest run tests/audio && npm run typecheck`. Expected: PASS, and the typecheck is clean.
- [ ] **Step 6: Commit** with message `feat(audio): player takes the pitch standard and plays a stoppable tuning note`.

---

### Task 4: UI parts: Pitch control, Tune panel, wake lock

**Files:**
- Modify: `src/core/tunings.ts` (add `tuneGroups`)
- Create: `src/ui/PitchControl.tsx`, `src/ui/TunePanel.tsx`, `src/ui/wakeLock.ts`
- Modify: `src/styles.css` (`.tune-panel`, `.tune-group-label`, `.tune-buttons`, `.tune-course`, `.tune-course[aria-pressed="true"]`)
- Test: `tests/core/tunings.test.ts` (append), `tests/ui/tune.test.tsx`, `tests/ui/wakeLock.test.ts`

**Interfaces:**
- Consumes: `courseLabels`, `CourseLabel` (`src/core/tunings.ts`); `parseA4`, `isPresetA4`, `PITCH_PRESETS` (Task 1); `midiToFreq` (Task 2).
- Produces:
  - **`tuneGroups`:** `interface TuneCourse extends CourseLabel { midi: Midi }`, and `tuneGroups(t: Tuning, instrument: 'lute' | 'guitar'): { label: string; courses: TuneCourse[] }[]`.
    - For a lute, it returns "Fretted" and then "Diapasons". The diapason group is omitted when it is empty.
    - For a guitar, it returns a single "Strings" group.
    - Courses ascend by number.
  - **`tuneButtonText`:** `tuneButtonText(c: TuneCourse, a4: number): string`, e.g. `'6 G2 · 98.0 Hz'`. The frequency is `midiToFreq(c.midi, a4).toFixed(1)`.
  - **`commitOther`:** `commitOther(text: string, current: number): number`, which is `parseA4(text) ?? current`. It is exported from `PitchControl.tsx`.
  - **`PitchControl`:** `PitchControl({ a4, onChange, testId }: { a4: number; onChange: (a4: number) => void; testId: string })`.
    - It renders `<label>Pitch <select data-testid={testId}>` with the options "A = 440", "A = 415", "A = 392" and "Other…" (value `other`).
    - The number box `data-testid={`${testId}-other`}` (`inputMode="decimal"`, `aria-label="Pitch in Hz"`) shows when the choice is Other. Its initial state is `!isPresetA4(a4)`.
    - A preset choice calls `onChange` and hides the box.
    - The box commits on blur or Enter via `commitOther`, and calls `onChange` only if the value changed.
  - **`Tuner`:** `interface Tuner { play(m: Midi, onEnd: () => void): void; stop(): void }`.
  - **`TunePanel`:** `TunePanel({ tuning, a4, instrument, tuner, onClose }: { tuning: Tuning; a4: number; instrument: 'lute' | 'guitar'; tuner: Tuner; onClose: () => void })`.
    - It renders `data-testid="tune-panel"`. Each group has an `h3.tune-group-label`, followed by a `div.tune-buttons` of `button.tune-course` with `data-testid={`tune-course-${course}`}` and `aria-pressed`.
    - It has a Close button with `data-testid="tune-close"`.
    - Lit state is `useState<number | null>` (the course number). A tap runs `tuner.play(c.midi, () => setLit((l) => (l === c.course ? null : l)))` and then `setLit(c.course)`.
    - On unmount only (keep the latest `tuner` in a ref; the effect deps are `[]`), it calls `tuner.stop()` and releases the wake lock.
  - **`holdWakeLock`:** `holdWakeLock(nav: { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }, doc: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>): () => void`.
    - It requests now, and again on each `visibilitychange` to `'visible'`. Every request error is swallowed.
    - The returned function removes the listener and releases the current lock, including one that arrives after release.
    - `TunePanel` calls it in a mount effect with `navigator` and `document`.

- [ ] **Step 1: Write the failing tests.** In `tests/core/tunings.test.ts`:

```ts
it('groups lute courses fretted first, then diapasons, ascending', () => {
  const g = tuneGroups(findPreset('lute-8-g')!, 'lute');
  expect(g.map((x) => x.label)).toEqual(['Fretted', 'Diapasons']);
  expect(g[0].courses.map((c) => c.course)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  expect(g[1].courses.map((c) => c.course)).toEqual([8]);
  expect(tuneGroups(findPreset('lute-6-g')!, 'lute').map((x) => x.label)).toEqual(['Fretted']);
  expect(tuneGroups(findPreset('lute-13-baroque-dm')!, 'lute')[1].courses).toHaveLength(7);
  expect(tuneGroups(STANDARD_GUITAR, 'guitar')).toEqual([{ label: 'Strings', courses: expect.any(Array) }]);
});
it('labels a button with course, name and Hz at the standard', () => {
  const six = tuneGroups(findPreset('lute-6-g')!, 'lute')[0].courses[5];
  expect(tuneButtonText(six, 440)).toBe('6 G2 · 98.0 Hz');
  expect(tuneButtonText(six, 415)).toBe('6 G2 · 92.4 Hz');
});
```

`lute-8-g` has `frettedCourses` 7, so its single diapason is course 8. Check this against `LUTE_PRESETS` and adjust the expected arrays to the preset data, not the other way round.

In `tests/ui/tune.test.tsx` (static markup via `html`):
- **The lute panel:** it shows "Fretted" and "Diapasons" headings before their buttons, one button per course, the text "6 G2 · 98.0 Hz", and no `aria-pressed="true"`.
- **The guitar panel:** it shows "Strings".
- **`PitchControl` at 415:** "A = 415" is selected, and the `-other` box is absent.
- **`PitchControl` at 430:** "Other…" is selected and the box shows `value="430"`.
- **`commitOther`:** `('415,3', 440)` gives 415.3, `('', 415)` gives 415, `('500', 392)` gives 392.

In `tests/ui/wakeLock.test.ts`, with a fake `nav` that counts requests and returns sentinels with a `release` spy, and a fake `doc` with a listener map:
- It requests once on hold.
- A `visibilitychange` with `visibilityState: 'visible'` requests again.
- `'hidden'` does not request.
- Release releases the current sentinel and removes the listener.
- A `nav` without `wakeLock` doesn't throw.
- A rejected request doesn't throw.

- [ ] **Step 2: Run the tests to verify they fail.** Run `npx vitest run tests/core/tunings.test.ts tests/ui/tune.test.tsx tests/ui/wakeLock.test.ts`. Expected: FAIL, because of missing exports or modules.
- [ ] **Step 3: Implement the interfaces above, and the CSS.**
  - `.tune-panel` matches `.tuning-editor`.
  - `.tune-buttons` is a wrapping flex with a gap of 8px.
  - `.tune-course` has a min-height of 44px and a padding of 8px 12px.
  - `[aria-pressed="true"]` uses `--accent` as the background and `--bg` as the text colour, like `button.primary`.
- [ ] **Step 4: Run the tests to verify they pass.** Run `npx vitest run tests/core tests/ui && npm run typecheck`. Expected: PASS, and the typecheck is clean.
- [ ] **Step 5: Commit** with message `feat(ui): pitch control, tune panel and screen wake lock`.

---

### Task 5: Wire it into the app

**Files:**
- Modify: `src/ui/App.tsx`, `src/ui/LuteView.tsx`, `src/ui/LuteSettingsBar.tsx`, `src/ui/GuitarView.tsx`
- Modify: `docs/superpowers/specs/2026-11-19-guitar-to-lute-design.md` (one short "Tuning aid and pitch standard" section that points to the 2026-11-24 spec), and `README.md` (one sentence under the app description)
- Test: `tests/ui/luteView.test.tsx`, `tests/ui/guitarView.test.tsx` (static), `e2e/app.spec.ts`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - **`App` state:** `const [a4, setA4s] = useState<Record<Side, number>>(() => ({ lute: loadA4(store, 'lute'), guitar: loadA4(store, 'guitar') }))`.
  - **`changeA4(side, v)`:** it calls `player.stopTuningNote()`, then `saveA4(store, side, v)`, then updates the state.
  - **`tunerFor(side): Tuner`:** `{ play: (m, onEnd) => player.playTuningNote(m, a4[side], onEnd), stop: () => player.stopTuningNote() }`.
  - **Chords:** `GuitarView` gets `onPlayChord={(p) => player.playChord(p, a4.guitar)}`; `LuteView` gets the same with `a4.lute`.
  - **Tab:** `playTab` passes `view === 'guitar' ? a4.guitar : a4.lute` to `playSteps`.
  - **`Header` view change:** `onView={(v) => { player.stopTuningNote(); setView(v); }}`.
  - **`LuteView` and `GuitarView`:** each gains the props `a4: number`, `onA4: (a4: number) => void` and `tuner: Tuner`, and its own `tuneOpen` state.
  - **`LuteSettingsBar`:** gains `a4`, `onA4` and `onTune`. It renders `<PitchControl testId="lute-pitch" …>` and then `<button data-testid="open-tune">Tune…</button>`, right after **Edit tuning…**.
  - **Guitar settings bar:** the same with `testId="guitar-pitch"`.
  - **Placement:** `TunePanel` renders directly after the settings bar when `tuneOpen` is set.

- [ ] **Step 1: Write the failing static tests.**
  - `LuteSettingsBar` with `a4={415}` shows "Pitch", "A = 415" selected, and "Tune…".
  - `GuitarView` shows `data-testid="guitar-pitch"` and "Tune…".
  - Update existing renders of `LuteSettingsBar`, `LuteView` and `GuitarView` in the tests for the new required props (`a4={440} onA4={noop} tuner={{ play: noop, stop: noop }}`).
- [ ] **Step 2: Write the failing e2e tests in `e2e/app.spec.ts`:**

```ts
test('the tuning aid lights a lute course while it rings, then goes out', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('view-lute').click();
  await page.getByTestId('open-tune').click();
  await expect(page.getByTestId('tune-panel')).toContainText('Fretted');
  const c1 = page.getByTestId('tune-course-1');
  await c1.click();
  await expect(c1).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('tune-course-2').click();
  await expect(c1).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('tune-course-2')).toHaveAttribute('aria-pressed', 'false', { timeout: 8000 });
});
test('a typed pitch standard is remembered and shown on the buttons', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('view-lute').click();
  await page.getByTestId('lute-pitch').selectOption('other');
  await page.getByTestId('lute-pitch-other').fill('430');
  await page.getByTestId('lute-pitch-other').press('Enter');
  await page.reload();
  await page.getByTestId('view-lute').click();
  await expect(page.getByTestId('lute-pitch')).toHaveValue('other');
  await expect(page.getByTestId('lute-pitch-other')).toHaveValue('430');
  await page.getByTestId('open-tune').click();
  await expect(page.getByTestId('tune-course-1')).toContainText('383.1 Hz'); // G4 at A = 430
  await page.getByTestId('view-guitar').click();
  await expect(page.getByTestId('guitar-pitch')).toHaveValue('440');
});
test('closing the tuning panel or switching view leaves tab playback running', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('open-import').click();
  const lines = ['e|0-1-2-3-4-5-6-7-|', ...['B', 'G', 'D', 'A', 'E'].map((s) => `${s}|----------------|`)];
  await page.getByTestId('import-text').fill(lines.join('\n'));
  await page.getByTestId('do-import').click();
  await page.getByTestId('open-tune').click();
  await page.getByTestId('play').click();
  await page.getByTestId('tune-close').click();
  await expect(page.getByTestId('tune-panel')).toHaveCount(0);
  await expect(page.getByTestId('stop')).toBeVisible();
  await page.getByTestId('view-lute').click();
  await expect(page.getByTestId('stop')).toBeVisible();
});
```

The default lute preset's course 1 is G4: 430 · 2^(−2/12) = 383.08 Hz. Check the default preset and compute the expected text from it.

- [ ] **Step 3: Run the tests to verify they fail.** Run `npx vitest run tests/ui && npm run e2e`. Expected: the new tests FAIL.
- [ ] **Step 4: Implement the wiring above,** plus the spec section and the README sentence: "Each side has a **Tune…** panel that plays its open courses, and a pitch standard (A = 440, 415, 392 or your own) used for all its sound."
- [ ] **Step 5: Run the full verification.** Run `npm test && npm run typecheck && npm run e2e`. Expected: everything passes. If port 4173 is busy with the HTTPS preview, run the e2e on a temporary copy of the config at port 4174 and delete it afterwards.
- [ ] **Step 6: Commit** with message `feat: tuning aid and per-side pitch standard in the app`.
