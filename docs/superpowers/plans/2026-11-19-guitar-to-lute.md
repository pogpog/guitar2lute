# Guitar → Lute Converter PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A client-side PWA where a user enters guitar chord boxes (by clicking a diagram) and guitar tab (pasted text or text-based PDF), and converts them to lute chord boxes and lute tablature (French / Italian / modern) for a chosen lute tuning, with transpose, manual overrides, alternative voicings, audio playback and TabCode export.

**Architecture:** A framework-free TypeScript core (`src/core/`) holds the model, pitch maths, tunings, ASCII-tab parser, the conversion engine (candidate enumeration → playability filter → cost → Viterbi DP over tab columns) and pure layout/serialisation code; it is fully unit-tested with Vitest. `src/import/` (pdf.js text reconstruction) and `src/audio/` (WebAudio Karplus-Strong) are thin adapters around pure, tested functions. `src/ui/` is React; each component renders SVG from core output. Lute output is always derived (`convertPiece(piece)`), never stored.

**Tech Stack:** Vite 5, TypeScript 5 (strict), React 18, vite-plugin-pwa 0.21, pdfjs-dist 4, tonal 6, Vitest 2, Playwright 1.

**Spec:** `docs/superpowers/specs/2026-11-19-guitar-to-lute-design.md` — read it before starting any task.

## Global Constraints

- Fully client-side; no backend, no network calls at runtime other than loading the app itself.
- Runtime dependencies are limited to: `react`, `react-dom`, `tonal`, `pdfjs-dist`. Dev: `vite`, `@vitejs/plugin-react`, `typescript`, `vitest`, `vite-plugin-pwa`, `@playwright/test`, `@types/react`, `@types/react-dom`, `@types/node`.
- TypeScript `strict: true`; `npm run typecheck` must pass at the end of every task.
- Course/string index 0 = course/string 1 = highest. Stored 0-based; displayed 1-based.
- Guitar tab import is 6-string only.
- Defaults: `maxFret` 8, `maxStretch` 4, `transpose` 0 (range −12..+12), notation `french`.
- French fret letters: a b c d e f g h i k l m n (no `j`). Italian: 0–9, `X` for 10.
- Playability: fret span ≤ `maxStretch`; at most 4 stopping fingers (a barré counts as one); courses ≥ `frettedCourses` are open-only.
- Tab DP keeps the top K = 8 candidates per column; chord boxes return up to 3 voicings.
- Candidate enumeration visits at most 5000 assignments per search (`ENUMERATION_CAP`) and prunes branches that cannot beat the current K-th best (branch-and-bound). This replaces the spec's "200 candidates" cap with a bound on work done; ranking still keeps only the best K.
- A column that does not fit as written may move notes by octaves and drop notes; the cheapest result wins. Drop penalties follow the musical role (duplicate 4 < octave doubling 7 < inner voice 10 < top 16 < bass 20 < pinned 30) against a shift penalty of 5, and an octave shift into unison with another note is never allowed.
- Stored/exported JSON carries `schemaVersion: 1`.
- Workbox `maximumFileSizeToCacheInBytes` = 5 MB.
- No customer data, PII or other sensitive data in fixtures, tests or commits.
- Every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (preceded by a blank line).

## Review Focus

1. **Tab lines with labels of different widths** (`e |`, `D#|`, `e  |`): columns must still align → test in Task 6 (`aligns columns when label widths differ`).
2. **Empty input** (new piece, no chords, no tab; chord box with every string muted/unset): conversion and every view must render without throwing → tests in Task 11 (`empty piece`, `all-muted chord`) and Task 21 (`renders empty states`).
3. **Changing lute tuning after pinning notes**: stale pins must become warnings, never crashes → test in Task 11 (`stale pin after tuning change`).
4. **Corrupted localStorage** (bad index JSON, bad piece JSON, valid JSON with the wrong shape, piece from a newer schema): app must still start → tests in Task 14 (`corrupt index`, `corrupt piece`, `rejects data that parses but has the wrong shape`), Task 18 (`skips corrupt pieces`, `skips a stored piece that is valid JSON but the wrong shape`) and the `ErrorBoundary` recovery screen in Task 23.
5. **Long tabs** (≈1000 columns pasted from a full song): conversion and Auto transpose must stay interactive → test in Task 11 (`converts 1000 columns quickly`, which also times `autoTranspose`).

---

## File Map

```
package.json, tsconfig.json, vite.config.ts, playwright.config.ts, index.html, .gitignore
public/icon.svg
src/main.tsx                      app bootstrap + service worker registration
src/styles.css                    all styling (tokens, light/dark, print)
src/core/model.ts                 all shared types + emptyOverrides()
src/core/pitch.ts                 MIDI ↔ names, pitch classes, key-aware spelling
src/core/tunings.ts               presets, name/label tuning inference, tuning edits
src/core/piece.ts                 newPiece, guitar pitch helpers
src/core/notation.ts              fret/diapason glyph tables
src/core/chordName.ts             chord detection + transposition
src/core/parse/normalize.ts       text cleanup
src/core/parse/headers.ts         capo / tuning headers
src/core/parse/asciiTab.ts        ASCII tab → TabEvent[]
src/core/parse/importText.ts      headers + parser + label tuning → TextImport
src/core/asciiRender.ts           TabEvent[] → ASCII lines (guitar tab view)
src/core/convert/types.ts         Limits, SolvedNote, ColumnCandidate
src/core/convert/playability.ts   span, fingers, barré
src/core/convert/candidates.ts    placements, pins, octave options, assignment enumeration (branch-and-bound)
src/core/convert/cost.ts          WEIGHTS, placement + transition cost
src/core/convert/column.ts        solveColumn (role-based drop penalties, shift/drop search, alternatives)
src/core/convert/viterbi.ts       DP over columns
src/core/convert/convert.ts       convertPiece, limitsOf, placementCycle, nextPlacement, cycleNote
src/core/convert/autoTranspose.ts autoTranspose
src/core/edit.ts                  pure Piece edit helpers
src/core/tabcode.ts               LuteResult → TabCode
src/core/storage.ts               PieceStore, migrate, import/export JSON
src/core/luteTabLayout.ts         LuteTabEvent[] → positioned glyphs
src/import/pdfText.ts             pure PDF text reconstruction
src/import/pdf.ts                 pdfjs loader (lazy)
src/audio/pluck.ts                Karplus-Strong, steps, Player
src/ui/util.ts                    clampInt, download helpers
src/ui/state.ts                   usePieces hook
src/ui/*.tsx                      components (see Tasks 18–23)
tests/**                          Vitest tests mirroring src/
e2e/**                            Playwright tests
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`, `public/icon.svg`, `src/main.tsx`, `src/ui/App.tsx`, `src/styles.css`
- Test: `tests/ui/App.test.tsx`

**Interfaces:**
- Produces: `npm test`, `npm run typecheck`, `npm run build`, `npm run dev`; `App` component exported from `src/ui/App.tsx` (rewritten in Task 23).

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "guitar-to-lute",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -p tsconfig.json && vite build",
    "preview": "vite preview --port 4173 --strictPort",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.json",
    "e2e": "playwright test"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install react@18 react-dom@18 tonal@6 pdfjs-dist@4
npm install -D vite@5 @vitejs/plugin-react@4 typescript@5 vitest@2 vite-plugin-pwa@0.21 @types/react@18 @types/react-dom@18 @types/node@22 @playwright/test@1
```
Expected: both complete without errors; `package-lock.json` created.

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "types": ["vite/client", "vite-plugin-pwa/client", "node"]
  },
  "include": ["src", "tests", "e2e", "vite.config.ts", "playwright.config.ts"]
}
```

- [ ] **Step 4: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Guitar to Lute',
        short_name: 'Guitar→Lute',
        description: 'Convert guitar chord boxes and tab to lute tablature',
        theme_color: '#6b4423',
        background_color: '#fbf7ef',
        display: 'standalone',
        start_url: '.',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ['**/*.{js,mjs,css,html,svg,woff2}'],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
```

- [ ] **Step 5: Create `index.html`, `public/icon.svg`, `.gitignore`**

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#6b4423" />
    <link rel="icon" href="/icon.svg" type="image/svg+xml" />
    <title>Guitar to Lute</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`public/icon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#6b4423"/>
  <ellipse cx="220" cy="300" rx="130" ry="150" fill="#e9c98f"/>
  <circle cx="220" cy="290" r="34" fill="#6b4423"/>
  <rect x="300" y="90" width="44" height="190" rx="10" transform="rotate(35 322 185)" fill="#e9c98f"/>
</svg>
```

`.gitignore`:
```
node_modules
dist
dev-dist
test-results
playwright-report
*.local
```

- [ ] **Step 6: Write the failing test `tests/ui/App.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from '../../src/ui/App';

describe('App scaffold', () => {
  it('renders the app title', () => {
    expect(renderToStaticMarkup(<App />)).toContain('Guitar → Lute');
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run tests/ui/App.test.tsx`
Expected: FAIL — cannot resolve `../../src/ui/App`.

- [ ] **Step 8: Create `src/ui/App.tsx`, `src/main.tsx`, `src/styles.css`**

`src/ui/App.tsx` (temporary; fully rewritten in Task 23):
```tsx
export function App() {
  return <h1>Guitar → Lute</h1>;
}
```

`src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './ui/App';
import './styles.css';

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/styles.css` (replaced in Task 23):
```css
body { margin: 0; font-family: system-ui, sans-serif; }
```

- [ ] **Step 9: Run tests, typecheck and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: 1 test passes; typecheck clean; build writes `dist/` including `sw.js` and `manifest.webmanifest`.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TS PWA

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Model types and pitch maths

**Files:**
- Create: `src/core/model.ts`, `src/core/pitch.ts`
- Test: `tests/core/pitch.test.ts`

**Interfaces:**
- Produces (model.ts): `Midi`, `Tuning`, `StringState`, `ChordShape`, `TabNote`, `TabColumn`, `TabEvent`, `Placement`, `Notation`, `LuteSettings`, `Overrides`, `SCHEMA_VERSION`, `Piece`, `WarningKind`, `Warning`, `LuteNote`, `LuteVoicing`, `LuteChord`, `LuteColumn`, `LuteTabEvent`, `LuteResult`, `emptyOverrides(): Overrides`.
- Produces (pitch.ts): `pitchClass(m: number): number`, `octaveOf(m: Midi): number`, `pcName(pc: number, flats?: boolean): string`, `midiToName(m: Midi, flats?: boolean, withOctave?: boolean): string`, `parsePitchClass(s: string): number | null`, `nameToMidi(s: string): Midi | null`, `prettyName(s: string): string`, `preferFlats(pitches: Midi[]): boolean`.

- [ ] **Step 1: Create `src/core/model.ts`**

```ts
export type Midi = number;

export interface Tuning {
  id: string;
  name: string;
  /** index 0 = course/string 1 = highest */
  courses: Midi[];
  /** courses with index >= this are open-only (diapasons) */
  frettedCourses: number;
}

/** fret number (0 = open), 'x' = muted, null = unset */
export type StringState = number | 'x' | null;

export interface ChordShape {
  name: string;
  /** per guitar string, index 0 = high e */
  frets: StringState[];
  /** first fret shown in the diagram (1 = nut) */
  baseFret: number;
}

export interface TabNote { string: number; fret: number; }
export interface TabColumn { notes: TabNote[]; x: number; src?: { line: number; col: number }; }
export type TabEvent = { kind: 'col'; col: TabColumn } | { kind: 'bar' } | { kind: 'break' };

export interface Placement { course: number; fret: number; }

export type Notation = 'french' | 'italian' | 'modern';

export interface LuteSettings {
  tuning: Tuning;
  transpose: number;
  maxFret: number;
  maxStretch: number;
  notation: Notation;
}

export interface Overrides {
  chordVoicing: Record<number, number>;
  chordPins: Record<number, Record<number, Placement>>;
  tabPins: Record<number, Record<number, Placement>>;
}

export const SCHEMA_VERSION = 1 as const;

export interface Piece {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  title: string;
  updatedAt: string;
  guitar: {
    tuning: Tuning;
    capo: number;
    chords: ChordShape[];
    tab: TabEvent[];
    sourceText?: string;
  };
  lute: LuteSettings;
  overrides: Overrides;
}

export type WarningKind = 'parse' | 'pdf' | 'shift' | 'inversion' | 'drop' | 'pin';

export interface Warning {
  kind: WarningKind;
  message: string;
  /** 1-based source text line */
  line?: number;
  /** 1-based source text column */
  textColumn?: number;
  /** 0-based tab column index */
  tabColumn?: number;
  /** 0-based chord index */
  chord?: number;
}

export interface LuteNote {
  placement: Placement;
  /** sounding pitch (input pitch + transpose + shifted) */
  pitch: Midi;
  /** octave shift applied: 0, ±12, ±24 */
  shifted: number;
  pinned: boolean;
  /** index of the note in the guitar input (chord sounding strings / tab column notes) */
  srcNoteIndex: number;
}

export interface LuteVoicing { notes: LuteNote[]; dropped: Midi[]; cost: number; }
export interface LuteChord { name: string; voicings: LuteVoicing[]; chosen: number; }
export interface LuteColumn { kind: 'col'; index: number; x: number; notes: LuteNote[]; dropped: Midi[]; }
export type LuteTabEvent = LuteColumn | { kind: 'bar' } | { kind: 'break' };

export interface LuteResult {
  chords: LuteChord[];
  tab: LuteTabEvent[];
  warnings: Warning[];
  totalCost: number;
  stats: { shifted: number; dropped: number };
  flats: boolean;
}

export function emptyOverrides(): Overrides {
  return { chordVoicing: {}, chordPins: {}, tabPins: {} };
}
```

- [ ] **Step 2: Write the failing test `tests/core/pitch.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { midiToName, nameToMidi, parsePitchClass, prettyName, preferFlats, octaveOf, pitchClass } from '../../src/core/pitch';

describe('pitch', () => {
  it('converts MIDI to names', () => {
    expect(midiToName(64)).toBe('E4');
    expect(midiToName(70)).toBe('A#4');
    expect(midiToName(70, true)).toBe('Bb4');
    expect(midiToName(43, false, false)).toBe('G');
  });
  it('parses note names', () => {
    expect(nameToMidi('G2')).toBe(43);
    expect(nameToMidi('Bb1')).toBe(34);
    expect(nameToMidi('Cb4')).toBe(59);
    expect(nameToMidi('F#3')).toBe(54);
    expect(nameToMidi('H2')).toBeNull();
    expect(parsePitchClass('e')).toBe(4);
    expect(parsePitchClass('Eb')).toBe(3);
    expect(parsePitchClass('X')).toBeNull();
  });
  it('handles pitch classes and octaves', () => {
    expect(pitchClass(-1)).toBe(11);
    expect(octaveOf(60)).toBe(4);
  });
  it('prettifies accidentals', () => {
    expect(prettyName('Bb')).toBe('B♭');
    expect(prettyName('F#m')).toBe('F♯m');
  });
  it('prefers sharps for sharp keys and flats otherwise', () => {
    expect(preferFlats([40, 47, 52, 56, 59, 64])).toBe(false); // E major chord
    expect(preferFlats([58, 62, 65])).toBe(true); // Bb major chord
    expect(preferFlats([])).toBe(true);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/core/pitch.test.ts`
Expected: FAIL — cannot resolve `../../src/core/pitch`.

- [ ] **Step 4: Implement `src/core/pitch.ts`**

```ts
import type { Midi } from './model';

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function pitchClass(m: number): number {
  return ((m % 12) + 12) % 12;
}

export function octaveOf(m: Midi): number {
  return Math.floor(m / 12) - 1;
}

export function pcName(pc: number, flats = false): string {
  return (flats ? FLAT_NAMES : SHARP_NAMES)[pitchClass(pc)];
}

export function midiToName(m: Midi, flats = false, withOctave = true): string {
  const name = pcName(m, flats);
  return withOctave ? `${name}${octaveOf(m)}` : name;
}

function accidental(a: string): number {
  if (a === '#' || a === '♯') return 1;
  if (a === 'b' || a === '♭') return -1;
  return 0;
}

export function parsePitchClass(s: string): number | null {
  const m = /^([A-Ga-g])([#b♯♭]?)$/.exec(s.trim());
  if (!m) return null;
  return pitchClass(LETTER_PC[m[1].toUpperCase()] + accidental(m[2]));
}

export function nameToMidi(s: string): Midi | null {
  const m = /^([A-Ga-g])([#b♯♭]?)(-?\d)$/.exec(s.trim());
  if (!m) return null;
  return (Number(m[3]) + 1) * 12 + LETTER_PC[m[1].toUpperCase()] + accidental(m[2]);
}

export function prettyName(s: string): string {
  return s.replace(/#/g, '♯').replace(/([A-G])b/g, '$1♭');
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
/** tie-break order: C, then flat keys, then sharp keys */
const TONIC_ORDER = [0, 5, 10, 3, 8, 1, 7, 2, 9, 4, 11, 6];
const SHARP_KEYS = new Set([7, 2, 9, 4, 11, 6]);

/** Pick the major key that contains most of the pitches; flats unless that key is a sharp key. */
export function preferFlats(pitches: Midi[]): boolean {
  if (pitches.length === 0) return true;
  const pcs = pitches.map(pitchClass);
  let best = 0;
  let bestScore = -1;
  for (const t of TONIC_ORDER) {
    const scale = new Set(MAJOR.map((i) => (t + i) % 12));
    const score = pcs.filter((pc) => scale.has(pc)).length;
    if (score > bestScore) {
      best = t;
      bestScore = score;
    }
  }
  return !SHARP_KEYS.has(best);
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run tests/core/pitch.test.ts && npm run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/core/model.ts src/core/pitch.ts tests/core/pitch.test.ts
git commit -m "feat(core): model types and pitch maths

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Tunings and piece helpers

**Files:**
- Create: `src/core/tunings.ts`, `src/core/piece.ts`
- Test: `tests/core/tunings.test.ts`, `tests/core/piece.test.ts`

**Interfaces:**
- Consumes: `nameToMidi`, `pitchClass`, `midiToName` (Task 2); model types.
- Produces (tunings.ts): `GUITAR_PRESETS: Tuning[]`, `LUTE_PRESETS: Tuning[]`, `STANDARD_GUITAR: Tuning`, `DEFAULT_LUTE: Tuning`, `findPreset(id: string): Tuning | undefined`, `cloneTuning(t: Tuning): Tuning`, `guitarTuningByName(name: string): Tuning | null`, `inferGuitarTuning(pcsHighToLow: number[]): Tuning`, `addBassCourse(t: Tuning): Tuning`, `removeBassCourse(t: Tuning): Tuning`, `setCoursePitch(t: Tuning, course: number, midi: Midi): Tuning`, `setFrettedCourses(t: Tuning, n: number): Tuning`.
- Produces (piece.ts): `newId(): string`, `newPiece(title?: string): Piece`, `chordPitches(shape: ChordShape, tuning: Tuning, capo: number): { pitch: Midi; string: number }[]` (high string first), `columnPitches(col: TabColumn, tuning: Tuning, capo: number): Midi[]`, `guitarColumns(piece: Piece): { x: number; pitches: Midi[]; index: number }[]`.

- [ ] **Step 1: Write the failing tests**

`tests/core/tunings.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  LUTE_PRESETS, GUITAR_PRESETS, findPreset, guitarTuningByName, inferGuitarTuning,
  addBassCourse, removeBassCourse, setCoursePitch, setFrettedCourses,
} from '../../src/core/tunings';

describe('tuning presets', () => {
  it('defines the Renaissance G lute', () => {
    expect(findPreset('lute-6-g')!.courses).toEqual([67, 62, 57, 53, 48, 43]);
    expect(findPreset('lute-6-g')!.frettedCourses).toBe(6);
  });
  it('defines 7-, 8- and 10-course lutes with 7 fretted courses', () => {
    expect(findPreset('lute-7-g')!.courses.slice(6)).toEqual([41]);
    expect(findPreset('lute-8-g')!.courses.slice(6)).toEqual([41, 38]);
    expect(findPreset('lute-10-g')!.courses.slice(6)).toEqual([41, 39, 38, 36]);
    for (const id of ['lute-7-g', 'lute-8-g', 'lute-10-g']) expect(findPreset(id)!.frettedCourses).toBe(7);
  });
  it('defines the Baroque 13-course D minor lute', () => {
    const t = findPreset('lute-13-baroque-dm')!;
    expect(t.courses).toEqual([65, 62, 57, 53, 50, 45, 43, 41, 40, 38, 36, 35, 33]);
    expect(t.frettedCourses).toBe(6);
  });
  it('has 6 guitar presets and 5 lute presets', () => {
    expect(GUITAR_PRESETS).toHaveLength(6);
    expect(LUTE_PRESETS).toHaveLength(5);
  });
});

describe('guitar tuning detection', () => {
  it('matches names', () => {
    expect(guitarTuningByName('Drop D')!.courses).toEqual([64, 59, 55, 50, 45, 38]);
    expect(guitarTuningByName('DADGAD')!.courses).toEqual([62, 57, 55, 50, 45, 38]);
    expect(guitarTuningByName('Half step down (Eb)')!.id).toBe('guitar-half-down');
    expect(guitarTuningByName('Standard (E A D G B E)')!.id).toBe('guitar-standard');
    expect(guitarTuningByName('nonsense')).toBeNull();
  });
  it('infers tuning from string labels (high to low)', () => {
    expect(inferGuitarTuning([4, 11, 7, 2, 9, 4]).id).toBe('guitar-standard');
    expect(inferGuitarTuning([4, 11, 7, 2, 9, 2]).id).toBe('guitar-drop-d');
    const custom = inferGuitarTuning([4, 11, 7, 2, 7, 2]);
    expect(custom.id).toBe('guitar-custom');
    expect(custom.courses).toEqual([64, 59, 55, 50, 43, 38]);
  });
});

describe('tuning edits', () => {
  const six = findPreset('lute-6-g')!;
  it('adds bass courses on the next natural note down', () => {
    const seven = addBassCourse(six);
    expect(seven.courses.slice(6)).toEqual([41]);
    expect(addBassCourse(seven).courses.slice(6)).toEqual([41, 40]);
    expect(seven.frettedCourses).toBe(6);
    expect(seven.id).toBe('lute-custom');
  });
  it('never removes below 6 courses', () => {
    expect(removeBassCourse(six)).toBe(six);
    const eight = findPreset('lute-8-g')!;
    const seven = removeBassCourse(eight);
    expect(seven.courses).toHaveLength(7);
    expect(seven.frettedCourses).toBe(7);
  });
  it('edits course pitch and fretted count', () => {
    expect(setCoursePitch(six, 5, 41).courses[5]).toBe(41);
    expect(setFrettedCourses(six, 3).frettedCourses).toBe(3);
  });
});
```

`tests/core/piece.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { newPiece, chordPitches, columnPitches, guitarColumns } from '../../src/core/piece';
import { STANDARD_GUITAR } from '../../src/core/tunings';

describe('piece helpers', () => {
  it('creates a new piece with defaults', () => {
    const p = newPiece('Test');
    expect(p.schemaVersion).toBe(1);
    expect(p.title).toBe('Test');
    expect(p.guitar.tuning.id).toBe('guitar-standard');
    expect(p.guitar.capo).toBe(0);
    expect(p.lute.tuning.id).toBe('lute-6-g');
    expect(p.lute).toMatchObject({ transpose: 0, maxFret: 8, maxStretch: 4, notation: 'french' });
    expect(p.overrides).toEqual({ chordVoicing: {}, chordPins: {}, tabPins: {} });
    expect(newPiece().id).not.toBe(p.id);
  });
  it('computes chord pitches, skipping muted and unset strings', () => {
    const am = { name: '', frets: [0, 1, 2, 2, 0, 'x' as const], baseFret: 1 };
    expect(chordPitches(am, STANDARD_GUITAR, 0)).toEqual([
      { pitch: 64, string: 0 }, { pitch: 60, string: 1 }, { pitch: 57, string: 2 },
      { pitch: 52, string: 3 }, { pitch: 45, string: 4 },
    ]);
    expect(chordPitches(am, STANDARD_GUITAR, 2)[0].pitch).toBe(66);
    expect(chordPitches({ name: '', frets: [null, null, null, null, null, null], baseFret: 1 }, STANDARD_GUITAR, 0)).toEqual([]);
  });
  it('computes column pitches and indexes guitar columns', () => {
    expect(columnPitches({ notes: [{ string: 5, fret: 3 }], x: 0 }, STANDARD_GUITAR, 1)).toEqual([44]);
    const p = newPiece();
    p.guitar.tab = [
      { kind: 'col', col: { notes: [{ string: 0, fret: 0 }], x: 2 } },
      { kind: 'bar' },
      { kind: 'col', col: { notes: [{ string: 1, fret: 1 }], x: 5 } },
    ];
    expect(guitarColumns(p)).toEqual([{ x: 2, pitches: [64], index: 0 }, { x: 5, pitches: [60], index: 1 }]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/core/tunings.test.ts tests/core/piece.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/core/tunings.ts`**

```ts
import type { Midi, Tuning } from './model';
import { nameToMidi, pitchClass, midiToName } from './pitch';

function mk(id: string, name: string, notes: string[], fretted = notes.length): Tuning {
  return {
    id,
    name,
    courses: notes.map((n) => {
      const m = nameToMidi(n);
      if (m === null) throw new Error(`Bad note ${n}`);
      return m;
    }),
    frettedCourses: fretted,
  };
}

const REN = ['G4', 'D4', 'A3', 'F3', 'C3', 'G2'];

export const GUITAR_PRESETS: Tuning[] = [
  mk('guitar-standard', 'Standard (E A D G B E)', ['E4', 'B3', 'G3', 'D3', 'A2', 'E2']),
  mk('guitar-drop-d', 'Drop D', ['E4', 'B3', 'G3', 'D3', 'A2', 'D2']),
  mk('guitar-dadgad', 'DADGAD', ['D4', 'A3', 'G3', 'D3', 'A2', 'D2']),
  mk('guitar-open-g', 'Open G', ['D4', 'B3', 'G3', 'D3', 'G2', 'D2']),
  mk('guitar-open-d', 'Open D', ['D4', 'A3', 'F#3', 'D3', 'A2', 'D2']),
  mk('guitar-half-down', 'Half-step down (E♭)', ['Eb4', 'Bb3', 'Gb3', 'Db3', 'Ab2', 'Eb2']),
];

export const LUTE_PRESETS: Tuning[] = [
  mk('lute-6-g', 'Renaissance 6-course in G', REN, 6),
  mk('lute-7-g', 'Renaissance 7-course in G', [...REN, 'F2'], 7),
  mk('lute-8-g', 'Renaissance 8-course in G', [...REN, 'F2', 'D2'], 7),
  mk('lute-10-g', 'Renaissance 10-course in G', [...REN, 'F2', 'Eb2', 'D2', 'C2'], 7),
  mk('lute-13-baroque-dm', 'Baroque 13-course D minor',
    ['F4', 'D4', 'A3', 'F3', 'D3', 'A2', 'G2', 'F2', 'E2', 'D2', 'C2', 'B1', 'A1'], 6),
];

export const STANDARD_GUITAR = GUITAR_PRESETS[0];
export const DEFAULT_LUTE = LUTE_PRESETS[0];

export function cloneTuning(t: Tuning): Tuning {
  return { ...t, courses: [...t.courses] };
}

export function findPreset(id: string): Tuning | undefined {
  const t = [...GUITAR_PRESETS, ...LUTE_PRESETS].find((p) => p.id === id);
  return t ? cloneTuning(t) : undefined;
}

const ALIASES: Record<string, string> = {
  standard: 'guitar-standard',
  estandard: 'guitar-standard',
  eadgbe: 'guitar-standard',
  dropd: 'guitar-drop-d',
  dadgbe: 'guitar-drop-d',
  dadgad: 'guitar-dadgad',
  openg: 'guitar-open-g',
  dgdgbd: 'guitar-open-g',
  opend: 'guitar-open-d',
  'dadf#ad': 'guitar-open-d',
  halfstepdown: 'guitar-half-down',
  halfstep: 'guitar-half-down',
  ebstandard: 'guitar-half-down',
  eb: 'guitar-half-down',
  ebabdbgbbbeb: 'guitar-half-down',
};

export function guitarTuningByName(name: string): Tuning | null {
  const key = name
    .toLowerCase()
    .replace(/♭/g, 'b')
    .replace(/♯/g, '#')
    .replace(/[\s\-_().,:]/g, '')
    .replace(/tuning$/, '');
  let id = ALIASES[key];
  if (!id) {
    const prefix = Object.keys(ALIASES)
      .filter((a) => a.length >= 5 && key.startsWith(a))
      .sort((a, b) => b.length - a.length)[0];
    if (prefix) id = ALIASES[prefix];
  }
  return id ? findPreset(id) ?? null : null;
}

/** Labels give pitch classes; place each in the octave nearest the standard-tuning string. */
export function inferGuitarTuning(pcsHighToLow: number[]): Tuning {
  const std = STANDARD_GUITAR.courses;
  const courses = pcsHighToLow.map((pc, i) => {
    const base = std[i];
    let d = pitchClass(pc - base);
    if (d > 5) d -= 12;
    return base + d;
  });
  const match = GUITAR_PRESETS.find((t) => t.courses.every((m, i) => m === courses[i]));
  if (match) return cloneTuning(match);
  const label = [...courses].reverse().map((m) => midiToName(m, false, false)).join(' ');
  return { id: 'guitar-custom', name: `Custom (${label})`, courses, frettedCourses: 6 };
}

const NATURAL = new Set([0, 2, 4, 5, 7, 9, 11]);

function custom(t: Tuning, patch: Partial<Tuning>): Tuning {
  return { ...t, ...patch, id: 'lute-custom', name: 'Custom' };
}

export function addBassCourse(t: Tuning): Tuning {
  let m = t.courses[t.courses.length - 1] - 1;
  while (!NATURAL.has(pitchClass(m))) m--;
  return custom(t, { courses: [...t.courses, m] });
}

export function removeBassCourse(t: Tuning): Tuning {
  if (t.courses.length <= 6) return t;
  const courses = t.courses.slice(0, -1);
  return custom(t, { courses, frettedCourses: Math.min(t.frettedCourses, courses.length) });
}

export function setCoursePitch(t: Tuning, course: number, midi: Midi): Tuning {
  const courses = [...t.courses];
  courses[course] = midi;
  return custom(t, { courses });
}

export function setFrettedCourses(t: Tuning, n: number): Tuning {
  return custom(t, { frettedCourses: Math.max(1, Math.min(t.courses.length, n)) });
}
```

- [ ] **Step 4: Implement `src/core/piece.ts`**

```ts
import { emptyOverrides, SCHEMA_VERSION } from './model';
import type { ChordShape, Midi, Piece, TabColumn, Tuning } from './model';
import { STANDARD_GUITAR, DEFAULT_LUTE, cloneTuning } from './tunings';

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function newPiece(title = 'Untitled'): Piece {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId(),
    title,
    updatedAt: new Date().toISOString(),
    guitar: { tuning: cloneTuning(STANDARD_GUITAR), capo: 0, chords: [], tab: [] },
    lute: { tuning: cloneTuning(DEFAULT_LUTE), transpose: 0, maxFret: 8, maxStretch: 4, notation: 'french' },
    overrides: emptyOverrides(),
  };
}

/** Sounding strings of a chord shape, high string first. */
export function chordPitches(shape: ChordShape, tuning: Tuning, capo: number): { pitch: Midi; string: number }[] {
  const out: { pitch: Midi; string: number }[] = [];
  shape.frets.forEach((f, s) => {
    if (typeof f === 'number' && s < tuning.courses.length) out.push({ pitch: tuning.courses[s] + capo + f, string: s });
  });
  return out;
}

export function columnPitches(col: TabColumn, tuning: Tuning, capo: number): Midi[] {
  return col.notes.map((n) => tuning.courses[n.string] + capo + n.fret);
}

export function guitarColumns(piece: Piece): { x: number; pitches: Midi[]; index: number }[] {
  const out: { x: number; pitches: Midi[]; index: number }[] = [];
  for (const ev of piece.guitar.tab) {
    if (ev.kind === 'col') {
      out.push({ x: ev.col.x, pitches: columnPitches(ev.col, piece.guitar.tuning, piece.guitar.capo), index: out.length });
    }
  }
  return out;
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run tests/core && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/tunings.ts src/core/piece.ts tests/core/tunings.test.ts tests/core/piece.test.ts
git commit -m "feat(core): guitar/lute tuning presets and piece helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Notation glyphs and chord names

**Files:**
- Create: `src/core/notation.ts`, `src/core/chordName.ts`
- Test: `tests/core/notation.test.ts`, `tests/core/chordName.test.ts`

**Interfaces:**
- Consumes: `pcName`, `parsePitchClass` (Task 2).
- Produces (notation.ts): `FRENCH_FRETS: string[]`, `ITALIAN_FRETS: string[]`, `fretGlyph(fret: number, notation: Notation): string`, `noteGlyph(course: number, fret: number, notation: Notation): string` (course 0-based).
- Produces (chordName.ts): `detectChordName(pitches: Midi[], flats: boolean): string`, `transposeChordName(name: string, semis: number, flats: boolean): string`.

- [ ] **Step 1: Write the failing tests**

`tests/core/notation.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { FRENCH_FRETS, fretGlyph, noteGlyph } from '../../src/core/notation';

describe('fret glyphs', () => {
  it('uses French letters without j', () => {
    expect(FRENCH_FRETS).not.toContain('j');
    expect(fretGlyph(0, 'french')).toBe('a');
    expect(fretGlyph(8, 'french')).toBe('i');
    expect(fretGlyph(9, 'french')).toBe('k');
  });
  it('uses X for fret 10 in Italian', () => {
    expect(fretGlyph(3, 'italian')).toBe('3');
    expect(fretGlyph(10, 'italian')).toBe('X');
  });
  it('uses plain numbers in modern', () => {
    expect(fretGlyph(10, 'modern')).toBe('10');
  });
});

describe('diapason glyphs (0-based course index)', () => {
  it('writes the fretted 7th course as a normal fret glyph', () => {
    expect(noteGlyph(6, 2, 'french')).toBe('c');
    expect(noteGlyph(6, 2, 'italian')).toBe('2');
  });
  it('writes French open diapasons with slashes then numerals', () => {
    expect(noteGlyph(7, 0, 'french')).toBe('/a');
    expect(noteGlyph(8, 0, 'french')).toBe('//a');
    expect(noteGlyph(9, 0, 'french')).toBe('///a');
    expect(noteGlyph(10, 0, 'french')).toBe('4');
    expect(noteGlyph(12, 0, 'french')).toBe('6');
  });
  it('writes Italian diapasons as course numbers and modern as frets', () => {
    expect(noteGlyph(7, 0, 'italian')).toBe('8');
    expect(noteGlyph(12, 0, 'italian')).toBe('13');
    expect(noteGlyph(7, 0, 'modern')).toBe('0');
  });
});
```

`tests/core/chordName.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { detectChordName, transposeChordName } from '../../src/core/chordName';

describe('detectChordName', () => {
  it('names common chords', () => {
    expect(detectChordName([40, 47, 52, 56, 59, 64], false)).toBe('E');
    expect(detectChordName([45, 52, 57, 60, 64], false)).toBe('Am');
    expect(detectChordName([43, 47, 50, 53], false)).toBe('G7');
    expect(detectChordName([58, 62, 65], true)).toBe('Bb');
  });
  it('handles power chords, single notes and empty input', () => {
    expect(detectChordName([43, 50], false)).toBe('G5');
    expect(detectChordName([60], false)).toBe('C');
    expect(detectChordName([], false)).toBe('');
  });
});

describe('transposeChordName', () => {
  it('transposes root, quality and bass', () => {
    expect(transposeChordName('E', 3, true)).toBe('G');
    expect(transposeChordName('Am', 3, true)).toBe('Cm');
    expect(transposeChordName('D/F#', 3, true)).toBe('F/A');
    expect(transposeChordName('E7', 1, true)).toBe('F7');
    expect(transposeChordName('C', 1, false)).toBe('C#');
    expect(transposeChordName('C', 1, true)).toBe('Db');
    expect(transposeChordName('weird', 2, true)).toBe('weird');
    expect(transposeChordName('Am', 0, true)).toBe('Am');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/core/notation.test.ts tests/core/chordName.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/core/notation.ts`**

```ts
import type { Notation } from './model';

/** fret 0..12; French tablature skips j */
export const FRENCH_FRETS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'k', 'l', 'm', 'n'];
/** fret 0..12; X = 10, overlined digits for 11 and 12 */
export const ITALIAN_FRETS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'X', '1̄', '2̄'];

export function fretGlyph(fret: number, notation: Notation): string {
  if (notation === 'french') return FRENCH_FRETS[fret] ?? String(fret);
  if (notation === 'italian') return ITALIAN_FRETS[fret] ?? String(fret);
  return String(fret);
}

/**
 * Glyph for a note on 0-based course `course`.
 * Courses 0-6 (1st-7th) use the fret glyph (the 7th course is drawn on a ledger line by the layout).
 * French diapasons: 8th = /a, 9th = //a, 10th = ///a, 11th+ = 4, 5, 6 ...
 * Italian diapasons: the course number. Modern: the fret number (each course has its own line).
 */
export function noteGlyph(course: number, fret: number, notation: Notation): string {
  if (course <= 6 || notation === 'modern') return fretGlyph(fret, notation);
  if (notation === 'french') {
    if (course <= 9) return '/'.repeat(course - 6) + fretGlyph(fret, 'french');
    return fret === 0 ? String(course - 6) : `${course - 6}${fretGlyph(fret, 'french')}`;
  }
  return fret === 0 ? String(course + 1) : `${course + 1}:${fretGlyph(fret, 'italian')}`;
}
```

- [ ] **Step 4: Implement `src/core/chordName.ts`**

```ts
import { Chord } from 'tonal';
import type { Midi } from './model';
import { pcName, parsePitchClass } from './pitch';

function tidy(name: string): string {
  return name.replace(/^([A-G][#b]?)M(\/[A-G][#b]?)?$/, '$1$2');
}

export function detectChordName(pitches: Midi[], flats: boolean): string {
  const sorted = [...pitches].sort((a, b) => a - b);
  const names: string[] = [];
  for (const p of sorted) {
    const n = pcName(p, flats);
    if (!names.includes(n)) names.push(n);
  }
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  const found = Chord.detect(names);
  if (found.length > 0) return tidy(found[0]);
  if (names.length === 2 && (sorted[sorted.length - 1] - sorted[0]) % 12 === 7) return `${names[0]}5`;
  return '';
}

export function transposeChordName(name: string, semis: number, flats: boolean): string {
  if (semis === 0) return name;
  const m = /^([A-G][#b♯♭]?)(.*?)(?:\/([A-G][#b♯♭]?))?$/.exec(name.trim());
  if (!m) return name;
  const root = parsePitchClass(m[1]);
  if (root === null) return name;
  let out = pcName(root + semis, flats) + m[2];
  if (m[3]) {
    const bass = parsePitchClass(m[3]);
    if (bass !== null) out += `/${pcName(bass + semis, flats)}`;
  }
  return out;
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run tests/core && npm run typecheck`
Expected: PASS. If `detectChordName([43, 50])` returns something other than `G5` because tonal returns a different power-chord symbol, keep the test and normalise in `tidy` (`/^([A-G][#b]?)5$/` stays as is; map any tonal alias for the power chord to `<root>5`).

- [ ] **Step 6: Commit**

```bash
git add src/core/notation.ts src/core/chordName.ts tests/core/notation.test.ts tests/core/chordName.test.ts
git commit -m "feat(core): lute notation glyphs and chord naming

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Text normalisation and header parsing

**Files:**
- Create: `src/core/parse/normalize.ts`, `src/core/parse/headers.ts`
- Test: `tests/core/parse/normalize.test.ts`, `tests/core/parse/headers.test.ts`

**Interfaces:**
- Consumes: `guitarTuningByName`, `inferGuitarTuning` (Task 3), `parsePitchClass` (Task 2).
- Produces: `expandTabs(line: string, width?: number): string`, `normalizeTabText(input: string): string`, `TabHeaders = { capo: number | null; tuning: Tuning | null }`, `parseHeaders(text: string): TabHeaders`.

- [ ] **Step 1: Write the failing tests**

`tests/core/parse/normalize.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { expandTabs, normalizeTabText } from '../../../src/core/parse/normalize';

describe('normalizeTabText', () => {
  it('normalises line endings', () => {
    expect(normalizeTabText('a\r\nb\rc')).toBe('a\nb\nc');
  });
  it('expands tab characters to 8-column stops', () => {
    expect(expandTabs('ab\tc')).toBe('ab      c');
    expect(expandTabs('\tx')).toBe('        x');
  });
  it('replaces unicode dashes and non-breaking spaces', () => {
    expect(normalizeTabText('e|–—‐−‒| ')).toBe('e|-----| ');
  });
  it('rewrites repeat marks while keeping column widths', () => {
    expect(normalizeTabText('e|:--0--:|')).toBe('e|---0---|');
    expect(normalizeTabText('B|*-1-*|')).toBe('B|--1--|');
    expect(normalizeTabText('‖--0--‖')).toBe('|--0--|');
  });
});
```

`tests/core/parse/headers.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseHeaders } from '../../../src/core/parse/headers';

describe('parseHeaders', () => {
  it('reads capo in common forms', () => {
    expect(parseHeaders('Capo 2').capo).toBe(2);
    expect(parseHeaders('capo: 3rd fret').capo).toBe(3);
    expect(parseHeaders('Capo on 5th fret').capo).toBe(5);
    expect(parseHeaders('No capo').capo).toBe(0);
    expect(parseHeaders('nothing here').capo).toBeNull();
  });
  it('reads tuning by name or note list', () => {
    expect(parseHeaders('Tuning: Drop D').tuning!.id).toBe('guitar-drop-d');
    expect(parseHeaders('tuning - DADGAD').tuning!.id).toBe('guitar-dadgad');
    expect(parseHeaders('Tuning: D A D G B E').tuning!.id).toBe('guitar-drop-d');
    expect(parseHeaders('Tuning: Eb Ab Db Gb Bb Eb').tuning!.id).toBe('guitar-half-down');
    expect(parseHeaders('no tuning line').tuning).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/core/parse`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/core/parse/normalize.ts`**

```ts
export function expandTabs(line: string, width = 8): string {
  let out = '';
  for (const ch of line) {
    if (ch === '\t') out += ' '.repeat(width - (out.length % width));
    else out += ch;
  }
  return out;
}

/** Clean text before parsing. Repeat marks are rewritten without changing column widths. */
export function normalizeTabText(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) =>
      expandTabs(line)
        .replace(/ /g, ' ')
        .replace(/[‐-―−]/g, '-')
        .replace(/‖/g, '|')
        .replace(/\|:/g, '|-')
        .replace(/:\|/g, '-|')
        .replace(/\*\|/g, '-|')
        .replace(/\|\*/g, '|-'),
    )
    .join('\n');
}
```

- [ ] **Step 4: Implement `src/core/parse/headers.ts`**

```ts
import type { Tuning } from '../model';
import { parsePitchClass } from '../pitch';
import { guitarTuningByName, inferGuitarTuning } from '../tunings';

export interface TabHeaders { capo: number | null; tuning: Tuning | null; }

const NOTE_LIST = /^(?:[A-Ga-g][#b♯♭]?[\s,\-]*){6}$/;

export function parseHeaders(text: string): TabHeaders {
  let capo: number | null = null;
  const capoMatch = /\bcapo\b[^\d\n]{0,15}(\d{1,2})/i.exec(text);
  if (capoMatch) {
    const n = Number(capoMatch[1]);
    if (n >= 0 && n <= 12) capo = n;
  }
  if (/\bno\s+capo\b/i.test(text)) capo = 0;

  let tuning: Tuning | null = null;
  const tm = /^\s*tuning\s*[:\-]?\s*(.+?)\s*$/im.exec(text);
  if (tm) {
    tuning = guitarTuningByName(tm[1]);
    if (!tuning && NOTE_LIST.test(tm[1])) {
      const notes = tm[1].match(/[A-Ga-g][#b♯♭]?/g) ?? [];
      const pcs = notes.map((n) => parsePitchClass(n));
      if (pcs.every((p) => p !== null)) tuning = inferGuitarTuning((pcs as number[]).reverse());
    }
  }
  return { capo, tuning };
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run tests/core && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/parse tests/core/parse
git commit -m "feat(parse): text normalisation and capo/tuning headers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: ASCII tab parser

**Files:**
- Create: `src/core/parse/asciiTab.ts`, `src/core/parse/importText.ts`
- Test: `tests/core/parse/asciiTab.test.ts`, `tests/core/parse/fixtures.ts`

**Interfaces:**
- Consumes: `normalizeTabText` (Task 5), `parseHeaders` (Task 5), `inferGuitarTuning` (Task 3), `parsePitchClass` (Task 2).
- Produces: `AsciiParseResult = { events: TabEvent[]; warnings: Warning[]; labels: number[] | null }`, `parseAsciiTab(raw: string): AsciiParseResult`; `TextImport = { events: TabEvent[]; warnings: Warning[]; tuning: Tuning | null; capo: number | null }`, `importTabText(text: string): TextImport`.
- Behaviour: each 6-line block ends with a `{kind:'break'}`; `x` accumulates across blocks (`xOffset += blockWidth + 4`); notes in a column are sorted by string; `src.line`/`src.col` and warning `line` are 1-based. Labels may be followed by `|`, `-` or `:`; text after the last barline (`|  let ring`, `| PM`) is ignored. A run of tab-like lines that is not a multiple of 6 is split into the best-scoring 6-line windows (labels, equal lengths, shared barlines, no count lines) and one warning lists the skipped lines.

- [ ] **Step 1: Create the fixtures `tests/core/parse/fixtures.ts`**

```ts
export const AM_ARPEGGIO = [
  'e|-------0---|',
  'B|-----1---1-|',
  'G|---2-------|',
  'D|-----------|',
  'A|-0---------|',
  'E|-----------|',
].join('\n');

export const TWO_DIGIT = [
  'e|--10--12--|',
  'B|---8---10-|',
  'G|----------|',
  'D|----------|',
  'A|----------|',
  'E|----------|',
].join('\n');

const messyTab = [
  '|--7b9--5--x--<12>--|',
  '|-------------------|',
  '|-------------------|',
  '|-------------------|',
  '|-------------------|',
  '|-------------------|',
].map((l) => l.replace(/-/g, '–'));
export const MESSY = ['Capo 2', 'Tuning: Drop D', '', ...messyTab].join('\r\n');

export const WITH_LYRICS_AND_COUNTS = [
  'Am        G',
  '|---1---2---|',
  'e|---0---3---|',
  'B|---1---0---|',
  'G|---2---0---|',
  'D|---2---0---|',
  'A|---0---2---|',
  'E|-------3---|',
  'la la la',
].join('\n');

export const TWO_BLOCKS_NO_GAP = [AM_ARPEGGIO, AM_ARPEGGIO].join('\n');

export const MIXED_LABEL_WIDTHS = [
  'e  |--0--|',
  'B |--1--|',
  'G |--0--|',
  'D#|--2--|',
  'A |--3--|',
  'E |-----|',
].join('\n');

export const REPEATS = [
  'e|:--0--:|  x4',
  'B|:-----:|',
  'G|:-----:|',
  'D|:-----:|',
  'A|:-----:|',
  'E|:-----:|',
].join('\n');

/** Real-world variations that must not lose blocks or shift strings. */
export const TRAILING_TEXT = [
  'e|-------0---|  let ring',
  'B|-----1---1-| PM',
  'G|---2-------|',
  'D|-----------|',
  'A|-0---------|  (x2)',
  'E|-----------|',
].join('\n');

export const COLON_LABELS = AM_ARPEGGIO.replace(/^([eBGDAE])\|/gm, '$1:');

export const TWO_BLOCKS_AND_COUNT = [AM_ARPEGGIO, AM_ARPEGGIO, '|-1---2---3---4|'].join('\n');

export const COUNT_ABOVE_UNLABELLED = ['|---1-----2--|', ...AM_ARPEGGIO.split('\n').map((l) => l.slice(1))].join('\n');

export const WITH_TAB_CHARACTERS = AM_ARPEGGIO.split('\n').map((l) => `\t${l}`).join('\r\n');
```

- [ ] **Step 2: Write the failing test `tests/core/parse/asciiTab.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { parseAsciiTab } from '../../../src/core/parse/asciiTab';
import { importTabText } from '../../../src/core/parse/importText';
import type { TabEvent } from '../../../src/core/model';
import * as F from './fixtures';

const cols = (events: TabEvent[]) => events.flatMap((e) => (e.kind === 'col' ? [e.col.notes] : []));

describe('parseAsciiTab', () => {
  it('parses a simple labelled block with a closing barline', () => {
    const r = parseAsciiTab(F.AM_ARPEGGIO);
    expect(r.events.map((e) => e.kind)).toEqual(['col', 'col', 'col', 'col', 'col', 'bar', 'break']);
    expect(cols(r.events)).toEqual([
      [{ string: 4, fret: 0 }], [{ string: 2, fret: 2 }], [{ string: 1, fret: 1 }],
      [{ string: 0, fret: 0 }], [{ string: 1, fret: 1 }],
    ]);
    expect(r.events.flatMap((e) => (e.kind === 'col' ? [e.col.x] : []))).toEqual([2, 4, 6, 8, 10]);
    expect(r.labels).toEqual([4, 11, 7, 2, 9, 4]);
    expect(r.warnings).toEqual([]);
    const first = r.events[0];
    expect(first.kind === 'col' && first.col.src).toEqual({ line: 5, col: 4 });
  });

  it('groups two-digit frets with overlapping single digits', () => {
    expect(cols(parseAsciiTab(F.TWO_DIGIT).events)).toEqual([
      [{ string: 0, fret: 10 }, { string: 1, fret: 8 }],
      [{ string: 0, fret: 12 }, { string: 1, fret: 10 }],
    ]);
  });

  it('handles CRLF, unicode dashes, bends, dead notes and harmonics', () => {
    const r = parseAsciiTab(F.MESSY);
    expect(cols(r.events)).toEqual([[{ string: 0, fret: 7 }], [{ string: 0, fret: 5 }]]);
    expect(r.warnings.some((w) => /harmonic/i.test(w.message) && w.line === 4)).toBe(true);
  });

  it('skips lyrics/chord lines and picks the labelled 6 lines from a 7-line run', () => {
    const r = parseAsciiTab(F.WITH_LYRICS_AND_COUNTS);
    expect(cols(r.events)).toEqual([
      [{ string: 0, fret: 0 }, { string: 1, fret: 1 }, { string: 2, fret: 2 }, { string: 3, fret: 2 }, { string: 4, fret: 0 }],
      [{ string: 0, fret: 3 }, { string: 1, fret: 0 }, { string: 2, fret: 0 }, { string: 3, fret: 0 }, { string: 4, fret: 2 }, { string: 5, fret: 3 }],
    ]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0].line).toBe(2);
  });

  it('splits consecutive blocks and accumulates x', () => {
    const r = parseAsciiTab(F.TWO_BLOCKS_NO_GAP);
    expect(r.events.filter((e) => e.kind === 'break')).toHaveLength(2);
    const xs = r.events.flatMap((e) => (e.kind === 'col' ? [e.col.x] : []));
    expect(xs).toHaveLength(10);
    expect(xs[5]).toBeGreaterThan(xs[4]);
  });

  it('aligns columns when label widths differ', () => {
    expect(cols(parseAsciiTab(F.MIXED_LABEL_WIDTHS).events)).toEqual([
      [{ string: 0, fret: 0 }, { string: 1, fret: 1 }, { string: 2, fret: 0 }, { string: 3, fret: 2 }, { string: 4, fret: 3 }],
    ]);
  });

  it('handles repeat marks and trailing repeat counts', () => {
    const r = parseAsciiTab(F.REPEATS);
    expect(r.events.map((e) => e.kind)).toEqual(['col', 'bar', 'break']);
    expect(cols(r.events)).toEqual([[{ string: 0, fret: 0 }]]);
  });

  it('warns when nothing is found', () => {
    const r = parseAsciiTab('just some words\nand more');
    expect(r.events).toEqual([]);
    expect(r.warnings[0].message).toMatch(/No guitar tab found/);
  });

  it('warns about short runs of tab-like lines', () => {
    const r = parseAsciiTab('e|--0--|\nB|--1--|\nG|--2--|');
    expect(r.events).toEqual([]);
    expect(r.warnings.some((w) => /expected 6/.test(w.message))).toBe(true);
  });
});

describe('parseAsciiTab — real-world variations', () => {
  const am = cols(parseAsciiTab(F.AM_ARPEGGIO).events);
  it('ignores text after the closing barline', () => {
    expect(cols(parseAsciiTab(F.TRAILING_TEXT).events)).toEqual(am);
  });
  it('accepts labels followed by a colon', () => {
    expect(cols(parseAsciiTab(F.COLON_LABELS).events)).toEqual(am);
  });
  it('keeps both blocks when a count line follows them', () => {
    const r = parseAsciiTab(F.TWO_BLOCKS_AND_COUNT);
    expect(cols(r.events)).toEqual([...am, ...am]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0].line).toBe(13);
  });
  it('does not take a count line above an unlabelled block as string 1', () => {
    const r = parseAsciiTab(F.COUNT_ABOVE_UNLABELLED);
    expect(cols(r.events)).toEqual(am);
    expect(r.warnings[0].line).toBe(1);
  });
  it('expands tab characters and CRLF line endings', () => {
    expect(cols(parseAsciiTab(F.WITH_TAB_CHARACTERS).events)).toEqual(am);
  });
});

describe('importTabText', () => {
  it('combines headers, parse and label tuning', () => {
    const r = importTabText(F.MESSY);
    expect(r.capo).toBe(2);
    expect(r.tuning!.id).toBe('guitar-drop-d');
    expect(cols(r.events)).toHaveLength(2);
  });
  it('infers tuning from labels when there is no header', () => {
    expect(importTabText(F.AM_ARPEGGIO).tuning!.id).toBe('guitar-standard');
  });
  it('returns null tuning when there are no labels or headers', () => {
    expect(importTabText(F.MESSY.replace('Tuning: Drop D', '')).tuning).toBeNull();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/core/parse/asciiTab.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement `src/core/parse/asciiTab.ts`**

```ts
import type { TabEvent, TabNote, Warning } from '../model';
import { normalizeTabText } from './normalize';
import { parsePitchClass } from '../pitch';

export interface AsciiParseResult { events: TabEvent[]; warnings: Warning[]; labels: number[] | null; }

interface LineInfo { index: number; label: string | null; body: string; origin: number; isTab: boolean; }
interface Token { string: number; start: number; end: number; fret: number; }

const LABEL_RE = /^\s*([A-Ga-g][#b]?)\s*(?=[|:\-])/;
const TAB_CHAR = /[-0-9|:hpbr/\\~x()<>sn^.*]/;
const TRAILING_ANNOTATION = /\s+(?:x\s*\d+|\d+\s*x|\(?repeat\b.*)$/i;

function analyzeLine(text: string, index: number): LineInfo {
  const m = LABEL_RE.exec(text);
  const label = m ? m[1] : null;
  const start = m ? m[0].length : 0;
  let origin = -1;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === '|' || c === '-' || c === ':') { origin = i; break; }
    if (c !== ' ') break;
  }
  if (origin < 0) return { index, label, body: '', origin: 0, isTab: false };
  let body = text.slice(origin).replace(/\s+$/, '');
  // Text after the last barline ("|  let ring", "|PM", "| Am") is an annotation, not tab.
  const lastBar = body.lastIndexOf('|');
  const rest = lastBar > 0 ? body.slice(lastBar + 1) : '';
  if (rest && (/^\s/.test(rest) || /[A-Za-z]{2,}/.test(rest))) body = body.slice(0, lastBar + 1);
  body = body.replace(TRAILING_ANNOTATION, '');
  let tabChars = 0;
  let dashes = 0;
  for (const c of body) {
    if (TAB_CHAR.test(c)) tabChars++;
    if (c === '-') dashes++;
  }
  const isTab = body.length >= 4 && dashes >= 3 && tabChars / body.length >= 0.6;
  return { index, label, body, origin, isTab };
}

/** Lines like "|--1--2--3--|" that only count beats. */
function isCountLike(body: string): boolean {
  const nums = (body.match(/\d+/g) ?? []).map(Number);
  return nums.length > 0 && nums.every((n, k) => n === k + 1);
}

/** How much six lines look like one block: labels, equal lengths, shared barlines, no count lines. */
function windowScore(w: LineInfo[]): number {
  const mode = <T,>(xs: T[]) => {
    const counts = new Map<T, number>();
    for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
    return Math.max(...counts.values());
  };
  const bars = w.map((l) => [...l.body].flatMap((c, k) => (c === '|' ? [k] : [])).join(','));
  return (
    w.filter((l) => l.label).length +
    mode(w.map((l) => l.body.length)) +
    mode(bars) -
    w.filter((l) => isCountLike(l.body)).length
  );
}

/**
 * Splits a run of tab-like lines into 6-line blocks. When the run has extra lines (count lines,
 * annotations), each block is the best-scoring window at that point and the rest are skipped.
 */
function blocksFromRun(run: LineInfo[]): { blocks: LineInfo[][]; skipped: LineInfo[] } {
  const blocks: LineInfo[][] = [];
  const skipped: LineInfo[] = [];
  let s = 0;
  while (s + 6 <= run.length) {
    const spare = (run.length - s) % 6;
    let best = s;
    for (let t = s + 1; t <= s + spare; t++) {
      if (windowScore(run.slice(t, t + 6)) > windowScore(run.slice(best, best + 6))) best = t;
    }
    skipped.push(...run.slice(s, best));
    blocks.push(run.slice(best, best + 6));
    s = best + 6;
  }
  skipped.push(...run.slice(s));
  return { blocks, skipped };
}

function parseBlock(block: LineInfo[], xOffset: number): { events: TabEvent[]; width: number; warnings: Warning[] } {
  const warnings: Warning[] = [];
  const tokens: Token[] = [];
  const barCounts = new Map<number, number>();
  let width = 0;

  block.forEach((line, s) => {
    const body = line.body;
    width = Math.max(width, body.length);
    let skipNext = false;
    let harmonic = false;
    let c = 0;
    while (c < body.length) {
      const ch = body[c];
      if (ch >= '0' && ch <= '9') {
        let e = c;
        while (e + 1 < body.length && body[e + 1] >= '0' && body[e + 1] <= '9') e++;
        const digits = body.slice(c, e + 1);
        const pieces = Number(digits) <= 24
          ? [{ start: c, end: e, fret: Number(digits) }]
          : [...digits].map((d, k) => ({ start: c + k, end: c + k, fret: Number(d) }));
        for (const p of pieces) {
          if (skipNext) { skipNext = false; continue; }
          if (harmonic) {
            warnings.push({
              kind: 'parse',
              message: `Natural harmonic at fret ${p.fret} dropped.`,
              line: line.index + 1,
              textColumn: line.origin + p.start + 1,
            });
            continue;
          }
          tokens.push({ string: s, ...p });
        }
        skipNext = false;
        harmonic = false;
        c = e + 1;
        continue;
      }
      if (ch === 'b' || ch === 'r') skipNext = true;
      else if (ch === '<' || ch === 'n') harmonic = true;
      else if (ch === '>') harmonic = false;
      else if (ch === '-' || ch === '|') {
        skipNext = false;
        harmonic = false;
        if (ch === '|') barCounts.set(c, (barCounts.get(c) ?? 0) + 1);
      }
      c++;
    }
  });

  tokens.sort((a, b) => a.start - b.start || a.string - b.string);
  interface Group { start: number; end: number; notes: TabNote[]; strings: Set<number>; firstString: number; }
  const groups: Group[] = [];
  for (const t of tokens) {
    const g = groups[groups.length - 1];
    if (g && t.start <= g.end && !g.strings.has(t.string)) {
      g.end = Math.max(g.end, t.end);
      g.notes.push({ string: t.string, fret: t.fret });
      g.strings.add(t.string);
    } else {
      groups.push({ start: t.start, end: t.end, notes: [{ string: t.string, fret: t.fret }], strings: new Set([t.string]), firstString: t.string });
    }
  }

  const bars = [...barCounts.entries()].filter(([col, n]) => col > 0 && n >= 4).map(([col]) => col).sort((a, b) => a - b);
  const events: TabEvent[] = [];
  const pushBar = () => {
    if (events.length && events[events.length - 1].kind !== 'bar') events.push({ kind: 'bar' });
  };
  let bi = 0;
  for (const g of groups) {
    while (bi < bars.length && bars[bi] < g.start) { pushBar(); bi++; }
    const srcLine = block[g.firstString];
    events.push({
      kind: 'col',
      col: {
        notes: g.notes.sort((a, b) => a.string - b.string),
        x: xOffset + g.start,
        src: { line: srcLine.index + 1, col: srcLine.origin + g.start + 1 },
      },
    });
  }
  while (bi < bars.length) { pushBar(); bi++; }
  return { events, width, warnings };
}

export function parseAsciiTab(raw: string): AsciiParseResult {
  const infos = normalizeTabText(raw).split('\n').map(analyzeLine);
  const warnings: Warning[] = [];
  const events: TabEvent[] = [];
  let labels: number[] | null = null;
  let xOffset = 0;
  let i = 0;
  while (i < infos.length) {
    if (!infos[i].isTab) { i++; continue; }
    let j = i;
    while (j < infos.length && infos[j].isTab) j++;
    const run = infos.slice(i, j);
    const { blocks, skipped } = blocksFromRun(run);
    if (blocks.length === 0) {
      if (run.length >= 3) {
        warnings.push({ kind: 'parse', message: `Found ${run.length} tab-like lines (expected 6); skipped.`, line: run[0].index + 1 });
      }
    } else {
      if (skipped.length) {
        const lines = skipped.map((l) => l.index + 1).join(', ');
        warnings.push({
          kind: 'parse',
          message: `Ignored line(s) ${lines} next to the tab (count or annotation lines?). If notes ended up on the wrong strings, delete the extra lines and import again.`,
          line: skipped[0].index + 1,
        });
      }
      for (const block of blocks) {
        const parsed = parseBlock(block, xOffset);
        events.push(...parsed.events, { kind: 'break' });
        warnings.push(...parsed.warnings);
        xOffset += parsed.width + 4;
        if (!labels && block.every((l) => l.label)) labels = block.map((l) => parsePitchClass(l.label!)!);
      }
    }
    i = j;
  }
  if (events.length === 0) {
    warnings.push({ kind: 'parse', message: 'No guitar tab found. Expected blocks of 6 lines like "e|--0--3--|".' });
  }
  return { events, warnings, labels };
}
```

Note: in `WITH_LYRICS_AND_COUNTS` the extra-line warning's `line` is the first line of the run (line 2, the count line), which the test asserts.

- [ ] **Step 5: Implement `src/core/parse/importText.ts`**

```ts
import type { TabEvent, Tuning, Warning } from '../model';
import { parseAsciiTab } from './asciiTab';
import { parseHeaders } from './headers';
import { inferGuitarTuning } from '../tunings';

export interface TextImport { events: TabEvent[]; warnings: Warning[]; tuning: Tuning | null; capo: number | null; }

export function importTabText(text: string): TextImport {
  const headers = parseHeaders(text);
  const parsed = parseAsciiTab(text);
  let tuning = headers.tuning;
  if (!tuning && parsed.labels && parsed.labels.length === 6) tuning = inferGuitarTuning(parsed.labels);
  return { events: parsed.events, warnings: parsed.warnings, tuning, capo: headers.capo };
}
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run tests/core && npm run typecheck`
Expected: PASS. If a fixture assertion fails, debug the parser (do not edit fixture expectations unless you can show the fixture comment/expectation itself is wrong).

- [ ] **Step 7: Commit**

```bash
git add src/core/parse tests/core/parse
git commit -m "feat(parse): ASCII guitar tab parser with header/label tuning

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 7: ASCII rendering of guitar tab

**Files:**
- Create: `src/core/asciiRender.ts`
- Test: `tests/core/asciiRender.test.ts`

**Interfaces:**
- Consumes: `TabEvent`, `Tuning` (Task 2), `midiToName` (Task 2), `parseAsciiTab` (Task 6, tests only).
- Produces: `splitSystems(events: TabEvent[]): TabEvent[][]` (splits at `break`, drops empty systems), `tuningLabels(t: Tuning): string[]` (high string first; lower-cases the first label when it duplicates the last, e.g. `e`), `renderAsciiSystem(system: TabEvent[], labels: string[]): string[]`.

- [ ] **Step 1: Write the failing test `tests/core/asciiRender.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { splitSystems, tuningLabels, renderAsciiSystem } from '../../src/core/asciiRender';
import { parseAsciiTab } from '../../src/core/parse/asciiTab';
import { STANDARD_GUITAR } from '../../src/core/tunings';
import type { TabEvent } from '../../src/core/model';
import { AM_ARPEGGIO, TWO_DIGIT, TWO_BLOCKS_NO_GAP } from './parse/fixtures';

const cols = (events: TabEvent[]) => events.flatMap((e) => (e.kind === 'col' ? [e.col.notes] : []));

describe('asciiRender', () => {
  it('labels standard tuning', () => {
    expect(tuningLabels(STANDARD_GUITAR)).toEqual(['e', 'B', 'G', 'D', 'A', 'E']);
  });
  it('splits systems at breaks', () => {
    expect(splitSystems(parseAsciiTab(TWO_BLOCKS_NO_GAP).events)).toHaveLength(2);
    expect(splitSystems([])).toEqual([]);
  });
  it('renders equal-length rows', () => {
    const rows = renderAsciiSystem(splitSystems(parseAsciiTab(AM_ARPEGGIO).events)[0], tuningLabels(STANDARD_GUITAR));
    expect(rows).toHaveLength(6);
    expect(new Set(rows.map((r) => r.length)).size).toBe(1);
    expect(rows[0].startsWith('e|')).toBe(true);
    expect(rows[0].endsWith('|')).toBe(true);
  });
  for (const [name, fixture] of [['arpeggio', AM_ARPEGGIO], ['two-digit', TWO_DIGIT]] as const) {
    it(`round-trips ${name} through the parser`, () => {
      const first = parseAsciiTab(fixture);
      const text = renderAsciiSystem(splitSystems(first.events)[0], tuningLabels(STANDARD_GUITAR)).join('\n');
      expect(cols(parseAsciiTab(text).events)).toEqual(cols(first.events));
    });
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/asciiRender.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/core/asciiRender.ts`**

```ts
import type { TabEvent, Tuning } from './model';
import { midiToName } from './pitch';

export function splitSystems(events: TabEvent[]): TabEvent[][] {
  const out: TabEvent[][] = [];
  let cur: TabEvent[] = [];
  for (const e of events) {
    if (e.kind === 'break') {
      if (cur.length) out.push(cur);
      cur = [];
    } else cur.push(e);
  }
  if (cur.length) out.push(cur);
  return out;
}

export function tuningLabels(t: Tuning): string[] {
  const names = t.courses.map((m) => midiToName(m, false, false));
  if (names.length > 1 && names[0] === names[names.length - 1]) names[0] = names[0].toLowerCase();
  return names;
}

/** Re-create readable ASCII tab from the model. Gaps follow source x spacing, clamped to 2..6 dashes. */
export function renderAsciiSystem(system: TabEvent[], labels: string[]): string[] {
  const w = Math.max(...labels.map((l) => l.length));
  const rows = labels.map((l) => `${l.padEnd(w)}|`);
  let lastX: number | null = null;
  let lastWasBar = false;
  for (const ev of system) {
    if (ev.kind === 'bar') {
      for (let s = 0; s < rows.length; s++) rows[s] += '--|';
      lastX = null;
      lastWasBar = true;
      continue;
    }
    if (ev.kind !== 'col') continue;
    const gap = lastX === null ? 2 : Math.max(2, Math.min(6, ev.col.x - lastX - 1));
    const cw = Math.max(1, ...ev.col.notes.map((n) => String(n.fret).length));
    for (let s = 0; s < rows.length; s++) {
      const note = ev.col.notes.find((n) => n.string === s);
      rows[s] += '-'.repeat(gap) + (note ? String(note.fret).padEnd(cw, '-') : '-'.repeat(cw));
    }
    lastX = ev.col.x + cw - 1;
    lastWasBar = false;
  }
  if (!lastWasBar) for (let s = 0; s < rows.length; s++) rows[s] += '--|';
  return rows;
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/core && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/asciiRender.ts tests/core/asciiRender.test.ts
git commit -m "feat(core): render guitar tab model back to ASCII

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Playability and candidate placements

**Files:**
- Create: `src/core/convert/types.ts`, `src/core/convert/playability.ts`, `src/core/convert/candidates.ts`
- Test: `tests/core/convert/candidates.test.ts`, `tests/core/convert/helpers.ts`

**Interfaces:**
- Consumes: model types, `findPreset` (Task 3, tests).
- Produces (types.ts): `Limits { tuning; maxFret; maxStretch }`, `NoteOption { placement; shifted; pinned }`, `SolvedNote { srcIndex; pitch; shifted; placement; pinned }`, `ColumnCandidate { notes: SolvedNote[]; dropped: { srcIndex: number; pitch: Midi }[]; cost: number; hand: number | null; bass: { course: number; pitch: Midi } | null; key: string }`, `ColumnSolution { candidates: ColumnCandidate[]; badPins: number[] }`.
- Produces (playability.ts): `fretSpan(ps: Placement[]): number`, `fingersNeeded(ps: Placement[]): number`, `isPlayable(ps: Placement[], limits: Limits): boolean`.
- Produces (candidates.ts): `maxFretFor(course, limits): number`, `placementsForPitch(pitch, limits): Placement[]`, `pinShift(pin, pitch, limits): number | null`, `shiftedOptions(pitch, limits): NoteOption[]` (the pitch's own placements, or the nearest octave's when it has none), `octaveOptions(pitch, limits): NoteOption[]` (all placements at shifts 0, +12, −12, +24, −24, in that order), `ENUMERATION_CAP = 5000`, `SearchBound { cost: number[][]; limit: () => number }`, `enumerateAssignments(options: Placement[][], limits, bound?: SearchBound, onLeaf?: (ps: Placement[]) => void): Placement[][]` (each result is aligned with `options`, i.e. `result[i]` is the placement for note `i`; with `bound`, branches whose summed option costs exceed `limit()` are skipped; with `onLeaf`, results are streamed to it and the return value is empty).

- [ ] **Step 1: Create `src/core/convert/types.ts`**

```ts
import type { Midi, Placement, Tuning } from '../model';

export interface Limits { tuning: Tuning; maxFret: number; maxStretch: number; }

export interface NoteOption { placement: Placement; shifted: number; pinned: boolean; }

export interface SolvedNote {
  srcIndex: number;
  /** sounding pitch, including octave shift */
  pitch: Midi;
  shifted: number;
  placement: Placement;
  pinned: boolean;
}

export interface ColumnCandidate {
  notes: SolvedNote[];
  dropped: { srcIndex: number; pitch: Midi }[];
  cost: number;
  /** lowest stopped fret, or null when everything is open */
  hand: number | null;
  /** lowest sounding note */
  bass: { course: number; pitch: Midi } | null;
  /** deterministic tie-break key: "course:fret" per note in srcIndex order */
  key: string;
}

export interface ColumnSolution { candidates: ColumnCandidate[]; badPins: number[]; }
```

- [ ] **Step 2: Create the test helper `tests/core/convert/helpers.ts`**

```ts
import { findPreset } from '../../../src/core/tunings';
import type { Limits } from '../../../src/core/convert/types';

export function limits(id = 'lute-6-g', maxFret = 8, maxStretch = 4): Limits {
  return { tuning: findPreset(id)!, maxFret, maxStretch };
}
```

- [ ] **Step 3: Write the failing test `tests/core/convert/candidates.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { fingersNeeded, fretSpan, isPlayable } from '../../../src/core/convert/playability';
import { placementsForPitch, pinShift, shiftedOptions, octaveOptions, enumerateAssignments } from '../../../src/core/convert/candidates';
import { limits } from './helpers';

const P = (course: number, fret: number) => ({ course, fret });

describe('playability', () => {
  it('measures span over stopped notes only', () => {
    expect(fretSpan([P(0, 0), P(1, 3), P(2, 5)])).toBe(2);
    expect(fretSpan([P(0, 0)])).toBe(0);
  });
  it('counts a barré as one finger', () => {
    expect(fingersNeeded([P(0, 1), P(1, 1), P(2, 2), P(3, 3), P(4, 3), P(5, 1)])).toBe(4);
  });
  it('disallows a barré across an open course', () => {
    expect(fingersNeeded([P(0, 1), P(2, 0), P(3, 1)])).toBe(2);
    expect(fingersNeeded([P(0, 1), P(1, 1), P(2, 0), P(3, 1), P(4, 2), P(5, 3)])).toBe(5);
  });
  it('rejects more than four fingers or too wide a stretch', () => {
    const L = limits();
    expect(isPlayable([P(0, 1), P(1, 2), P(2, 3), P(3, 4), P(4, 2)], L)).toBe(false);
    expect(isPlayable([P(0, 1), P(1, 6)], L)).toBe(false);
    expect(isPlayable([P(0, 1), P(1, 5)], L)).toBe(true);
  });
});

describe('placements', () => {
  it('finds courses for a pitch within maxFret', () => {
    expect(placementsForPitch(67, limits())).toEqual([P(0, 0), P(1, 5)]);
  });
  it('keeps diapasons open-only', () => {
    expect(placementsForPitch(38, limits('lute-8-g'))).toEqual([P(7, 0)]);
    expect(placementsForPitch(40, limits('lute-8-g'))).toEqual([]);
  });
  it('allows a fretted 7th course on Renaissance 7-course', () => {
    expect(placementsForPitch(43, limits('lute-7-g'))).toEqual([P(5, 0), P(6, 2)]);
  });
  it('validates pins at any octave', () => {
    expect(pinShift(P(1, 5), 67, limits())).toBe(0);
    expect(pinShift(P(5, 0), 55, limits())).toBe(-12);
    expect(pinShift(P(0, 3), 67, limits())).toBeNull();
    expect(pinShift(P(9, 0), 67, limits())).toBeNull();
  });
  it('lists every octave placement, unshifted first', () => {
    expect(octaveOptions(67, limits()).map((o) => [o.shifted, o.placement.course, o.placement.fret])).toEqual([
      [0, 0, 0], [0, 1, 5], [-12, 3, 2], [-12, 4, 7], [-24, 5, 0],
    ]);
  });
  it('shifts out-of-range pitches by octaves toward the range', () => {
    expect(shiftedOptions(40, limits())).toEqual([{ placement: P(4, 4), shifted: 12, pinned: false }]);
    expect(shiftedOptions(100, limits())).toEqual([]);
  });
});

describe('enumerateAssignments', () => {
  it('assigns each note to a distinct course', () => {
    const r = enumerateAssignments([[P(0, 0), P(1, 5)], [P(1, 0)]], limits());
    expect(r).toEqual([[P(0, 0), P(1, 0)]]);
  });
  it('returns nothing when two notes need the same only course', () => {
    expect(enumerateAssignments([[P(4, 4)], [P(4, 4)]], limits())).toEqual([]);
  });
  it('returns one empty assignment for no notes', () => {
    expect(enumerateAssignments([], limits())).toEqual([[]]);
  });
  it('skips branches above the bound and can stream results', () => {
    const got: unknown[] = [];
    const r = enumerateAssignments([[P(0, 0), P(1, 5)]], limits(), { cost: [[-0.3, 5]], limit: () => 1 }, (ps) => got.push(ps));
    expect(r).toEqual([]);
    expect(got).toEqual([[P(0, 0)]]);
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run tests/core/convert`
Expected: FAIL — modules not found.

- [ ] **Step 5: Implement `src/core/convert/playability.ts`**

```ts
import type { Placement } from '../model';
import type { Limits } from './types';

export function fretSpan(ps: Placement[]): number {
  const f = ps.filter((p) => p.fret > 0).map((p) => p.fret);
  return f.length ? Math.max(...f) - Math.min(...f) : 0;
}

/** Fingers needed; notes sharing the lowest stopped fret may be barréd if no open course lies between them. */
export function fingersNeeded(ps: Placement[]): number {
  const stopped = ps.filter((p) => p.fret > 0);
  if (stopped.length === 0) return 0;
  const min = Math.min(...stopped.map((p) => p.fret));
  const atMin = stopped.filter((p) => p.fret === min);
  let best = stopped.length;
  if (atMin.length >= 2) {
    const lo = Math.min(...atMin.map((p) => p.course));
    const hi = Math.max(...atMin.map((p) => p.course));
    const blocked = ps.some((p) => p.course > lo && p.course < hi && p.fret === 0);
    if (!blocked) best = Math.min(best, stopped.length - atMin.length + 1);
  }
  return best;
}

export function isPlayable(ps: Placement[], limits: Limits): boolean {
  return (
    new Set(ps.map((p) => p.course)).size === ps.length &&
    fretSpan(ps) <= limits.maxStretch &&
    fingersNeeded(ps) <= 4
  );
}
```

- [ ] **Step 6: Implement `src/core/convert/candidates.ts`**

```ts
import type { Midi, Placement } from '../model';
import type { Limits, NoteOption } from './types';
import { isPlayable } from './playability';

export function maxFretFor(course: number, limits: Limits): number {
  return course < limits.tuning.frettedCourses ? limits.maxFret : 0;
}

export function placementsForPitch(pitch: Midi, limits: Limits): Placement[] {
  const out: Placement[] = [];
  limits.tuning.courses.forEach((open, course) => {
    const fret = pitch - open;
    if (fret >= 0 && fret <= maxFretFor(course, limits)) out.push({ course, fret });
  });
  return out;
}

/** Octave shift a pin implies for this pitch (0, ±12, ±24), or null if the pin cannot play it. */
export function pinShift(pin: Placement, pitch: Midi, limits: Limits): number | null {
  const open = limits.tuning.courses[pin.course];
  if (open === undefined || pin.fret < 0 || pin.fret > maxFretFor(pin.course, limits)) return null;
  const d = open + pin.fret - pitch;
  return d % 12 === 0 && Math.abs(d) <= 24 ? d : null;
}

export function shiftedOptions(pitch: Midi, limits: Limits): NoteOption[] {
  const direct = placementsForPitch(pitch, limits);
  if (direct.length) return direct.map((placement) => ({ placement, shifted: 0, pinned: false }));
  const lowest = Math.min(...limits.tuning.courses);
  const order = pitch < lowest + 12 ? [12, 24, -12, -24] : [-12, -24, 12, 24];
  for (const s of order) {
    const ps = placementsForPitch(pitch + s, limits);
    if (ps.length) return ps.map((placement) => ({ placement, shifted: s, pinned: false }));
  }
  return [];
}

/** Every placement of the pitch itself and of its octaves (0, +12, −12, +24, −24), in that order. */
export function octaveOptions(pitch: Midi, limits: Limits): NoteOption[] {
  const out: NoteOption[] = [];
  for (const s of [0, 12, -12, 24, -24]) {
    for (const placement of placementsForPitch(pitch + s, limits)) out.push({ placement, shifted: s, pinned: false });
  }
  return out;
}

export const ENUMERATION_CAP = 5000;

/** Optional branch-and-bound for enumerateAssignments. */
export interface SearchBound {
  /** additive lower bound on each option's cost, aligned with `options` */
  cost: number[][];
  /** current cut-off, read live: a branch whose lower bound is above it is skipped */
  limit: () => number;
}

/**
 * Playable assignments of one placement per note, each note on its own course.
 * Each result is aligned with `options` (`result[i]` is note i's placement).
 * With `onLeaf`, results are streamed to it instead of collected (the return value is then empty).
 */
export function enumerateAssignments(
  options: Placement[][],
  limits: Limits,
  bound?: SearchBound,
  onLeaf?: (ps: Placement[]) => void,
): Placement[][] {
  const order = options.map((_, i) => i).sort((a, b) => options[a].length - options[b].length || a - b);
  // restMin[k] = cheapest possible cost of the notes order[k..]
  const restMin = new Array<number>(order.length + 1).fill(0);
  if (bound) {
    for (let k = order.length - 1; k >= 0; k--) restMin[k] = restMin[k + 1] + Math.min(...bound.cost[order[k]], Infinity);
  }
  const results: Placement[][] = [];
  const current: Placement[] = new Array(options.length);
  const used = new Set<number>();
  let visited = 0;
  const rec = (k: number, lo: number, hi: number, acc: number) => {
    if (visited >= ENUMERATION_CAP) return;
    if (bound && acc + restMin[k] > bound.limit()) return;
    if (k === order.length) {
      visited++;
      const ps = [...current];
      if (isPlayable(ps, limits)) {
        if (onLeaf) onLeaf(ps);
        else results.push(ps);
      }
      return;
    }
    const i = order[k];
    options[i].forEach((p, j) => {
      if (used.has(p.course)) return;
      let nlo = lo;
      let nhi = hi;
      if (p.fret > 0) {
        nlo = Math.min(lo, p.fret);
        nhi = Math.max(hi, p.fret);
        if (nhi - nlo > limits.maxStretch) return;
      }
      current[i] = p;
      used.add(p.course);
      rec(k + 1, nlo, nhi, acc + (bound ? bound.cost[i][j] : 0));
      used.delete(p.course);
    });
  };
  rec(0, Infinity, -Infinity, 0);
  return results;
}
```

- [ ] **Step 7: Run tests and typecheck**

Run: `npx vitest run tests/core/convert && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/core/convert tests/core/convert
git commit -m "feat(convert): placements, pins and playability checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Costs and column solving (shift / drop / rank)

**Files:**
- Create: `src/core/convert/cost.ts`, `src/core/convert/column.ts`
- Test: `tests/core/convert/cost.test.ts`, `tests/core/convert/column.test.ts`

**Interfaces:**
- Consumes: Task 8 (`Limits`, `ColumnCandidate`, `ColumnSolution`, `NoteOption`, `enumerateAssignments`, `pinShift`, `shiftedOptions`, `octaveOptions`, `fingersNeeded`, `fretSpan`), `pitchClass` (Task 2).
- Produces (cost.ts): `WEIGHTS` (fret 1.0, span 1.5, finger 0.5, open −0.3, shifted 5, dropDuplicate 4, dropDoubling 7, dropInner 10, dropTop 16, dropBass 20, dropPinned 30, highPosition 1.0, highPositionFrom 5, move 1.0, bassReuse 0.5), `handOf(ps: Placement[]): number | null`, `placementCost(ps: Placement[], shiftedCount: number, dropPenalty: number): number` (`dropPenalty` is the already-summed role penalty of the dropped notes), `transitionCost(prevHand: number | null, prevBass: ColumnCandidate['bass'], next: ColumnCandidate): number`.
- Produces (column.ts): `SolveOptions { alternatives?: boolean }`, `solveColumn(pitches: Midi[], limits: Limits, pins?: Record<number, Placement>, k?: number, opts?: SolveOptions): ColumnSolution` — candidates sorted by cost then `key`, at most `k` (default 8), never empty. Pass 1 places every note at its own pitch; only if that fails, pass 2 lets notes move by octaves and tries drop sets smallest first, keeping the cheapest. Musical roles (bass = lowest input pitch, top = highest) come from the input pitches. With `alternatives` (chord boxes) and a full fit, versions without one doubled note are appended after the full-chord candidates.

- [ ] **Step 1: Write the failing tests**

`tests/core/convert/cost.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { WEIGHTS, placementCost, handOf, transitionCost } from '../../../src/core/convert/cost';
import type { ColumnCandidate } from '../../../src/core/convert/types';

const P = (course: number, fret: number) => ({ course, fret });
const cand = (hand: number | null, notes: { course: number; pitch: number }[] = []): ColumnCandidate => ({
  notes: notes.map((n, i) => ({ srcIndex: i, pitch: n.pitch, shifted: 0, placement: P(n.course, 0), pinned: false })),
  dropped: [], cost: 0, hand, bass: null, key: '',
});

describe('cost', () => {
  it('rewards open strings and charges for frets, fingers, shifts and drops', () => {
    expect(placementCost([P(0, 0)], 0, 0)).toBeCloseTo(-0.3);
    expect(placementCost([P(0, 2), P(1, 2)], 0, 0)).toBeCloseTo(4.5);
    expect(placementCost([P(0, 2), P(1, 2)], 1, WEIGHTS.dropInner)).toBeCloseTo(19.5);
  });
  it('charges for high positions above fret 5', () => {
    expect(placementCost([P(0, 7)], 0, 0)).toBeCloseTo(9.5);
  });
  it('finds the hand position', () => {
    expect(handOf([P(0, 0), P(1, 3), P(2, 2)])).toBe(2);
    expect(handOf([P(0, 0)])).toBeNull();
  });
  it('charges hand movement and reusing the held bass course', () => {
    expect(transitionCost(1, null, cand(5))).toBe(4);
    expect(transitionCost(null, null, cand(5))).toBe(0);
    expect(transitionCost(null, { course: 5, pitch: 43 }, cand(null, [{ course: 5, pitch: 45 }]))).toBe(0.5);
    expect(transitionCost(null, { course: 5, pitch: 43 }, cand(null, [{ course: 5, pitch: 43 }]))).toBe(0);
  });
});
```

`tests/core/convert/column.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { solveColumn } from '../../../src/core/convert/column';
import { limits } from './helpers';

const bySrc = <T extends { srcIndex: number }>(ns: T[]) => [...ns].sort((a, b) => a.srcIndex - b.srcIndex);

describe('solveColumn', () => {
  it('finds the classic G-lute shape for a guitar E chord transposed +3', () => {
    const best = solveColumn([67, 62, 59, 55, 50, 43], limits()).candidates[0];
    expect(bySrc(best.notes).map((n) => n.placement)).toEqual([
      { course: 0, fret: 0 }, { course: 1, fret: 0 }, { course: 2, fret: 2 },
      { course: 3, fret: 2 }, { course: 4, fret: 2 }, { course: 5, fret: 0 },
    ]);
    expect(best.dropped).toEqual([]);
  });

  it('shifts a too-low bass up an octave and drops an octave doubling when needed', () => {
    const best = solveColumn([64, 59, 56, 52, 47, 40], limits()).candidates[0];
    expect(best.dropped).toEqual([{ srcIndex: 3, pitch: 52 }]);
    const low = best.notes.find((n) => n.srcIndex === 5)!;
    expect(low.shifted).toBe(12);
    expect(low.pitch).toBe(52);
  });

  it('drops only the doubled B2 from a guitar G chord at transpose 0', () => {
    // B2 and G2 both need course 6; B2 doubles B3, so it is the cheapest note to lose.
    const best = solveColumn([67, 59, 55, 50, 47, 43], limits()).candidates[0];
    expect(best.dropped).toEqual([{ srcIndex: 4, pitch: 47 }]);
    expect(best.notes).toHaveLength(5);
  });

  it('moves a colliding note up an octave rather than dropping it', () => {
    // G2 and A2 both need course 6; A3 on course 3 open costs a shift (5), less than a drop.
    const best = solveColumn([43, 45], limits()).candidates[0];
    expect(best.dropped).toEqual([]);
    expect(bySrc(best.notes).map((n) => [n.pitch, n.shifted, n.placement])).toEqual([
      [43, 0, { course: 5, fret: 0 }],
      [57, 12, { course: 2, fret: 0 }],
    ]);
  });

  it('never shifts a note into unison with another note', () => {
    for (const c of solveColumn([64, 59, 56, 52, 47, 40], limits()).candidates) {
      const ps = c.notes.map((n) => n.pitch);
      expect(new Set(ps).size).toBe(ps.length);
    }
  });

  it('offers alternatives without one doubled note, after the full chord', () => {
    const r = solveColumn([67, 62, 59, 55, 50, 43], limits(), {}, 3, { alternatives: true });
    expect(r.candidates).toHaveLength(3);
    expect(r.candidates[0].dropped).toEqual([]);
    expect(r.candidates[1].dropped).toHaveLength(1);
    expect(r.candidates.slice(1).every((c) => [55, 62, 50].includes(c.dropped[0].pitch))).toBe(true);
  });

  it('keeps bass and top when there are more notes than courses', () => {
    const best = solveColumn([43, 48, 53, 57, 62, 67, 60], limits()).candidates[0];
    expect(best.dropped).toEqual([{ srcIndex: 6, pitch: 60 }]);
    const pitches = best.notes.map((n) => n.pitch);
    expect(pitches).toContain(43);
    expect(pitches).toContain(67);
  });

  it('honours valid pins and reports invalid ones', () => {
    const ok = solveColumn([67], limits(), { 0: { course: 1, fret: 5 } });
    expect(ok.candidates[0].notes[0]).toMatchObject({ placement: { course: 1, fret: 5 }, pinned: true });
    const bad = solveColumn([67], limits(), { 0: { course: 0, fret: 3 } });
    expect(bad.badPins).toEqual([0]);
    expect(bad.candidates[0].notes[0].pinned).toBe(false);
  });

  it('drops unplaceable pitches and never returns an empty candidate list', () => {
    const r = solveColumn([100], limits());
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].notes).toEqual([]);
    expect(r.candidates[0].dropped).toEqual([{ srcIndex: 0, pitch: 100 }]);
    expect(solveColumn([], limits()).candidates).toHaveLength(1);
  });

  it('returns at most k candidates sorted by cost', () => {
    const r = solveColumn([57, 62], limits(), {}, 3);
    expect(r.candidates.length).toBeLessThanOrEqual(3);
    const costs = r.candidates.map((c) => c.cost);
    expect([...costs].sort((a, b) => a - b)).toEqual(costs);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/core/convert`
Expected: FAIL — `cost` and `column` modules not found.

- [ ] **Step 3: Implement `src/core/convert/cost.ts`**

```ts
import type { Placement } from '../model';
import type { ColumnCandidate } from './types';
import { fingersNeeded, fretSpan } from './playability';

export const WEIGHTS = {
  fret: 1.0,
  span: 1.5,
  finger: 0.5,
  open: -0.3,
  shifted: 5,
  /** drop penalties by musical role (see dropPenalty in column.ts) */
  dropDuplicate: 4,
  dropDoubling: 7,
  dropInner: 10,
  dropTop: 16,
  dropBass: 20,
  dropPinned: 30,
  highPosition: 1.0,
  highPositionFrom: 5,
  move: 1.0,
  bassReuse: 0.5,
};

export function handOf(ps: Placement[]): number | null {
  const f = ps.filter((p) => p.fret > 0).map((p) => p.fret);
  return f.length ? Math.min(...f) : null;
}

export function placementCost(ps: Placement[], shiftedCount: number, dropPenalty: number): number {
  const W = WEIGHTS;
  const stopped = ps.filter((p) => p.fret > 0);
  const sumFrets = stopped.reduce((a, p) => a + p.fret, 0);
  const opens = ps.length - stopped.length;
  const low = handOf(ps) ?? 0;
  return (
    sumFrets * W.fret +
    fretSpan(ps) * W.span +
    fingersNeeded(ps) * W.finger +
    opens * W.open +
    shiftedCount * W.shifted +
    dropPenalty +
    Math.max(0, low - W.highPositionFrom) * W.highPosition
  );
}

export function transitionCost(prevHand: number | null, prevBass: ColumnCandidate['bass'], next: ColumnCandidate): number {
  let c = 0;
  if (prevHand !== null && next.hand !== null) c += Math.abs(next.hand - prevHand) * WEIGHTS.move;
  if (prevBass) {
    const n = next.notes.find((x) => x.placement.course === prevBass.course);
    if (n && n.pitch !== prevBass.pitch) c += WEIGHTS.bassReuse;
  }
  return c;
}
```

- [ ] **Step 4: Implement `src/core/convert/column.ts`**

```ts
import type { Midi, Placement } from '../model';
import type { ColumnCandidate, ColumnSolution, Limits, NoteOption } from './types';
import { enumerateAssignments, octaveOptions, pinShift, shiftedOptions } from './candidates';
import { WEIGHTS, handOf, placementCost } from './cost';
import { pitchClass } from '../pitch';

interface NoteIn {
  srcIndex: number;
  /** input pitch (after transpose, before any octave shift) */
  pitch: Midi;
  /** pass 1 options: the pitch itself, or its nearest octave when the pitch has no placement */
  direct: NoteOption[];
  /** pass 2 options: the pitch and all its octaves */
  all: NoteOption[];
  pinned: boolean;
}

interface Roles { bass: NoteIn | undefined; top: NoteIn | undefined; }

/** Musical roles come from the input pitches, so an octave shift never changes which note is the bass or the top. */
function rolesOf(notes: NoteIn[]): Roles {
  const low = [...notes].sort((a, b) => a.pitch - b.pitch || a.srcIndex - b.srcIndex)[0];
  const high = [...notes].sort((a, b) => b.pitch - a.pitch || a.srcIndex - b.srcIndex)[0];
  return { bass: low, top: high };
}

/** Penalty for dropping `n` while `kept` still sound: duplicate < octave doubling < inner voice < top < bass < pinned. */
function dropPenalty(n: NoteIn, kept: NoteIn[], roles: Roles): number {
  if (n.pinned) return WEIGHTS.dropPinned;
  if (n === roles.bass) return WEIGHTS.dropBass;
  if (n === roles.top) return WEIGHTS.dropTop;
  if (kept.some((k) => k.pitch === n.pitch)) return WEIGHTS.dropDuplicate;
  if (kept.some((k) => pitchClass(k.pitch) === pitchClass(n.pitch))) return WEIGHTS.dropDoubling;
  return WEIGHTS.dropInner;
}

/** Additive part of placementCost for one option: a lower bound, since span, finger and position costs are never negative. */
const optionCost = (o: NoteOption) => (o.placement.fret > 0 ? o.placement.fret * WEIGHTS.fret : WEIGHTS.open) + (o.shifted !== 0 ? WEIGHTS.shifted : 0);

const byCost = (a: ColumnCandidate, b: ColumnCandidate) => a.cost - b.cost || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/** Keeps the k cheapest candidates; `limit()` is the cost a newcomer must not exceed. */
class TopK {
  readonly items: ColumnCandidate[] = [];
  constructor(private readonly k: number) {}
  limit(): number {
    return this.items.length < this.k ? Infinity : this.items[this.items.length - 1].cost;
  }
  add(c: ColumnCandidate): void {
    if (c.cost > this.limit()) return;
    let i = this.items.length;
    while (i > 0 && byCost(c, this.items[i - 1]) < 0) i--;
    this.items.splice(i, 0, c);
    if (this.items.length > this.k) this.items.pop();
  }
}

function build(active: NoteIn[], options: NoteOption[][], ps: Placement[], dropped: NoteIn[], penalty: number): ColumnCandidate | null {
  const notes = active.map((n, i) => {
    const opt = options[i].find((o) => o.placement.course === ps[i].course && o.placement.fret === ps[i].fret)!;
    return { srcIndex: n.srcIndex, pitch: n.pitch + opt.shifted, shifted: opt.shifted, placement: ps[i], pinned: opt.pinned };
  });
  // An octave shift that lands in unison with another note is a drop in disguise.
  if (notes.some((a) => a.shifted !== 0 && notes.some((b) => b !== a && b.pitch === a.pitch))) return null;
  const shiftedCount = notes.filter((n) => n.shifted !== 0).length;
  const bassNote = notes.length ? notes.reduce((a, b) => (b.pitch < a.pitch ? b : a)) : null;
  const key = [...notes]
    .sort((a, b) => a.srcIndex - b.srcIndex)
    .map((n) => `${n.placement.course}:${n.placement.fret}`)
    .join(',');
  return {
    notes,
    dropped: [...dropped].sort((a, b) => a.srcIndex - b.srcIndex).map((n) => ({ srcIndex: n.srcIndex, pitch: n.pitch })),
    cost: placementCost(ps, shiftedCount, penalty),
    hand: handOf(ps),
    bass: bassNote ? { course: bassNote.placement.course, pitch: bassNote.pitch } : null,
    key,
  };
}

/** Adds every playable assignment of `active` that could make the top k to `top`. */
function search(active: NoteIn[], pick: 'direct' | 'all', dropped: NoteIn[], penalty: number, limits: Limits, top: TopK): void {
  // Shifted options that would sound in unison with another note's own pitch are never useful.
  const options = active.map((n) => n[pick].filter((o) => o.shifted === 0 || !active.some((m) => m !== n && m.pitch === n.pitch + o.shifted)));
  enumerateAssignments(
    options.map((os) => os.map((o) => o.placement)),
    limits,
    { cost: options.map((os) => os.map(optionCost)), limit: () => top.limit() - penalty },
    (ps) => {
      const c = build(active, options, ps, dropped, penalty);
      if (c) top.add(c);
    },
  );
}

function* subsets<T>(items: T[], size: number, start = 0): Generator<T[]> {
  if (size === 0) {
    yield [];
    return;
  }
  for (let i = start; i <= items.length - size; i++) {
    for (const rest of subsets(items, size - 1, i + 1)) yield [items[i], ...rest];
  }
}

export interface SolveOptions {
  /** chord boxes: when the whole chord fits, also offer versions that leave out one doubled note */
  alternatives?: boolean;
}

/**
 * Pass 1: every note at its own pitch (a note with no placement at all takes its nearest octave).
 * Pass 2, only when pass 1 finds nothing: notes may move by octaves and may be dropped. Drop sets are
 * tried smallest first and the cheapest result wins, so a shift (5) beats dropping a doubling (7),
 * and dropping a doubling beats losing the bass (20). Branch-and-bound keeps only the k cheapest.
 */
export function solveColumn(
  pitches: Midi[],
  limits: Limits,
  pins: Record<number, Placement> = {},
  k = 8,
  opts: SolveOptions = {},
): ColumnSolution {
  const badPins: number[] = [];
  const notes: NoteIn[] = pitches.map((pitch, srcIndex) => {
    const pin = pins[srcIndex];
    if (pin) {
      const s = pinShift(pin, pitch, limits);
      if (s !== null) {
        const only = [{ placement: pin, shifted: s, pinned: true }];
        return { srcIndex, pitch, direct: only, all: only, pinned: true };
      }
      badPins.push(srcIndex);
    }
    return { srcIndex, pitch, direct: shiftedOptions(pitch, limits), all: octaveOptions(pitch, limits), pinned: false };
  });
  const roles = rolesOf(notes);
  const forced = notes.filter((n) => n.all.length === 0);
  const placeable = notes.filter((n) => n.all.length > 0);
  const penaltyOf = (dropped: NoteIn[], kept: NoteIn[]) => dropped.reduce((a, n) => a + dropPenalty(n, kept, roles), 0);
  const forcedPenalty = penaltyOf(forced, placeable);
  const size = Math.max(1, k);

  const primary = new TopK(size);
  search(placeable, 'direct', forced, forcedPenalty, limits, primary);

  const extra = new TopK(size);
  if (primary.items.length === 0) {
    const floor = (kept: number) => kept * WEIGHTS.open; // the cheapest any placement can be
    for (let d = 0; d <= placeable.length; d++) {
      if (forcedPenalty + d * WEIGHTS.dropDuplicate + floor(placeable.length - d) > primary.limit()) break;
      for (const drop of subsets(placeable, d)) {
        const kept = placeable.filter((n) => !drop.includes(n));
        const penalty = penaltyOf([...forced, ...drop], kept);
        if (penalty + floor(kept.length) > primary.limit()) continue;
        search(kept, 'all', [...forced, ...drop], penalty, limits, primary);
      }
    }
  } else if (opts.alternatives) {
    for (const n of placeable) {
      if (n.pinned || n === roles.bass || n === roles.top) continue;
      const kept = placeable.filter((x) => x !== n);
      const penalty = penaltyOf([...forced, n], kept);
      if (penalty > WEIGHTS.dropDoubling) continue;
      search(kept, 'direct', [...forced, n], penalty, limits, extra);
    }
  }

  // Full-chord candidates always come first, so alternatives never replace the default voicing.
  const candidates = [...primary.items, ...extra.items].slice(0, size);
  if (candidates.length === 0) {
    // Only reachable if the enumeration cap cut every search short; never return an empty list.
    candidates.push({ notes: [], dropped: notes.map((n) => ({ srcIndex: n.srcIndex, pitch: n.pitch })), cost: penaltyOf(notes, []), hand: null, bass: null, key: '' });
  }
  return { candidates, badPins };
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run tests/core/convert && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/convert tests/core/convert
git commit -m "feat(convert): cost model and per-column solver with shift/drop

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Viterbi DP over tab columns

**Files:**
- Create: `src/core/convert/viterbi.ts`
- Test: `tests/core/convert/viterbi.test.ts`

**Interfaces:**
- Consumes: `ColumnCandidate` (Task 8), `transitionCost` (Task 9).
- Produces: `ViterbiResult = { path: number[]; cost: number }`, `viterbi(columns: ColumnCandidate[][]): ViterbiResult` — `path[i]` indexes `columns[i]`; ties go to the lower index; an all-open column inherits the previous hand position.

- [ ] **Step 1: Write the failing test `tests/core/convert/viterbi.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { viterbi } from '../../../src/core/convert/viterbi';
import { transitionCost } from '../../../src/core/convert/cost';
import type { ColumnCandidate } from '../../../src/core/convert/types';

const cand = (cost: number, hand: number | null): ColumnCandidate => ({ notes: [], dropped: [], cost, hand, bass: null, key: `${cost}/${hand}` });

function greedy(columns: ColumnCandidate[][]): number {
  let prevHand: number | null = null;
  let total = 0;
  for (const col of columns) {
    let best = col[0];
    let bestCost = Infinity;
    for (const c of col) {
      const t = c.cost + transitionCost(prevHand, null, c);
      if (t < bestCost) { bestCost = t; best = c; }
    }
    total += bestCost;
    prevHand = best.hand ?? prevHand;
  }
  return total;
}

describe('viterbi', () => {
  it('beats greedy when an early choice paints itself into a corner', () => {
    const cols = [[cand(0, 1), cand(0.5, 7)], [cand(0, 7)]];
    expect(greedy(cols)).toBe(6);
    expect(viterbi(cols)).toEqual({ path: [1, 0], cost: 0.5 });
  });
  it('carries the hand position through all-open columns', () => {
    const cols = [[cand(0, 3)], [cand(0, null)], [cand(0, 8), cand(0, 3)]];
    expect(viterbi(cols).path).toEqual([0, 0, 1]);
  });
  it('breaks ties toward the lower index', () => {
    expect(viterbi([[cand(1, null), cand(1, null)]]).path).toEqual([0]);
  });
  it('handles no columns', () => {
    expect(viterbi([])).toEqual({ path: [], cost: 0 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/convert/viterbi.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/core/convert/viterbi.ts`**

```ts
import type { ColumnCandidate } from './types';
import { transitionCost } from './cost';

export interface ViterbiResult { path: number[]; cost: number; }

interface State { cost: number; back: number; hand: number | null; }

export function viterbi(columns: ColumnCandidate[][]): ViterbiResult {
  if (columns.length === 0) return { path: [], cost: 0 };
  const table: State[][] = [columns[0].map((c) => ({ cost: c.cost, back: -1, hand: c.hand }))];
  for (let i = 1; i < columns.length; i++) {
    const prev = table[i - 1];
    const prevCands = columns[i - 1];
    table.push(
      columns[i].map((c) => {
        let best = Infinity;
        let back = 0;
        prev.forEach((ps, k) => {
          const t = ps.cost + transitionCost(ps.hand, prevCands[k].bass, c);
          if (t < best) {
            best = t;
            back = k;
          }
        });
        return { cost: best + c.cost, back, hand: c.hand ?? prev[back].hand };
      }),
    );
  }
  const last = table[table.length - 1];
  let end = 0;
  last.forEach((s, j) => {
    if (s.cost < last[end].cost) end = j;
  });
  const path = new Array<number>(columns.length);
  path[columns.length - 1] = end;
  for (let i = columns.length - 1; i > 0; i--) path[i - 1] = table[i][path[i]].back;
  return { path, cost: last[end].cost };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/core/convert && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/convert/viterbi.ts tests/core/convert/viterbi.test.ts
git commit -m "feat(convert): Viterbi DP over tab columns

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Piece conversion, overrides cycling and auto-transpose

**Files:**
- Create: `src/core/convert/convert.ts`, `src/core/convert/autoTranspose.ts`
- Test: `tests/core/convert/convert.test.ts`

**Interfaces:**
- Consumes: Tasks 2–10 (`chordPitches`, `columnPitches`, `preferFlats`, `midiToName`, `prettyName`, `detectChordName`, `transposeChordName`, `solveColumn`, `viterbi`, `placementsForPitch`).
- Produces (convert.ts): `limitsOf(s: LuteSettings): Limits`, `convertPiece(piece: Piece, transpose?: number): LuteResult`, `placementCycle(pitch: Midi, limits: Limits): { placement: Placement; shifted: number }[]` (order: shifts 0, +12, −12, +24, −24; courses ascending within a shift), `nextPlacement(pitch: Midi, current: Placement, limits: Limits, others?: { placement: Placement; pitch: Midi }[]): Placement` (`pitch` is the *unshifted* input pitch + transpose, i.e. `LuteNote.pitch - LuteNote.shifted`; options on the others' courses, octave shifts into unison with them, and unplayable shapes are skipped), `cycleNote(shown: LuteNote[], srcNoteIndex: number, limits: Limits): Record<number, Placement> | null` (pins for every shown note, with the clicked one moved).
- Produces (autoTranspose.ts): `AUTO_SHIFT_PENALTY = 20`, `AUTO_DROP_PENALTY = 50`, `autoTranspose(piece: Piece): number` (−6..+6; ties: smaller |t|, then positive).
- Behaviour: chord voicings come from `solveColumn(..., k = 3, { alternatives: true })`; `chosen` clamps `overrides.chordVoicing[i]`; a typed chord name is transposed by `capo + transpose` (it names the shape); identical tab columns are solved once (memoised by pitches + pins); warnings: `shift` / `inversion` (bass shifted, or the lowest output note has a different pitch class from the input bass) / `drop` / `pin`, with `chord` or `tabColumn` + `line` set.

- [ ] **Step 1: Write the failing test `tests/core/convert/convert.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { convertPiece, cycleNote, limitsOf, nextPlacement, placementCycle } from '../../../src/core/convert/convert';
import { autoTranspose } from '../../../src/core/convert/autoTranspose';
import { newPiece, columnPitches } from '../../../src/core/piece';
import { parseAsciiTab } from '../../../src/core/parse/asciiTab';
import { findPreset } from '../../../src/core/tunings';
import { AM_ARPEGGIO } from '../parse/fixtures';
import type { ChordShape, LuteColumn, LuteResult, Piece, TabEvent } from '../../../src/core/model';

const E: ChordShape = { name: '', frets: [0, 0, 1, 2, 2, 0], baseFret: 1 };
function piece(chords: ChordShape[] = [], tab?: string): Piece {
  const p = newPiece('t');
  p.guitar.chords = chords;
  if (tab) p.guitar.tab = parseAsciiTab(tab).events;
  return p;
}
const cols = (r: LuteResult) => r.tab.filter((e): e is LuteColumn => e.kind === 'col');
const bySrc = <T extends { srcNoteIndex: number }>(ns: T[]) => [...ns].sort((a, b) => a.srcNoteIndex - b.srcNoteIndex);

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('convertPiece — chords', () => {
  it('maps a guitar E chord at +3 to the classic G-lute shape named G', () => {
    const p = piece([E]);
    p.lute.transpose = 3;
    const r = convertPiece(p);
    const v = r.chords[0].voicings[0];
    expect(bySrc(v.notes).map((n) => n.placement)).toEqual([
      { course: 0, fret: 0 }, { course: 1, fret: 0 }, { course: 2, fret: 2 },
      { course: 3, fret: 2 }, { course: 4, fret: 2 }, { course: 5, fret: 0 },
    ]);
    expect(r.chords[0].name).toBe('G');
    expect(r.warnings).toEqual([]);
  });
  it('reports the shifted bass and the dropped note at transpose 0', () => {
    const r = convertPiece(piece([E]));
    expect(r.stats).toEqual({ shifted: 1, dropped: 1 });
    expect(r.warnings.map((w) => w.kind).sort()).toEqual(['drop', 'inversion']);
    expect(r.warnings.every((w) => w.chord === 0)).toBe(true);
  });
  it('offers up to 3 voicings and respects / clamps the chosen one', () => {
    // a single G4 (top string, fret 3) can be played on course 1 open or course 2 fret 5
    const p = piece([{ name: '', frets: [3, null, null, null, null, null], baseFret: 1 }]);
    const r = convertPiece(p);
    expect(r.chords[0].voicings.length).toBeGreaterThan(1);
    expect(r.chords[0].voicings.length).toBeLessThanOrEqual(3);
    p.overrides.chordVoicing = { 0: 1 };
    expect(convertPiece(p).chords[0].chosen).toBe(1);
    p.overrides.chordVoicing = { 0: 99 };
    expect(convertPiece(p).chords[0].chosen).toBe(convertPiece(p).chords[0].voicings.length - 1);
  });
  it('transposes user-entered chord names', () => {
    const p = piece([{ ...E, name: 'E' }]);
    p.lute.transpose = 3;
    expect(convertPiece(p).chords[0].name).toBe('G');
  });
  it('moves typed chord names with the capo as well as the transpose', () => {
    const p = piece([{ ...E, name: 'E' }, E]);
    p.guitar.capo = 2;
    p.lute.transpose = 3;
    expect(convertPiece(p).chords.map((c) => c.name)).toEqual(['A', 'A']);
  });
  it('warns when a note moved below the bass changes the inversion', () => {
    // G4 + A3; pinning G4 two octaves down to course 6 open puts G2 under the A
    const p = piece([{ name: '', frets: [3, null, 2, null, null, null], baseFret: 1 }]);
    p.overrides.chordPins = { 0: { 0: { course: 5, fret: 0 } } };
    const w = convertPiece(p).warnings;
    expect(w.filter((x) => x.kind === 'inversion')).toHaveLength(1);
  });
  it('offers alternative voicings for a full six-note chord', () => {
    const p = piece([E]);
    p.lute.transpose = 3;
    const c = convertPiece(p).chords[0];
    expect(c.voicings.length).toBeGreaterThan(1);
    expect(c.voicings[0].dropped).toEqual([]);
  });
  it('handles an all-muted chord', () => {
    const r = convertPiece(piece([{ name: '', frets: ['x', 'x', 'x', 'x', 'x', 'x'], baseFret: 1 }]));
    expect(r.chords[0].voicings[0].notes).toEqual([]);
    expect(r.chords[0].name).toBe('');
    expect(r.warnings).toEqual([]);
  });
});

// Guitar in E at +3 is a lute in G: the same frets on every string except the 3rd, which is one fret higher.
const OPEN_SHAPES: [string, ChordShape['frets'], string, number][] = [
  ['E', [0, 0, 1, 2, 2, 0], 'G', 1],
  ['A', [0, 2, 2, 2, 0, 'x'], 'C', 0],
  ['D', [2, 3, 2, 0, 'x', 'x'], 'F', 0],
  ['G', [3, 0, 0, 0, 2, 3], 'Bb', 1],
  ['C', [0, 1, 0, 2, 3, 'x'], 'Eb', 0],
  ['Em', [0, 0, 0, 2, 2, 0], 'Gm', 1],
  ['Am', [0, 1, 2, 2, 0, 'x'], 'Cm', 0],
];

describe('convertPiece — known chord mappings', () => {
  it.each(OPEN_SHAPES)('maps the open %s shape at +3 to the matching lute shape (%s)', (_, frets, name) => {
    const p = piece([{ name: '', frets, baseFret: 1 }]);
    p.lute.transpose = 3;
    const r = convertPiece(p);
    const expected = frets.flatMap((f, s) => (typeof f === 'number' ? [{ course: s, fret: f + (s === 2 ? 1 : 0) }] : []));
    expect(bySrc(r.chords[0].voicings[0].notes).map((n) => n.placement)).toEqual(expected);
    expect(r.chords[0].name).toBe(name);
    expect(r.warnings).toEqual([]);
  });
  it.each(OPEN_SHAPES)('keeps the open %s shape at transpose 0 losing at most one doubled note', (_, frets, __, drops) => {
    const r = convertPiece(piece([{ name: '', frets, baseFret: 1 }]));
    expect(r.stats.dropped).toBe(drops);
    expect(r.warnings.filter((w) => w.kind === 'drop')).toHaveLength(drops);
  });
});

describe('convertPiece — tab', () => {
  it('handles an empty piece', () => {
    expect(convertPiece(newPiece())).toMatchObject({ chords: [], tab: [], warnings: [], totalCost: 0, stats: { shifted: 0, dropped: 0 } });
  });
  it('converts the Am arpeggio at +3 without shifts', () => {
    const p = piece([], AM_ARPEGGIO);
    p.lute.transpose = 3;
    const r = convertPiece(p);
    expect(cols(r)).toHaveLength(5);
    expect(r.stats).toEqual({ shifted: 0, dropped: 0 });
    expect(r.tab.map((e) => e.kind)).toEqual(['col', 'col', 'col', 'col', 'col', 'bar', 'break']);
  });
  it('honours tab pins', () => {
    const p = piece([], AM_ARPEGGIO);
    p.lute.transpose = 3;
    p.overrides.tabPins = { 0: { 0: { course: 5, fret: 5 } } };
    const n = cols(convertPiece(p))[0].notes[0];
    expect(n.placement).toEqual({ course: 5, fret: 5 });
    expect(n.pinned).toBe(true);
  });
  it('warns about pins that do not fit', () => {
    const p = piece([], AM_ARPEGGIO);
    p.overrides.tabPins = { 0: { 0: { course: 0, fret: 0 } } };
    const r = convertPiece(p);
    expect(r.warnings.some((w) => w.kind === 'pin' && w.tabColumn === 0 && w.line === 5)).toBe(true);
  });
  it('turns a stale pin after a tuning change into a warning', () => {
    const p = piece([], AM_ARPEGGIO);
    p.lute.transpose = 3;
    p.overrides.tabPins = { 0: { 0: { course: 5, fret: 5 } } };
    p.lute.tuning = findPreset('lute-13-baroque-dm')!;
    expect(() => convertPiece(p)).not.toThrow();
    expect(convertPiece(p).warnings.some((w) => w.kind === 'pin')).toBe(true);
  });
  it('every output note equals input + transpose (± flagged octave shifts)', () => {
    const rand = mulberry32(42);
    const tunings = ['lute-6-g', 'lute-8-g', 'lute-10-g', 'lute-13-baroque-dm'];
    for (let trial = 0; trial < 40; trial++) {
      const p = newPiece();
      p.lute.tuning = findPreset(tunings[trial % tunings.length])!;
      p.lute.transpose = Math.floor(rand() * 13) - 6;
      const events: TabEvent[] = [];
      for (let c = 0; c < 30; c++) {
        const strings = [0, 1, 2, 3, 4, 5].filter(() => rand() < 0.4);
        events.push({ kind: 'col', col: { x: c * 3, notes: strings.map((s) => ({ string: s, fret: Math.floor(rand() * 13) })) } });
      }
      p.guitar.tab = events;
      const r = convertPiece(p);
      cols(r).forEach((col, i) => {
        const ev = events[i];
        const input = ev.kind === 'col' ? columnPitches(ev.col, p.guitar.tuning, 0) : [];
        expect(col.notes.length + col.dropped.length).toBe(input.length);
        const courses = new Set<number>();
        for (const n of col.notes) {
          expect([0, 12, -12, 24, -24]).toContain(n.shifted);
          expect(n.pitch).toBe(input[n.srcNoteIndex] + p.lute.transpose + n.shifted);
          expect(p.lute.tuning.courses[n.placement.course] + n.placement.fret).toBe(n.pitch);
          if (n.placement.course >= p.lute.tuning.frettedCourses) expect(n.placement.fret).toBe(0);
          expect(n.placement.fret).toBeLessThanOrEqual(p.lute.maxFret);
          courses.add(n.placement.course);
        }
        expect(courses.size).toBe(col.notes.length);
      });
    }
  });
  it('converts 1000 columns quickly', () => {
    const rand = mulberry32(7);
    const p = newPiece();
    for (let c = 0; c < 1000; c++) {
      const strings = [0, 1, 2, 3, 4, 5].filter(() => rand() < 0.5).slice(0, 4);
      p.guitar.tab.push({ kind: 'col', col: { x: c * 3, notes: strings.map((s) => ({ string: s, fret: Math.floor(rand() * 6) })) } });
    }
    const t0 = performance.now();
    convertPiece(p);
    expect(performance.now() - t0).toBeLessThan(4000);
    const t1 = performance.now();
    autoTranspose(p);
    expect(performance.now() - t1).toBeLessThan(15000);
  });
});

describe('manual override cycling', () => {
  it('cycles through all placements including octave shifts', () => {
    const L = limitsOf(newPiece().lute);
    expect(placementCycle(67, L).map((c) => c.placement)).toEqual([
      { course: 0, fret: 0 }, { course: 1, fret: 5 }, { course: 3, fret: 2 }, { course: 4, fret: 7 }, { course: 5, fret: 0 },
    ]);
    expect(nextPlacement(67, { course: 0, fret: 0 }, L)).toEqual({ course: 1, fret: 5 });
    expect(nextPlacement(67, { course: 5, fret: 0 }, L)).toEqual({ course: 0, fret: 0 });
  });
  it('skips placements that clash with the notes that stay', () => {
    const L = limitsOf(newPiece().lute);
    // course 2 is taken by D4, so G4 goes to G3 on course 4 fret 2 next
    expect(nextPlacement(67, { course: 0, fret: 0 }, L, [{ placement: { course: 1, fret: 0 }, pitch: 62 }])).toEqual({ course: 3, fret: 2 });
  });
  it('never drops or moves another note of a chord', () => {
    let p = piece([{ name: '', frets: [3, 0, 0, null, null, null], baseFret: 1 }]);
    p.overrides.chordVoicing = { 0: 1 };
    for (let k = 0; k < 4; k++) {
      const c = convertPiece(p).chords[0];
      const pins = cycleNote(c.voicings[c.chosen].notes, 0, limitsOf(p.lute))!;
      p = { ...p, overrides: { ...p.overrides, chordPins: { 0: pins }, chordVoicing: {} } };
      const after = convertPiece(p).chords[0];
      const v = after.voicings[after.chosen];
      expect(v.dropped).toEqual([]);
      expect(Object.fromEntries(v.notes.map((n) => [n.srcNoteIndex, n.placement]))).toEqual(pins);
    }
  });
  it('never drops or moves another note of a tab column', () => {
    let p = piece([], ['e|---3---|', 'B|---0---|', 'G|-------|', 'D|-------|', 'A|-------|', 'E|-------|'].join('\n'));
    p.lute.transpose = 3;
    for (let k = 0; k < 4; k++) {
      const pins = cycleNote(cols(convertPiece(p))[0].notes, 1, limitsOf(p.lute))!;
      p = { ...p, overrides: { ...p.overrides, tabPins: { 0: pins } } };
      const col = cols(convertPiece(p))[0];
      expect(col.dropped).toEqual([]);
      expect(Object.fromEntries(col.notes.map((n) => [n.srcNoteIndex, n.placement]))).toEqual(pins);
    }
  });
});

describe('autoTranspose', () => {
  it('chooses +3 for a guitar E chord on a G lute', () => {
    expect(autoTranspose(piece([E]))).toBe(3);
  });
  it('chooses 0 for an empty piece', () => {
    expect(autoTranspose(newPiece())).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/convert/convert.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/core/convert/convert.ts`**

```ts
import type {
  LuteChord, LuteNote, LuteResult, LuteSettings, LuteTabEvent, Midi, Piece, Placement, Warning,
} from '../model';
import type { ColumnCandidate, ColumnSolution, Limits } from './types';
import { chordPitches, columnPitches } from '../piece';
import { midiToName, pitchClass, preferFlats, prettyName } from '../pitch';
import { detectChordName, transposeChordName } from '../chordName';
import { solveColumn } from './column';
import { viterbi } from './viterbi';
import { placementsForPitch } from './candidates';
import { isPlayable } from './playability';

export function limitsOf(s: LuteSettings): Limits {
  return { tuning: s.tuning, maxFret: s.maxFret, maxStretch: s.maxStretch };
}

function toLuteNotes(c: ColumnCandidate): LuteNote[] {
  return c.notes.map((n) => ({ placement: n.placement, pitch: n.pitch, shifted: n.shifted, pinned: n.pinned, srcNoteIndex: n.srcIndex }));
}

export function convertPiece(piece: Piece, transpose: number = piece.lute.transpose): LuteResult {
  const limits = limitsOf(piece.lute);
  const { tuning, capo } = piece.guitar;
  const chordInputs = piece.guitar.chords.map((sh) => chordPitches(sh, tuning, capo).map((p) => p.pitch + transpose));
  const colInputs: Midi[][] = [];
  for (const ev of piece.guitar.tab) {
    if (ev.kind === 'col') colInputs.push(columnPitches(ev.col, tuning, capo).map((p) => p + transpose));
  }
  const flats = preferFlats([...chordInputs.flat(), ...colInputs.flat()]);
  const nm = (m: Midi) => prettyName(midiToName(m, flats));
  const warnings: Warning[] = [];
  const stats = { shifted: 0, dropped: 0 };

  const report = (c: ColumnCandidate, inputs: Midi[], where: string, extra: Partial<Warning>) => {
    const bassSrc = inputs.length ? inputs.indexOf(Math.min(...inputs)) : -1;
    let bassReported = false;
    for (const n of c.notes) {
      if (n.shifted === 0) continue;
      stats.shifted++;
      const isBass = n.srcIndex === bassSrc;
      if (isBass) bassReported = true;
      const dir = n.shifted > 0 ? 'up' : 'down';
      const amount = Math.abs(n.shifted) === 24 ? 'two octaves' : 'an octave';
      warnings.push({
        kind: isBass ? 'inversion' : 'shift',
        message: `${where}: ${nm(n.pitch - n.shifted)} moved ${dir} ${amount}${isBass ? ' (bass note, so the inversion changed)' : ''}.`,
        ...extra,
      });
    }
    for (const d of c.dropped) {
      stats.dropped++;
      warnings.push({ kind: 'drop', message: `${where}: ${nm(d.pitch)} dropped (no playable place).`, ...extra });
    }
    // A dropped bass, or another note shifted below it, also changes the inversion.
    if (!bassReported && c.notes.length && bassSrc >= 0) {
      const low = c.notes.reduce((a, b) => (b.pitch < a.pitch ? b : a));
      if (pitchClass(low.pitch) !== pitchClass(inputs[bassSrc])) {
        warnings.push({
          kind: 'inversion',
          message: `${where}: the lowest note is now ${nm(low.pitch)} instead of ${nm(inputs[bassSrc])}, so the inversion changed.`,
          ...extra,
        });
      }
    }
  };
  const reportPins = (bad: number[], where: string, extra: Partial<Warning>) => {
    for (const i of bad) {
      warnings.push({ kind: 'pin', message: `${where}: your manual placement for note ${i + 1} no longer fits and was ignored.`, ...extra });
    }
  };

  let totalCost = 0;
  const chords: LuteChord[] = piece.guitar.chords.map((shape, i) => {
    const pitches = chordInputs[i];
    const sol = solveColumn(pitches, limits, piece.overrides.chordPins[i] ?? {}, 3, { alternatives: true });
    const voicings = sol.candidates.map((c) => ({ notes: toLuteNotes(c), dropped: c.dropped.map((d) => d.pitch), cost: c.cost }));
    const chosen = Math.max(0, Math.min(piece.overrides.chordVoicing[i] ?? 0, voicings.length - 1));
    // A typed name describes the shape, so it moves with the capo as well as the transpose.
    const name = shape.name.trim() ? transposeChordName(shape.name.trim(), capo + transpose, flats) : detectChordName(pitches, flats);
    const where = `Chord ${i + 1}${name ? ` (${prettyName(name)})` : ''}`;
    reportPins(sol.badPins, where, { chord: i });
    const picked = sol.candidates[chosen];
    if (picked) {
      report(picked, pitches, where, { chord: i });
      totalCost += picked.cost;
    }
    return { name, voicings, chosen };
  });

  // Songs repeat columns a lot; solve each distinct (pitches, pins) once.
  const memo = new Map<string, ColumnSolution>();
  const solutions = colInputs.map((pitches, ci) => {
    const pins = piece.overrides.tabPins[ci] ?? {};
    const key = `${pitches.join(',')}|${JSON.stringify(pins)}`;
    let sol = memo.get(key);
    if (!sol) {
      sol = solveColumn(pitches, limits, pins);
      memo.set(key, sol);
    }
    return sol;
  });
  const { path, cost } = viterbi(solutions.map((s) => s.candidates));
  totalCost += cost;
  const tab: LuteTabEvent[] = [];
  let ci = 0;
  for (const ev of piece.guitar.tab) {
    if (ev.kind !== 'col') {
      tab.push(ev);
      continue;
    }
    const c = solutions[ci].candidates[path[ci]];
    const line = ev.col.src?.line;
    const where = `Tab column ${ci + 1}${line ? ` (line ${line})` : ''}`;
    reportPins(solutions[ci].badPins, where, { tabColumn: ci, line });
    report(c, colInputs[ci], where, { tabColumn: ci, line });
    tab.push({ kind: 'col', index: ci, x: ev.col.x, notes: toLuteNotes(c), dropped: c.dropped.map((d) => d.pitch) });
    ci++;
  }
  return { chords, tab, warnings, totalCost, stats, flats };
}

export function placementCycle(pitch: Midi, limits: Limits): { placement: Placement; shifted: number }[] {
  const out: { placement: Placement; shifted: number }[] = [];
  for (const s of [0, 12, -12, 24, -24]) {
    for (const placement of placementsForPitch(pitch + s, limits)) out.push({ placement, shifted: s });
  }
  return out;
}

/**
 * The next placement for a clicked note. `others` are the notes that stay in the column or chord:
 * options on their courses, octave shifts into unison with them, and shapes that become
 * unplayable are skipped, so cycling one note never forces another out.
 */
export function nextPlacement(
  pitch: Midi,
  current: Placement,
  limits: Limits,
  others: { placement: Placement; pitch: Midi }[] = [],
): Placement {
  const same = (p: Placement) => p.course === current.course && p.fret === current.fret;
  const usable = placementCycle(pitch, limits).filter(
    (c) =>
      same(c.placement) ||
      (!others.some((o) => o.placement.course === c.placement.course) &&
        !(c.shifted !== 0 && others.some((o) => o.pitch === pitch + c.shifted)) &&
        isPlayable([...others.map((o) => o.placement), c.placement], limits)),
  );
  if (usable.length === 0) return current;
  const i = usable.findIndex((c) => same(c.placement));
  return usable[(i + 1) % usable.length].placement;
}

/**
 * Pins for a click on one shown note: the clicked note moves to its next placement and every
 * other shown note is pinned where it is, so the shape on screen is exactly what is kept.
 */
export function cycleNote(shown: LuteNote[], srcNoteIndex: number, limits: Limits): Record<number, Placement> | null {
  const n = shown.find((x) => x.srcNoteIndex === srcNoteIndex);
  if (!n) return null;
  const next = nextPlacement(n.pitch - n.shifted, n.placement, limits, shown.filter((x) => x !== n));
  const pins: Record<number, Placement> = {};
  for (const x of shown) pins[x.srcNoteIndex] = x === n ? next : x.placement;
  return pins;
}
```

- [ ] **Step 4: Implement `src/core/convert/autoTranspose.ts`**

```ts
import type { Piece } from '../model';
import { emptyOverrides } from '../model';
import { convertPiece } from './convert';

export const AUTO_SHIFT_PENALTY = 20;
export const AUTO_DROP_PENALTY = 50;

export function autoTranspose(piece: Piece): number {
  const base: Piece = { ...piece, overrides: emptyOverrides() };
  const scored: { t: number; score: number }[] = [];
  for (let t = -6; t <= 6; t++) {
    const r = convertPiece(base, t);
    scored.push({ t, score: r.totalCost + r.stats.shifted * AUTO_SHIFT_PENALTY + r.stats.dropped * AUTO_DROP_PENALTY });
  }
  scored.sort((a, b) => a.score - b.score || Math.abs(a.t) - Math.abs(b.t) || b.t - a.t);
  return scored[0].t;
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run tests/core && npm run typecheck`
Expected: PASS. If the performance test fails, profile `enumerateAssignments` first (pruning order), not the test threshold.

- [ ] **Step 6: Commit**

```bash
git add src/core/convert tests/core/convert
git commit -m "feat(convert): whole-piece conversion, override cycling, auto-transpose

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 12: Pure piece-edit helpers

**Files:**
- Create: `src/core/edit.ts`
- Test: `tests/core/edit.test.ts`

**Interfaces:**
- Consumes: model types, `emptyOverrides` (Task 2), `TextImport` (Task 6).
- Produces: `touch(p): Piece`, `setTitle(p, title): Piece`, `emptyChord(strings?: number): ChordShape`, `toggleFret(shape, string, fret): ChordShape`, `cycleOpen(shape, string): ChordShape` (unset → open → muted → unset; a fretted string goes to open), `shiftBaseFret(shape, delta): ChordShape` (clamped 1..15), `addChord(p)`, `removeChord(p, i)`, `moveChord(p, i, dir: -1 | 1)`, `updateChord(p, i, shape)`, `setGuitarTuning(p, tuning)`, `setCapo(p, capo)`, `applyImport(p, imp: TextImport, sourceText: string)`, `setLuteSettings(p, patch: Partial<LuteSettings>)`, `setTabPin(p, col, note, placement)`, `setChordPin(p, chord, note, placement)`, `setChordVoicing(p, chord, v)`, `pinTabColumn(p, col, placements: Record<number, Placement>)` (replaces that column's pins), `pinChord(p, chord, placements)` (replaces that chord's pins and clears its `chordVoicing` entry), `clearOverrides(p)` — all return a new `Piece` (never mutate).

- [ ] **Step 1: Write the failing test `tests/core/edit.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import * as E from '../../src/core/edit';
import { newPiece } from '../../src/core/piece';
import { findPreset } from '../../src/core/tunings';
import type { ChordShape } from '../../src/core/model';

const shape = (name: string): ChordShape => ({ name, frets: [0, null, null, null, null, null], baseFret: 1 });
const P = { course: 0, fret: 0 };

describe('chord shape edits', () => {
  it('toggles a fret on and off', () => {
    const s = E.toggleFret(E.emptyChord(), 1, 3);
    expect(s.frets[1]).toBe(3);
    expect(E.toggleFret(s, 1, 3).frets[1]).toBeNull();
    expect(E.toggleFret(s, 1, 5).frets[1]).toBe(5);
  });
  it('cycles the open/muted marker', () => {
    let s = E.emptyChord();
    s = E.cycleOpen(s, 0);
    expect(s.frets[0]).toBe(0);
    s = E.cycleOpen(s, 0);
    expect(s.frets[0]).toBe('x');
    s = E.cycleOpen(s, 0);
    expect(s.frets[0]).toBeNull();
    expect(E.cycleOpen(E.toggleFret(s, 0, 3), 0).frets[0]).toBe(0);
  });
  it('clamps the base fret', () => {
    expect(E.shiftBaseFret(E.emptyChord(), -1).baseFret).toBe(1);
    expect(E.shiftBaseFret({ ...E.emptyChord(), baseFret: 15 }, 1).baseFret).toBe(15);
    expect(E.shiftBaseFret(E.emptyChord(), 2).baseFret).toBe(3);
  });
  it('does not mutate its input', () => {
    const s = E.emptyChord();
    E.toggleFret(s, 0, 1);
    expect(s.frets[0]).toBeNull();
  });
});

describe('piece edits', () => {
  it('adds chords with one slot per guitar string', () => {
    const p = E.addChord(newPiece());
    expect(p.guitar.chords).toHaveLength(1);
    expect(p.guitar.chords[0].frets).toEqual([null, null, null, null, null, null]);
  });
  it('removes a chord and reindexes overrides', () => {
    let p = newPiece();
    p.guitar.chords = [shape('A'), shape('B'), shape('C')];
    p.overrides.chordVoicing = { 0: 1, 2: 2 };
    p.overrides.chordPins = { 2: { 0: P } };
    p = E.removeChord(p, 1);
    expect(p.guitar.chords.map((c) => c.name)).toEqual(['A', 'C']);
    expect(p.overrides.chordVoicing).toEqual({ 0: 1, 1: 2 });
    expect(p.overrides.chordPins).toEqual({ 1: { 0: P } });
  });
  it('moves a chord together with its overrides', () => {
    let p = newPiece();
    p.guitar.chords = [shape('A'), shape('B')];
    p.overrides.chordVoicing = { 0: 2 };
    p = E.moveChord(p, 0, 1);
    expect(p.guitar.chords.map((c) => c.name)).toEqual(['B', 'A']);
    expect(p.overrides.chordVoicing).toEqual({ 1: 2 });
    expect(E.moveChord(p, 0, -1)).toBe(p);
  });
  it('keeps overrides on rename but clears them when frets change', () => {
    let p = newPiece();
    p.guitar.chords = [shape('A')];
    p.overrides.chordVoicing = { 0: 1 };
    p = E.updateChord(p, 0, { ...p.guitar.chords[0], name: 'Am' });
    expect(p.overrides.chordVoicing).toEqual({ 0: 1 });
    p = E.updateChord(p, 0, E.toggleFret(p.guitar.chords[0], 1, 1));
    expect(p.overrides.chordVoicing).toEqual({});
  });
  it('applies an import and clears tab pins', () => {
    const p = newPiece();
    p.overrides.tabPins = { 0: { 0: P } };
    const q = E.applyImport(p, { events: [{ kind: 'break' }], warnings: [], tuning: findPreset('guitar-drop-d')!, capo: 2 }, 'text');
    expect(q.guitar.tab).toEqual([{ kind: 'break' }]);
    expect(q.guitar.tuning.id).toBe('guitar-drop-d');
    expect(q.guitar.capo).toBe(2);
    expect(q.guitar.sourceText).toBe('text');
    expect(q.overrides.tabPins).toEqual({});
    const r = E.applyImport(q, { events: [], warnings: [], tuning: null, capo: null }, '');
    expect(r.guitar.tuning.id).toBe('guitar-drop-d');
    expect(r.guitar.capo).toBe(2);
  });
  it('sets pins, voicings and clears overrides', () => {
    let p = E.setTabPin(newPiece(), 3, 1, { course: 2, fret: 1 });
    expect(p.overrides.tabPins).toEqual({ 3: { 1: { course: 2, fret: 1 } } });
    p = E.setChordPin(p, 0, 0, P);
    expect(p.overrides.chordPins).toEqual({ 0: { 0: P } });
    p = E.setChordVoicing(p, 0, 2);
    expect(p.overrides.chordVoicing).toEqual({ 0: 2 });
    expect(p.overrides.chordPins).toEqual({});
    expect(E.clearOverrides(p).overrides).toEqual({ chordVoicing: {}, chordPins: {}, tabPins: {} });
  });
  it('updates lute settings, guitar tuning, capo and title', () => {
    const p = newPiece();
    expect(E.setLuteSettings(p, { transpose: 3 }).lute.transpose).toBe(3);
    expect(E.setGuitarTuning(p, findPreset('guitar-dadgad')!).guitar.tuning.id).toBe('guitar-dadgad');
    expect(E.setCapo(p, 4).guitar.capo).toBe(4);
    expect(E.setTitle(p, 'Greensleeves').title).toBe('Greensleeves');
  });
});

describe('whole-shape pins', () => {
  it('replaces a column or chord pin set and clears the chord voicing index', () => {
    let p = E.setTabPin(newPiece(), 0, 3, { course: 0, fret: 1 });
    p = E.pinTabColumn(p, 0, { 0: { course: 1, fret: 0 }, 1: { course: 2, fret: 2 } });
    expect(p.overrides.tabPins).toEqual({ 0: { 0: { course: 1, fret: 0 }, 1: { course: 2, fret: 2 } } });
    p = E.setChordVoicing(p, 1, 2);
    p = E.pinChord(p, 1, { 0: { course: 0, fret: 0 } });
    expect(p.overrides.chordPins).toEqual({ 1: { 0: { course: 0, fret: 0 } } });
    expect(p.overrides.chordVoicing).toEqual({});
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/edit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/core/edit.ts`**

```ts
import type { ChordShape, LuteSettings, Overrides, Piece, Placement, Tuning } from './model';
import { emptyOverrides } from './model';
import type { TextImport } from './parse/importText';

export function touch(p: Piece): Piece {
  return { ...p, updatedAt: new Date().toISOString() };
}

export function setTitle(p: Piece, title: string): Piece {
  return { ...p, title };
}

export function emptyChord(strings = 6): ChordShape {
  return { name: '', frets: Array.from({ length: strings }, () => null), baseFret: 1 };
}

export function toggleFret(shape: ChordShape, string: number, fret: number): ChordShape {
  const frets = [...shape.frets];
  frets[string] = frets[string] === fret ? null : fret;
  return { ...shape, frets };
}

export function cycleOpen(shape: ChordShape, string: number): ChordShape {
  const cur = shape.frets[string];
  const next = cur === 0 ? 'x' : cur === 'x' ? null : 0;
  const frets = [...shape.frets];
  frets[string] = next;
  return { ...shape, frets };
}

export function shiftBaseFret(shape: ChordShape, delta: number): ChordShape {
  return { ...shape, baseFret: Math.max(1, Math.min(15, shape.baseFret + delta)) };
}

function reindex<T>(rec: Record<number, T>, map: (i: number) => number | null): Record<number, T> {
  const out: Record<number, T> = {};
  for (const [k, v] of Object.entries(rec)) {
    const n = map(Number(k));
    if (n !== null) out[n] = v;
  }
  return out;
}

function mapChordOverrides(o: Overrides, map: (i: number) => number | null): Overrides {
  return { ...o, chordVoicing: reindex(o.chordVoicing, map), chordPins: reindex(o.chordPins, map) };
}

function withChords(p: Piece, chords: ChordShape[], overrides = p.overrides): Piece {
  return { ...p, guitar: { ...p.guitar, chords }, overrides };
}

export function addChord(p: Piece): Piece {
  return withChords(p, [...p.guitar.chords, emptyChord(p.guitar.tuning.courses.length)]);
}

export function removeChord(p: Piece, i: number): Piece {
  return withChords(
    p,
    p.guitar.chords.filter((_, j) => j !== i),
    mapChordOverrides(p.overrides, (k) => (k === i ? null : k > i ? k - 1 : k)),
  );
}

export function moveChord(p: Piece, i: number, dir: -1 | 1): Piece {
  const j = i + dir;
  if (j < 0 || j >= p.guitar.chords.length) return p;
  const chords = [...p.guitar.chords];
  [chords[i], chords[j]] = [chords[j], chords[i]];
  return withChords(p, chords, mapChordOverrides(p.overrides, (k) => (k === i ? j : k === j ? i : k)));
}

export function updateChord(p: Piece, i: number, shape: ChordShape): Piece {
  const old = p.guitar.chords[i];
  const fretsChanged = !old || old.frets.some((f, s) => f !== shape.frets[s]) || old.frets.length !== shape.frets.length;
  const chords = p.guitar.chords.map((c, j) => (j === i ? shape : c));
  return withChords(p, chords, fretsChanged ? mapChordOverrides(p.overrides, (k) => (k === i ? null : k)) : p.overrides);
}

export function setGuitarTuning(p: Piece, tuning: Tuning): Piece {
  return { ...p, guitar: { ...p.guitar, tuning } };
}

export function setCapo(p: Piece, capo: number): Piece {
  return { ...p, guitar: { ...p.guitar, capo } };
}

export function applyImport(p: Piece, imp: TextImport, sourceText: string): Piece {
  return {
    ...p,
    guitar: {
      ...p.guitar,
      tab: imp.events,
      sourceText,
      tuning: imp.tuning ?? p.guitar.tuning,
      capo: imp.capo ?? p.guitar.capo,
    },
    overrides: { ...p.overrides, tabPins: {} },
  };
}

export function setLuteSettings(p: Piece, patch: Partial<LuteSettings>): Piece {
  return { ...p, lute: { ...p.lute, ...patch } };
}

export function setTabPin(p: Piece, col: number, note: number, placement: Placement): Piece {
  const tabPins = { ...p.overrides.tabPins, [col]: { ...(p.overrides.tabPins[col] ?? {}), [note]: placement } };
  return { ...p, overrides: { ...p.overrides, tabPins } };
}

export function setChordPin(p: Piece, chord: number, note: number, placement: Placement): Piece {
  const chordPins = { ...p.overrides.chordPins, [chord]: { ...(p.overrides.chordPins[chord] ?? {}), [note]: placement } };
  return { ...p, overrides: { ...p.overrides, chordPins } };
}

export function setChordVoicing(p: Piece, chord: number, v: number): Piece {
  const chordPins = { ...p.overrides.chordPins };
  delete chordPins[chord];
  return { ...p, overrides: { ...p.overrides, chordVoicing: { ...p.overrides.chordVoicing, [chord]: v }, chordPins } };
}

export function clearOverrides(p: Piece): Piece {
  return { ...p, overrides: emptyOverrides() };
}

/** Replaces all pins of one tab column (note index → placement). */
export function pinTabColumn(p: Piece, col: number, placements: Record<number, Placement>): Piece {
  return { ...p, overrides: { ...p.overrides, tabPins: { ...p.overrides.tabPins, [col]: { ...placements } } } };
}

/** Replaces all pins of one chord and clears its chosen-voicing index (pins re-rank the voicings). */
export function pinChord(p: Piece, chord: number, placements: Record<number, Placement>): Piece {
  const chordVoicing = { ...p.overrides.chordVoicing };
  delete chordVoicing[chord];
  return { ...p, overrides: { ...p.overrides, chordPins: { ...p.overrides.chordPins, [chord]: { ...placements } }, chordVoicing } };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/core && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/edit.ts tests/core/edit.test.ts
git commit -m "feat(core): immutable piece edit helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: TabCode export

**Files:**
- Create: `src/core/tabcode.ts`
- Test: `tests/core/tabcode.test.ts`

**Interfaces:**
- Consumes: `FRENCH_FRETS` (Task 4), `LuteResult`, `LuteNote` (Task 2).
- Produces: `tabCodeNote(course: number, fret: number): string`, `tabCodeChord(notes: LuteNote[]): string`, `toTabCode(result: LuteResult, title: string): string`.

- [ ] **Step 1: Check the TabCode bass-course syntax**

Read the TabCode specification (ECOLM / Tim Crawford's TabCode documentation — search "TabCode lute tablature encoding specification"). Confirm (a) courses 1–6 are written as fret letter + course digit (`c2`), (b) how the 7th course is written, and (c) how courses 8+ (diapasons) are written. The defaults below assume `a7` for the 7th course and `X` + letter + one `/` per course beyond the 8th (`Xa`, `Xa/`, `Xa//`). Also confirm (d) how a system (line) break is marked: the defaults below start a new text line at each `break`, but TabCode may use an explicit token such as `{^}` (with `{>}` for a page break); and (e) that `{...}` is a comment, as the title and section headings below assume. If the specification differs, change `tabCodeNote`/`toTabCode` and the matching expectations in Step 2 to follow it, and note the source URL in a comment above `tabCodeNote`.

- [ ] **Step 2: Write the failing test `tests/core/tabcode.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { tabCodeNote, toTabCode } from '../../src/core/tabcode';
import type { LuteColumn, LuteNote, LuteResult } from '../../src/core/model';

const n = (course: number, fret: number): LuteNote => ({ placement: { course, fret }, pitch: 0, shifted: 0, pinned: false, srcNoteIndex: 0 });
const col = (index: number, notes: LuteNote[]): LuteColumn => ({ kind: 'col', index, x: index * 3, notes, dropped: [] });

describe('TabCode', () => {
  it('encodes notes on courses 1-7 and diapasons', () => {
    expect(tabCodeNote(0, 0)).toBe('a1');
    expect(tabCodeNote(5, 2)).toBe('c6');
    expect(tabCodeNote(6, 0)).toBe('a7');
    expect(tabCodeNote(7, 0)).toBe('Xa');
    expect(tabCodeNote(8, 0)).toBe('Xa/');
    expect(tabCodeNote(9, 0)).toBe('Xa//');
  });
  it('writes chords, bars and systems', () => {
    const result: LuteResult = {
      chords: [{ name: 'G', voicings: [{ notes: [n(5, 0), n(0, 0)], dropped: [], cost: 0 }], chosen: 0 }],
      tab: [col(0, [n(0, 0)]), { kind: 'bar' }, col(1, [n(5, 0), n(1, 2)]), { kind: 'break' }, col(2, [n(0, 3)]), col(3, [])],
      warnings: [], totalCost: 0, stats: { shifted: 0, dropped: 0 }, flats: true,
    };
    expect(toTabCode(result, 'My {Song}')).toBe('{My Song}\n{Chords}\na1a6\n{Tablature}\na1 | c2a6\nd1\n');
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/core/tabcode.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/core/tabcode.ts`**

```ts
import type { LuteNote, LuteResult } from './model';
import { FRENCH_FRETS } from './notation';

/** 0-based course. Courses 1-7: letter + course number; 8th+: X + letter + one slash per course beyond the 8th. */
export function tabCodeNote(course: number, fret: number): string {
  const letter = FRENCH_FRETS[fret];
  if (letter === undefined) throw new RangeError(`TabCode has no letter for fret ${fret}.`);
  if (course < 7) return `${letter}${course + 1}`;
  return `X${letter}${'/'.repeat(course - 7)}`;
}

export function tabCodeChord(notes: LuteNote[]): string {
  return [...notes]
    .sort((a, b) => a.placement.course - b.placement.course)
    .map((n) => tabCodeNote(n.placement.course, n.placement.fret))
    .join('');
}

export function toTabCode(result: LuteResult, title: string): string {
  const lines = [`{${title.replace(/[{}]/g, '')}}`];
  const chordTokens = result.chords.map((c) => tabCodeChord(c.voicings[c.chosen]?.notes ?? [])).filter(Boolean);
  if (chordTokens.length) lines.push('{Chords}', chordTokens.join(' | '));
  lines.push('{Tablature}');
  let cur: string[] = [];
  const flush = () => {
    if (cur.length) lines.push(cur.join(' '));
    cur = [];
  };
  for (const ev of result.tab) {
    if (ev.kind === 'bar') cur.push('|');
    else if (ev.kind === 'break') flush();
    else {
      const t = tabCodeChord(ev.notes);
      if (t) cur.push(t);
    }
  }
  flush();
  return `${lines.join('\n')}\n`;
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run tests/core && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/tabcode.ts tests/core/tabcode.test.ts
git commit -m "feat(core): TabCode export

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Storage, migration and JSON import/export

**Files:**
- Create: `src/core/storage.ts`
- Test: `tests/core/storage.test.ts`

**Interfaces:**
- Consumes: `Piece`, `SCHEMA_VERSION` (Task 2), `newPiece` (Task 3, tests).
- Produces: `StorageLike { getItem; setItem; removeItem }`, `PieceMeta { id; title; updatedAt }`, `MemoryStorage` (in-memory `StorageLike`), `browserStorage(): StorageLike` (localStorage, or `MemoryStorage` when unavailable), `migrate(raw: unknown): Piece` (checks the schema version and the whole structure — tunings, chords, tab events, lute settings, overrides — and throws `Error` with a user-readable message naming the bad field), `PieceStore` with `list(): PieceMeta[]` (most recent first; `[]` on corrupt index), `load(id): Piece | null` (throws on corrupt data), `save(p): void` (may throw on quota), `remove(id): void`; `exportPieces(pieces: Piece[]): string`, `importPieces(text: string): Piece[]`.

- [ ] **Step 1: Write the failing test `tests/core/storage.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { MemoryStorage, PieceStore, migrate, exportPieces, importPieces } from '../../src/core/storage';
import { newPiece } from '../../src/core/piece';

describe('PieceStore', () => {
  it('saves, lists, loads and removes pieces', () => {
    const store = new PieceStore(new MemoryStorage());
    const a = newPiece('A');
    const b = newPiece('B');
    store.save(a);
    store.save(b);
    expect(store.list().map((m) => m.title)).toEqual(['B', 'A']);
    expect(store.load(a.id)).toEqual(a);
    store.save(a);
    expect(store.list().map((m) => m.title)).toEqual(['A', 'B']);
    store.remove(a.id);
    expect(store.list().map((m) => m.title)).toEqual(['B']);
    expect(store.load(a.id)).toBeNull();
  });
  it('survives a corrupt index', () => {
    const s = new MemoryStorage();
    s.setItem('g2l:index', '{not json');
    expect(new PieceStore(s).list()).toEqual([]);
  });
  it('throws on a corrupt piece so callers can skip it', () => {
    const s = new MemoryStorage();
    s.setItem('g2l:piece:x', 'garbage');
    expect(() => new PieceStore(s).load('x')).toThrow();
  });
});

describe('migrate', () => {
  it('accepts schema 1', () => {
    const p = newPiece();
    expect(migrate(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });
  it('rejects newer, missing and invalid data', () => {
    expect(() => migrate({ ...newPiece(), schemaVersion: 2 })).toThrow(/newer version/);
    expect(() => migrate({ id: 'x' })).toThrow(/schemaVersion/);
    expect(() => migrate({ schemaVersion: 1, id: 'x' })).toThrow(/Invalid piece/);
    expect(() => migrate(null)).toThrow();
  });
  it('rejects data that parses but has the wrong shape', () => {
    const ok = () => JSON.parse(JSON.stringify(newPiece())) as Record<string, any>;
    const broken = [
      (p: any) => { p.guitar = {}; },
      (p: any) => { p.guitar.tab = 'nope'; },
      (p: any) => { p.guitar.tab = [{ kind: 'col', col: { x: 0, notes: [{ string: 'a', fret: 1 }] } }]; },
      (p: any) => { p.guitar.chords = [{ name: '', frets: [0, 0], baseFret: 1 }]; },
      (p: any) => { p.lute.tuning.courses = []; },
      (p: any) => { p.lute.maxFret = '8'; },
      (p: any) => { p.lute.notation = 'german'; },
      (p: any) => { p.overrides.tabPins = { 0: { 0: { course: 1 } } }; },
    ];
    for (const breakIt of broken) {
      const p = ok();
      breakIt(p);
      expect(() => migrate(p)).toThrow(/Invalid piece \(/);
    }
  });
});

describe('JSON import/export', () => {
  it('round-trips a bundle and accepts a single piece', () => {
    const a = newPiece('A');
    const b = newPiece('B');
    expect(importPieces(exportPieces([a, b]))).toEqual([a, b]);
    expect(importPieces(JSON.stringify(a))).toEqual([a]);
  });
  it('rejects invalid JSON and newer bundles', () => {
    expect(() => importPieces('nope')).toThrow(/Not valid JSON/);
    expect(() => importPieces(JSON.stringify({ schemaVersion: 9, pieces: [] }))).toThrow(/newer version/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/storage.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/core/storage.ts`**

```ts
import type { Piece } from './model';
import { SCHEMA_VERSION } from './model';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PieceMeta { id: string; title: string; updatedAt: string; }

export class MemoryStorage implements StorageLike {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

export function browserStorage(): StorageLike {
  try {
    const ls = window.localStorage;
    ls.getItem('g2l:probe');
    return ls;
  } catch {
    return new MemoryStorage();
  }
}

const INDEX_KEY = 'g2l:index';
const pieceKey = (id: string) => `g2l:piece:${id}`;

function newerVersionError(v: number): Error {
  return new Error(`This file was made by a newer version of the app (schema ${v}).`);
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);
const isStringState = (v: unknown) => v === null || v === 'x' || (isInt(v) && v >= 0);
const isPlacement = (v: unknown) => isObj(v) && isInt(v.course) && isInt(v.fret);
const isTuning = (v: unknown) =>
  isObj(v) && typeof v.id === 'string' && typeof v.name === 'string' &&
  Array.isArray(v.courses) && v.courses.length > 0 && v.courses.every(isInt) && isInt(v.frettedCourses);
const isEvent = (v: unknown) =>
  isObj(v) &&
  (v.kind === 'bar' || v.kind === 'break' ||
    (v.kind === 'col' && isObj(v.col) && typeof v.col.x === 'number' && Array.isArray(v.col.notes) &&
      v.col.notes.every((n) => isObj(n) && isInt(n.string) && isInt(n.fret))));
const isChord = (v: unknown) =>
  isObj(v) && typeof v.name === 'string' && isInt(v.baseFret) && Array.isArray(v.frets) && v.frets.length === 6 && v.frets.every(isStringState);
const isRecordOf = (v: unknown, ok: (x: unknown) => boolean) => isObj(v) && Object.values(v).every(ok);

/** Checks the whole structure, so data that parses but has the wrong shape never reaches the converter. */
function invalidField(r: Obj): string | null {
  if (typeof r.id !== 'string') return 'id';
  if (typeof r.title !== 'string') return 'title';
  const g = r.guitar;
  if (!isObj(g)) return 'guitar';
  if (!isTuning(g.tuning)) return 'guitar.tuning';
  if (!isInt(g.capo) || g.capo < 0) return 'guitar.capo';
  if (!Array.isArray(g.chords) || !g.chords.every(isChord)) return 'guitar.chords';
  if (!Array.isArray(g.tab) || !g.tab.every(isEvent)) return 'guitar.tab';
  const l = r.lute;
  if (!isObj(l)) return 'lute';
  if (!isTuning(l.tuning)) return 'lute.tuning';
  for (const k of ['transpose', 'maxFret', 'maxStretch']) if (!isInt(l[k])) return `lute.${k}`;
  if (!['french', 'italian', 'modern'].includes(l.notation as string)) return 'lute.notation';
  const o = r.overrides;
  if (!isObj(o)) return 'overrides';
  if (!isRecordOf(o.chordVoicing, isInt)) return 'overrides.chordVoicing';
  if (!isRecordOf(o.chordPins, (x) => isRecordOf(x, isPlacement))) return 'overrides.chordPins';
  if (!isRecordOf(o.tabPins, (x) => isRecordOf(x, isPlacement))) return 'overrides.tabPins';
  return null;
}

/** Validate and upgrade stored/imported data. Add migration steps here when SCHEMA_VERSION increases. */
export function migrate(raw: unknown): Piece {
  if (!isObj(raw)) throw new Error('Not a piece file.');
  const v = raw.schemaVersion;
  if (typeof v === 'number' && v > SCHEMA_VERSION) throw newerVersionError(v);
  if (v !== SCHEMA_VERSION) throw new Error('Missing or unknown schemaVersion.');
  const bad = invalidField(raw);
  if (bad) throw new Error(`Invalid piece (${bad}).`);
  return raw as unknown as Piece;
}

export class PieceStore {
  constructor(private readonly storage: StorageLike) {}

  list(): PieceMeta[] {
    try {
      const v: unknown = JSON.parse(this.storage.getItem(INDEX_KEY) ?? '[]');
      return Array.isArray(v) ? v.filter((m): m is PieceMeta => !!m && typeof (m as PieceMeta).id === 'string') : [];
    } catch {
      return [];
    }
  }

  load(id: string): Piece | null {
    const text = this.storage.getItem(pieceKey(id));
    return text === null ? null : migrate(JSON.parse(text));
  }

  save(p: Piece): void {
    this.storage.setItem(pieceKey(p.id), JSON.stringify(p));
    const list = this.list().filter((m) => m.id !== p.id);
    list.unshift({ id: p.id, title: p.title, updatedAt: p.updatedAt });
    this.storage.setItem(INDEX_KEY, JSON.stringify(list));
  }

  remove(id: string): void {
    this.storage.removeItem(pieceKey(id));
    this.storage.setItem(INDEX_KEY, JSON.stringify(this.list().filter((m) => m.id !== id)));
  }
}

export function exportPieces(pieces: Piece[]): string {
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, pieces }, null, 2);
}

export function importPieces(text: string): Piece[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Not valid JSON.');
  }
  const d = data as { schemaVersion?: unknown; pieces?: unknown } | null;
  if (d && Array.isArray(d.pieces)) {
    if (typeof d.schemaVersion === 'number' && d.schemaVersion > SCHEMA_VERSION) throw newerVersionError(d.schemaVersion);
    return d.pieces.map(migrate);
  }
  return [migrate(data)];
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/core && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/storage.ts tests/core/storage.test.ts
git commit -m "feat(core): localStorage persistence, schema migration, JSON import/export

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: PDF text extraction

**Files:**
- Create: `src/import/pdfText.ts`, `src/import/pdf.ts`
- Test: `tests/import/pdfText.test.ts`

**Interfaces:**
- Produces (pdfText.ts, pure): `PdfTextItem { str; x; y; width; height; fontName }`, `reconstructPage(items: PdfTextItem[]): { y: number; text: string }[]` (top-to-bottom), `reconstructText(pages: PdfTextItem[][]): string`, `looksLikeNotationPdf(text: string): boolean`, `NOTATION_PDF_MESSAGE: string`.
- Produces (pdf.ts): `extractPdfText(data: ArrayBuffer): Promise<string>` — lazy-loads `pdfjs-dist` and its worker (`?url`), returns `reconstructText(...)`.

- [ ] **Step 1: Write the failing test `tests/import/pdfText.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { reconstructPage, reconstructText, looksLikeNotationPdf } from '../../src/import/pdfText';

const item = (str: string, x: number, y: number, fontName = 'F1') => ({ str, x, y, width: str.length * 6, height: 10, fontName });

describe('reconstructPage', () => {
  it('orders lines top to bottom', () => {
    const lines = reconstructPage([item('B|--1--|', 40, 788), item('e|--0--|', 40, 800)]);
    expect(lines.map((l) => l.text)).toEqual(['e|--0--|', 'B|--1--|']);
  });
  it('joins split items by character column', () => {
    expect(reconstructPage([item('e|--', 40, 800), item('0--|', 64, 800)])[0].text).toBe('e|--0--|');
    expect(reconstructPage([item('e|--', 40, 800), item('0', 76, 800)])[0].text).toBe('e|--  0');
  });
  it('groups items with slightly different y', () => {
    expect(reconstructPage([item('e|--', 40, 800), item('0--|', 64, 801.5)])).toHaveLength(1);
  });
  it('drops private-use music-font glyphs', () => {
    expect(reconstructPage([item('e|--0--|', 40, 800)])[0].text).toBe('e|--0--|');
  });
});

describe('reconstructText', () => {
  it('removes repeated headers and page numbers', () => {
    const page = (n: number) => [item('My Song Book', 40, 820), item('e|--0--|', 40, 800), item(String(n), 280, 20)];
    expect(reconstructText([page(1), page(2)])).toBe('e|--0--|\ne|--0--|');
  });
  it('keeps identical tab lines at page edges', () => {
    const page = () => [item('e|--0--|', 40, 800), item('E|-----|', 40, 788)];
    expect(reconstructText([page(), page()]).split('\n')).toHaveLength(4);
  });
});

describe('looksLikeNotationPdf', () => {
  it('flags digits without dash runs', () => {
    expect(looksLikeNotationPdf('0 2 3\n5 7')).toBe(true);
    expect(looksLikeNotationPdf('e|---0---|')).toBe(false);
    expect(looksLikeNotationPdf('e|\u2013\u2013\u20130\u2014\u2014\u2014|')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/import`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/import/pdfText.ts`**

```ts
import { normalizeTabText } from '../core/parse/normalize';
export interface PdfTextItem { str: string; x: number; y: number; width: number; height: number; fontName: string; }

export const NOTATION_PDF_MESSAGE =
  'This PDF looks like it was produced by notation software (e.g. Guitar Pro or MuseScore). ' +
  'Only PDFs of plain-text tab are supported in this version. The extracted text is shown below.';

const PAGE_NUM = /^\s*(page\s*)?\d+(\s*(of|\/)\s*\d+)?\s*$/i;

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export function reconstructPage(items: PdfTextItem[]): { y: number; text: string }[] {
  const clean = items
    .map((i) => ({ ...i, str: i.str.replace(/[-]/g, '') }))
    .filter((i) => i.str.trim().length > 0);
  if (!clean.length) return [];
  const widths = new Map<string, number[]>();
  for (const i of clean) {
    if (i.width > 0) {
      const a = widths.get(i.fontName) ?? [];
      a.push(i.width / i.str.length);
      widths.set(i.fontName, a);
    }
  }
  const globalW = median([...widths.values()].flat()) || 6;
  const charWidth = (font: string) => median(widths.get(font) ?? []) || globalW;
  const tol = (median(clean.map((i) => i.height).filter((h) => h > 0)) || 10) / 2;
  const left = Math.min(...clean.map((i) => i.x));
  const sorted = [...clean].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { y: number; items: PdfTextItem[] }[] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.y) <= tol) last.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  return lines.map((l) => {
    let text = '';
    for (const it of [...l.items].sort((a, b) => a.x - b.x)) {
      const col = Math.round((it.x - left) / charWidth(it.fontName));
      if (col > text.length) text += ' '.repeat(col - text.length);
      text += it.str;
    }
    return { y: l.y, text: text.replace(/\s+$/, '') };
  });
}

function looksLikeTab(t: string): boolean {
  return t.includes('|') || /-{3,}/.test(t);
}

export function reconstructText(pages: PdfTextItem[][]): string {
  const pageLines = pages.map(reconstructPage);
  const edgeCounts = new Map<string, number>();
  for (const lines of pageLines) {
    if (!lines.length) continue;
    const edges = new Set([lines[0].text.trim(), lines[lines.length - 1].text.trim()]);
    for (const e of edges) edgeCounts.set(e, (edgeCounts.get(e) ?? 0) + 1);
  }
  const out: string[] = [];
  for (const lines of pageLines) {
    lines.forEach((l, i) => {
      const t = l.text.trim();
      const edge = i === 0 || i === lines.length - 1;
      if (edge && !looksLikeTab(t)) {
        if (PAGE_NUM.test(t)) return;
        if (pageLines.length > 1 && (edgeCounts.get(t) ?? 0) >= 2) return;
      }
      out.push(l.text);
    });
  }
  return out.join('\n');
}

/** Numbers but no dash runs, even after PDF dashes (– — −) are normalised: drawn staff lines, not text tab. */
export function looksLikeNotationPdf(text: string): boolean {
  const t = normalizeTabText(text);
  return /\d/.test(t) && !/-{3,}/.test(t);
}
```

- [ ] **Step 4: Implement `src/import/pdf.ts`**

```ts
import { reconstructText, type PdfTextItem } from './pdfText';

interface RawItem { str?: string; transform?: number[]; width?: number; height?: number; fontName?: string; }

/** Lazy-loads pdf.js so it is only downloaded (and precached) when needed. */
export async function extractPdfText(data: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  try {
    const pages: PdfTextItem[][] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push(
        (content.items as unknown as RawItem[]).flatMap((it) =>
          typeof it.str === 'string' && it.transform
            ? [{
                str: it.str,
                x: it.transform[4],
                y: it.transform[5],
                width: it.width ?? 0,
                height: it.height || Math.hypot(it.transform[2], it.transform[3]),
                fontName: it.fontName ?? '',
              }]
            : [],
        ),
      );
    }
    return reconstructText(pages);
  } finally {
    await doc.destroy();
  }
}
```

- [ ] **Step 5: Run tests, typecheck and build**

Run: `npx vitest run tests/import && npm run typecheck && npm run build`
Expected: PASS; the build output contains a separate `pdf.worker.min-*.mjs` asset. If TypeScript cannot resolve `pdfjs-dist/build/pdf.worker.min.mjs?url`, add `src/vite-env.d.ts` containing `/// <reference types="vite/client" />` and check that the path exists under `node_modules/pdfjs-dist/build/`.

- [ ] **Step 6: Commit**

```bash
git add src/import tests/import
git commit -m "feat(import): text-based PDF extraction with line reconstruction

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Audio playback

**Files:**
- Create: `src/audio/pluck.ts`
- Test: `tests/audio/pluck.test.ts`

**Interfaces:**
- Produces: `midiToFreq(m: number): number`, `karplusStrong(freq, sampleRate, seconds, decay?, rand?): Float32Array`, `Step { time: number; pitches: Midi[]; index: number }`, `stepsFromColumns(cols: { x: number; pitches: Midi[]; index: number }[], msPerUnit: number): Step[]` (times in seconds, strictly increasing), `class Player { playChord(pitches: Midi[]): void; playSteps(steps: Step[], onStep: (index: number | null) => void): void; stop(): void }` (AudioContext is created lazily on first play).

- [ ] **Step 1: Write the failing test `tests/audio/pluck.test.ts`**

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/audio`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/audio/pluck.ts`**

```ts
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
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/audio && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/audio tests/audio
git commit -m "feat(audio): Karplus-Strong pluck playback

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Lute tab layout

**Files:**
- Create: `src/core/luteTabLayout.ts`
- Test: `tests/core/luteTabLayout.test.ts`

**Interfaces:**
- Consumes: `noteGlyph` (Task 4), `LuteTabEvent`, `Notation`, `Tuning` (Task 2).
- Produces: `LAYOUT = { lineGap: 14, unit: 7, minGap: 20, margin: 20, systemGap: 28 }`, `Glyph { x; y; text; shifted; pinned; ledger; colIndex; noteIndex }`, `SystemLayout { y; height; lineYs: number[]; bars: number[]; glyphs: Glyph[]; columns: { colIndex: number; x: number }[]; width }`, `TabLayout { systems; width; height }`, `staffLineCount(tuning, notation): number`, `rowFor(course, notation): number`, `layoutLuteTab(tab: LuteTabEvent[], tuning: Tuning, notation: Notation, maxWidth: number): TabLayout`.
- Rules (spec §4.3): French top line = course 1, 7th course on a ledger below, diapasons below that; Italian top line = course 6, 7th course on a ledger above, diapasons above that; modern = one line per course. A system wraps at `break` events or when the next column would pass `maxWidth - margin`.

- [ ] **Step 1: Write the failing test `tests/core/luteTabLayout.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { layoutLuteTab, LAYOUT } from '../../src/core/luteTabLayout';
import { findPreset } from '../../src/core/tunings';
import type { LuteNote, LuteTabEvent } from '../../src/core/model';

const note = (course: number, fret: number, extra: Partial<LuteNote> = {}): LuteNote => ({
  placement: { course, fret }, pitch: 0, shifted: 0, pinned: false, srcNoteIndex: 0, ...extra,
});
const col = (index: number, x: number, notes: LuteNote[]): LuteTabEvent => ({ kind: 'col', index, x, notes, dropped: [] });
const six = findPreset('lute-6-g')!;
const eight = findPreset('lute-8-g')!;

describe('layoutLuteTab', () => {
  it('puts course 1 on the top line in French and the bottom line in Italian', () => {
    const fr = layoutLuteTab([col(0, 0, [note(0, 0)])], six, 'french', 800).systems[0];
    expect(fr.glyphs[0]).toMatchObject({ text: 'a', y: fr.lineYs[0] });
    const it6 = layoutLuteTab([col(0, 0, [note(0, 0)])], six, 'italian', 800).systems[0];
    expect(it6.glyphs[0]).toMatchObject({ text: '0', y: it6.lineYs[5] });
  });
  it('writes French diapasons below the staff', () => {
    const s = layoutLuteTab([col(0, 0, [note(7, 0)])], eight, 'french', 800).systems[0];
    expect(s.glyphs[0].text).toBe('/a');
    expect(s.glyphs[0].y).toBe(s.lineYs[5] + 2 * LAYOUT.lineGap);
  });
  it('writes the Italian 7th course on a ledger above the staff', () => {
    const s = layoutLuteTab([col(0, 0, [note(6, 2)])], eight, 'italian', 800).systems[0];
    expect(s.glyphs[0]).toMatchObject({ text: '2', ledger: true, y: s.lineYs[0] - LAYOUT.lineGap });
  });
  it('gives every course its own line in modern notation', () => {
    const s = layoutLuteTab([col(0, 0, [note(7, 0)])], eight, 'modern', 800).systems[0];
    expect(s.lineYs).toHaveLength(8);
    expect(s.glyphs[0].y).toBe(s.lineYs[7]);
  });
  it('flags shifted and pinned notes and keeps column/note ids', () => {
    const g = layoutLuteTab([col(4, 0, [note(0, 0, { shifted: 12, pinned: true, srcNoteIndex: 2 })])], six, 'french', 800).systems[0].glyphs[0];
    expect(g).toMatchObject({ shifted: true, pinned: true, colIndex: 4, noteIndex: 2 });
  });
  it('places bars between columns and starts systems at breaks', () => {
    const l = layoutLuteTab([col(0, 0, [note(0, 0)]), { kind: 'bar' }, col(1, 3, [note(0, 1)]), { kind: 'break' }, col(2, 10, [note(0, 2)])], six, 'french', 800);
    expect(l.systems).toHaveLength(2);
    const [a, b] = l.systems[0].columns.map((c) => c.x);
    expect(l.systems[0].bars).toHaveLength(1);
    expect(l.systems[0].bars[0]).toBeGreaterThan(a);
    expect(l.systems[0].bars[0]).toBeLessThan(b);
    expect(l.systems[1].y).toBeGreaterThan(l.systems[0].y);
  });
  it('wraps long systems to the width', () => {
    const tab = Array.from({ length: 100 }, (_, i) => col(i, i * 3, [note(0, 0)]));
    const l = layoutLuteTab(tab, six, 'french', 400);
    expect(l.systems.length).toBeGreaterThan(1);
    for (const s of l.systems) expect(s.width).toBeLessThanOrEqual(400);
  });
  it('returns an empty layout for an empty tab', () => {
    expect(layoutLuteTab([], six, 'french', 800)).toEqual({ systems: [], width: 0, height: 0 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/luteTabLayout.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/core/luteTabLayout.ts`**

```ts
import type { LuteTabEvent, Notation, Tuning } from './model';
import { noteGlyph } from './notation';

export const LAYOUT = { lineGap: 14, unit: 7, minGap: 20, margin: 20, systemGap: 28 };

export interface Glyph {
  x: number;
  y: number;
  text: string;
  shifted: boolean;
  pinned: boolean;
  ledger: boolean;
  colIndex: number;
  noteIndex: number;
}

export interface SystemLayout {
  y: number;
  height: number;
  lineYs: number[];
  bars: number[];
  glyphs: Glyph[];
  columns: { colIndex: number; x: number }[];
  width: number;
}

export interface TabLayout { systems: SystemLayout[]; width: number; height: number; }

export function staffLineCount(tuning: Tuning, notation: Notation): number {
  return notation === 'modern' ? tuning.courses.length : 6;
}

/** Row relative to the top staff line (0); negative = above, >= line count = below. */
export function rowFor(course: number, notation: Notation): number {
  if (notation === 'modern') return course;
  if (notation === 'french') return course < 6 ? course : course === 6 ? 6 : 7;
  return course < 6 ? 5 - course : course === 6 ? -1 : -2;
}

export function layoutLuteTab(tab: LuteTabEvent[], tuning: Tuning, notation: Notation, maxWidth: number): TabLayout {
  const { lineGap, unit, minGap, margin, systemGap } = LAYOUT;
  const lines = staffLineCount(tuning, notation);
  const extra = notation !== 'modern' && tuning.courses.length > 6;
  const rowsAbove = notation === 'italian' && extra ? 3 : 1;
  const rowsBelow = notation === 'french' && extra ? 3 : 1;
  const systems: SystemLayout[] = [];
  let y = 0;
  const make = (): SystemLayout => {
    const top = y + rowsAbove * lineGap;
    return {
      y,
      height: (rowsAbove + lines - 1 + rowsBelow) * lineGap,
      lineYs: Array.from({ length: lines }, (_, i) => top + i * lineGap),
      bars: [],
      glyphs: [],
      columns: [],
      width: 0,
    };
  };
  let cur = make();
  let cursor = margin;
  let lastSrcX: number | null = null;
  const restart = () => {
    if (cur.columns.length || cur.bars.length) {
      cur.width = cursor + margin;
      systems.push(cur);
      y += cur.height + systemGap;
    }
    cur = make();
    cursor = margin;
    lastSrcX = null;
  };

  for (const ev of tab) {
    if (ev.kind === 'break') {
      restart();
      continue;
    }
    if (ev.kind === 'bar') {
      if (cur.columns.length) {
        cursor += minGap / 2;
        cur.bars.push(cursor);
      }
      continue;
    }
    let advance: number = lastSrcX === null ? minGap / 2 : Math.min(minGap * 4, Math.max(minGap, (ev.x - lastSrcX) * unit));
    if (cursor + advance > maxWidth - margin && cur.columns.length) {
      restart();
      advance = minGap / 2;
    }
    const x = cursor + advance;
    cursor = x;
    lastSrcX = ev.x;
    cur.columns.push({ colIndex: ev.index, x });
    const top = cur.lineYs[0];
    const stack = new Map<number, number>();
    for (const n of ev.notes) {
      const { course, fret } = n.placement;
      let row = rowFor(course, notation);
      if (notation !== 'modern' && course >= 7) {
        const k = stack.get(row) ?? 0;
        stack.set(row, k + 1);
        row += notation === 'french' ? k : -k;
      }
      cur.glyphs.push({
        x,
        y: top + row * lineGap,
        text: noteGlyph(course, fret, notation),
        shifted: n.shifted !== 0,
        pinned: n.pinned,
        ledger: notation !== 'modern' && course === 6,
        colIndex: ev.index,
        noteIndex: n.srcNoteIndex,
      });
    }
  }
  restart();
  const width = systems.length ? Math.max(...systems.map((s) => s.width)) : 0;
  const height = systems.length ? y - systemGap : 0;
  return { systems, width, height };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/core && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/luteTabLayout.ts tests/core/luteTabLayout.test.ts
git commit -m "feat(core): lute tablature layout for French, Italian and modern notation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 18: UI shell pieces — state hook, warnings, piece list, header

**Files:**
- Create: `src/ui/util.ts`, `src/ui/state.ts`, `src/ui/WarningsPanel.tsx`, `src/ui/PieceList.tsx`, `src/ui/Header.tsx`
- Test: `tests/ui/render.ts`, `tests/ui/state.test.ts`, `tests/ui/shell.test.tsx`

**Interfaces:**
- Consumes: `PieceStore`, `StorageLike`, `PieceMeta`, `MemoryStorage` (Task 14), `newPiece` (Task 3), `touch` (Task 12), `Warning` (Task 2).
- Produces (util.ts): `clampInt(v: string, lo: number, hi: number): number`, `slug(s: string): string`, `downloadText(filename, text, mime): void`, `svgMarkup(el: SVGSVGElement): string`, `combineSvgs(els: SVGSVGElement[], gap?: number): string`.
- Produces (state.ts): `safeLoad(store, id): Piece | null`, `initialPiece(store): Piece`, `usePieces(storage: StorageLike)` → `{ piece, update(fn: (p: Piece) => Piece), list: PieceMeta[], open(id), create(), remove(id), importMany(pieces: Piece[]), allPieces(): Piece[], saveError: string | null }` (debounced 500 ms autosave).
- Produces (components): `WarningsPanel({ warnings, onSelect? })`, `PieceList({ list, currentId, open, onOpen, onNew, onDelete })`, `Header({ title, onTitle, view, onView, playing, onPlay, onStop, msPerUnit, onTempo, onExport, onImportJson, onToggleSidebar })`, types `View = 'guitar' | 'lute'`, `ExportKind = 'json' | 'json-all' | 'tabcode' | 'tab-svg' | 'chords-svg' | 'print'`.
- Note: all React component tests use `renderToStaticMarkup` (no DOM). Interaction is covered by Playwright in Task 24.

- [ ] **Step 1: Create the test render helper `tests/ui/render.ts`**

```ts
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/** Static markup with React's text-node separators removed, so text assertions read naturally. */
export const html = (el: ReactElement): string => renderToStaticMarkup(el).replace(/<!-- -->/g, '');
export const noop = () => {};
```

- [ ] **Step 2: Write the failing tests**

`tests/ui/state.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { initialPiece, safeLoad } from '../../src/ui/state';
import { MemoryStorage, PieceStore } from '../../src/core/storage';
import { newPiece } from '../../src/core/piece';
import { clampInt, slug } from '../../src/ui/util';

describe('state helpers', () => {
  it('starts with a new piece when storage is empty', () => {
    expect(initialPiece(new PieceStore(new MemoryStorage())).title).toBe('Untitled');
  });
  it('skips corrupt pieces when choosing the initial piece', () => {
    const s = new MemoryStorage();
    const store = new PieceStore(s);
    const good = newPiece('Good');
    store.save(good);
    s.setItem('g2l:index', JSON.stringify([{ id: 'bad', title: 'Bad', updatedAt: '' }, { id: good.id, title: 'Good', updatedAt: '' }]));
    s.setItem('g2l:piece:bad', 'garbage');
    expect(safeLoad(store, 'bad')).toBeNull();
    expect(initialPiece(store).id).toBe(good.id);
  });
  it('skips a stored piece that is valid JSON but the wrong shape', () => {
    const s = new MemoryStorage();
    const store = new PieceStore(s);
    s.setItem('g2l:index', JSON.stringify([{ id: 'bad', title: 'Bad', updatedAt: '' }]));
    s.setItem('g2l:piece:bad', JSON.stringify({ ...newPiece(), id: 'bad', guitar: {} }));
    expect(safeLoad(store, 'bad')).toBeNull();
    expect(initialPiece(store).title).toBe('Untitled');
  });
});

describe('util', () => {
  it('clamps integers from input strings', () => {
    expect(clampInt('5', 0, 12)).toBe(5);
    expect(clampInt('99', 0, 12)).toBe(12);
    expect(clampInt('-3', 0, 12)).toBe(0);
    expect(clampInt('abc', 2, 6)).toBe(2);
  });
  it('slugs titles for filenames', () => {
    expect(slug('  Greensleeves (arr.) ')).toBe('greensleeves-arr');
    expect(slug('')).toBe('piece');
  });
});
```

`tests/ui/shell.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { html, noop } from './render';
import { WarningsPanel } from '../../src/ui/WarningsPanel';
import { PieceList } from '../../src/ui/PieceList';
import { Header } from '../../src/ui/Header';

describe('WarningsPanel', () => {
  it('renders nothing without warnings', () => {
    expect(html(<WarningsPanel warnings={[]} />)).toBe('');
  });
  it('lists warnings with line links', () => {
    const out = html(<WarningsPanel warnings={[{ kind: 'parse', message: 'Bad line', line: 3 }]} onSelect={noop} />);
    expect(out).toContain('1 warning');
    expect(out).toContain('Line 3: Bad line');
  });
});

describe('PieceList', () => {
  it('lists pieces and marks the current one', () => {
    const out = html(
      <PieceList
        list={[{ id: 'a', title: 'Alpha', updatedAt: '2026-11-19T10:00:00Z' }, { id: 'b', title: '', updatedAt: '2026-11-19T10:00:00Z' }]}
        currentId="a" open={false} onOpen={noop} onNew={noop} onDelete={noop}
      />,
    );
    expect(out).toContain('Alpha');
    expect(out).toContain('Untitled');
    expect(out).toContain('class="current"');
    expect(out).toContain('data-testid="new-piece"');
  });
});

describe('Header', () => {
  it('shows brand, title, view toggle and export menu', () => {
    const out = html(
      <Header title="My piece" onTitle={noop} view="guitar" onView={noop} playing={false} onPlay={noop} onStop={noop}
        msPerUnit={120} onTempo={noop} onExport={noop} onImportJson={noop} onToggleSidebar={noop} />,
    );
    expect(out).toContain('Guitar → Lute');
    expect(out).toContain('value="My piece"');
    expect(out).toMatch(/data-testid="view-guitar"[^>]*aria-checked="true"|aria-checked="true"[^>]*data-testid="view-guitar"/);
    expect(out).toContain('Lute TabCode (.tc)');
    expect(out).toContain('data-testid="play"');
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/ui`
Expected: FAIL — modules not found (the Task 1 App test still passes).

- [ ] **Step 4: Implement `src/ui/util.ts`**

```ts
export function clampInt(v: string, lo: number, hi: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || v.trim() === '') return lo;
  return Math.min(hi, Math.max(lo, n));
}

export function slug(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'piece';
}

export function downloadText(filename: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function svgMarkup(el: SVGSVGElement): string {
  const clone = el.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('color', '#111111');
  return new XMLSerializer().serializeToString(clone);
}

export function combineSvgs(els: SVGSVGElement[], gap = 12): string {
  let x = 0;
  let h = 0;
  const parts = els.map((el) => {
    const w = Number(el.getAttribute('width'));
    h = Math.max(h, Number(el.getAttribute('height')));
    const g = `<g transform="translate(${x},0)">${el.innerHTML}</g>`;
    x += w + gap;
    return g;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" color="#111111" width="${x}" height="${h}" viewBox="0 0 ${x} ${h}">${parts.join('')}</svg>`;
}
```

- [ ] **Step 5: Implement `src/ui/state.ts`**

```ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Piece } from '../core/model';
import { PieceStore, type PieceMeta, type StorageLike } from '../core/storage';
import { newPiece } from '../core/piece';
import { touch } from '../core/edit';

const SAVE_ERROR = 'Could not save: browser storage is full or unavailable. Export your pieces as JSON to keep them.';

export function safeLoad(store: PieceStore, id: string): Piece | null {
  try {
    return store.load(id);
  } catch {
    return null;
  }
}

export function initialPiece(store: PieceStore): Piece {
  for (const m of store.list()) {
    const p = safeLoad(store, m.id);
    if (p) return p;
  }
  return newPiece();
}

export function usePieces(storage: StorageLike) {
  const store = useMemo(() => new PieceStore(storage), [storage]);
  const [list, setList] = useState<PieceMeta[]>(() => store.list());
  const [piece, setPiece] = useState<Piece>(() => initialPiece(store));
  const [saveError, setSaveError] = useState<string | null>(null);

  const trySave = useCallback(
    (p: Piece) => {
      try {
        store.save(p);
        setSaveError(null);
      } catch {
        setSaveError(SAVE_ERROR);
      }
      setList(store.list());
    },
    [store],
  );

  useEffect(() => {
    const t = window.setTimeout(() => trySave(piece), 500);
    return () => window.clearTimeout(t);
  }, [piece, trySave]);

  const update = useCallback((fn: (p: Piece) => Piece) => setPiece((p) => touch(fn(p))), []);

  const open = useCallback(
    (id: string) => {
      trySave(piece);
      const p = safeLoad(store, id);
      if (p) setPiece(p);
    },
    [piece, store, trySave],
  );

  const create = useCallback(() => {
    trySave(piece);
    setPiece(newPiece());
  }, [piece, trySave]);

  const remove = useCallback(
    (id: string) => {
      store.remove(id);
      const l = store.list();
      setList(l);
      if (id === piece.id) {
        const next = l.map((m) => safeLoad(store, m.id)).find((p): p is Piece => p !== null);
        setPiece(next ?? newPiece());
      }
    },
    [piece.id, store],
  );

  const importMany = useCallback(
    (pieces: Piece[]) => {
      for (const p of pieces) {
        try {
          store.save(p);
        } catch {
          setSaveError(SAVE_ERROR);
        }
      }
      setList(store.list());
      if (pieces[0]) setPiece(pieces[0]);
    },
    [store],
  );

  const allPieces = useCallback(
    () => store.list().map((m) => safeLoad(store, m.id)).filter((p): p is Piece => p !== null),
    [store],
  );

  return { piece, update, list, open, create, remove, importMany, allPieces, saveError };
}
```

- [ ] **Step 6: Implement `src/ui/WarningsPanel.tsx`**

```tsx
import type { Warning } from '../core/model';

export interface WarningsPanelProps { warnings: Warning[]; onSelect?: (w: Warning) => void; }

export function WarningsPanel({ warnings, onSelect }: WarningsPanelProps) {
  if (!warnings.length) return null;
  return (
    <details className="warnings" open={warnings.length <= 5} data-testid="warnings">
      <summary>{`${warnings.length} warning${warnings.length === 1 ? '' : 's'}`}</summary>
      <ul>
        {warnings.map((w, i) => (
          <li key={i} className={`warning warning-${w.kind}`}>
            {onSelect && w.line ? (
              <button type="button" className="link" onClick={() => onSelect(w)}>{`Line ${w.line}: ${w.message}`}</button>
            ) : (
              w.message
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
```

- [ ] **Step 7: Implement `src/ui/PieceList.tsx`**

```tsx
import type { PieceMeta } from '../core/storage';

export interface PieceListProps {
  list: PieceMeta[];
  currentId: string;
  open: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

export function PieceList({ list, currentId, open, onOpen, onNew, onDelete }: PieceListProps) {
  return (
    <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Saved pieces">
      <button type="button" className="primary" data-testid="new-piece" onClick={onNew}>+ New piece</button>
      <ul className="piece-list">
        {list.map((m) => {
          const title = m.title || 'Untitled';
          return (
            <li key={m.id} className={m.id === currentId ? 'current' : ''}>
              <button type="button" className="link piece-open" onClick={() => onOpen(m.id)}>
                <span>{title}</span>
                <small>{m.updatedAt ? new Date(m.updatedAt).toLocaleDateString() : ''}</small>
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Delete ${title}`}
                onClick={() => {
                  if (window.confirm(`Delete "${title}"?`)) onDelete(m.id);
                }}
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
```

- [ ] **Step 8: Implement `src/ui/Header.tsx`**

```tsx
export type View = 'guitar' | 'lute';
export type ExportKind = 'json' | 'json-all' | 'tabcode' | 'tab-svg' | 'chords-svg' | 'print';

export interface HeaderProps {
  title: string;
  onTitle: (t: string) => void;
  view: View;
  onView: (v: View) => void;
  playing: boolean;
  onPlay: () => void;
  onStop: () => void;
  msPerUnit: number;
  onTempo: (ms: number) => void;
  onExport: (kind: ExportKind) => void;
  onImportJson: (file: File) => void;
  onToggleSidebar: () => void;
}

export function Header(props: HeaderProps) {
  const { title, onTitle, view, onView, playing, onPlay, onStop, msPerUnit, onTempo, onExport, onImportJson, onToggleSidebar } = props;
  return (
    <header className="header">
      <button type="button" className="icon-btn menu" aria-label="Show saved pieces" onClick={onToggleSidebar}>☰</button>
      <span className="brand">Guitar → Lute</span>
      <input className="title" aria-label="Piece title" value={title} onChange={(e) => onTitle(e.target.value)} />
      <div className="segmented" role="radiogroup" aria-label="View">
        {(['guitar', 'lute'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={view === v}
            data-testid={`view-${v}`}
            className={view === v ? 'active' : ''}
            onClick={() => onView(v)}
          >
            {v === 'guitar' ? 'Guitar' : 'Lute'}
          </button>
        ))}
      </div>
      <div className="playback">
        {playing ? (
          <button type="button" data-testid="stop" onClick={onStop}>■ Stop</button>
        ) : (
          <button type="button" data-testid="play" onClick={onPlay}>▶ Play tab</button>
        )}
        <label className="tempo">
          Speed
          <input type="range" min={40} max={300} step={10} value={340 - msPerUnit} onChange={(e) => onTempo(340 - Number(e.target.value))} />
        </label>
      </div>
      <select
        aria-label="Export"
        data-testid="export"
        value=""
        onChange={(e) => {
          const v = e.target.value as ExportKind | '';
          if (v) onExport(v);
        }}
      >
        <option value="">Export…</option>
        <option value="json">This piece (JSON)</option>
        <option value="json-all">All pieces (JSON)</option>
        <option value="tabcode">Lute TabCode (.tc)</option>
        <option value="tab-svg">Lute tab (SVG)</option>
        <option value="chords-svg">Lute chord boxes (SVG)</option>
        <option value="print">Print…</option>
      </select>
      <label className="file-button">
        Import JSON
        <input
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImportJson(f);
            e.target.value = '';
          }}
        />
      </label>
    </header>
  );
}
```

- [ ] **Step 9: Run tests and typecheck**

Run: `npx vitest run tests/ui && npm run typecheck`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/ui tests/ui
git commit -m "feat(ui): state hook, header, piece list and warnings panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: Guitar chord box editor and guitar tab view

**Files:**
- Create: `src/ui/GuitarChordBox.tsx`, `src/ui/GuitarTabView.tsx`
- Test: `tests/ui/guitar.test.tsx`

**Interfaces:**
- Consumes: `chordPitches` (Task 3), `detectChordName` (Task 4), `midiToName`, `prettyName` (Task 2), `cycleOpen`, `toggleFret`, `shiftBaseFret` (Task 12), `splitSystems`, `renderAsciiSystem`, `tuningLabels` (Task 7).
- Produces: `GuitarChordBox({ shape, tuning, capo, flats, onChange, onPlay, onRemove, onMove })` with test ids `guitar-chordbox`, `open-<string>`, `cell-<string>-<fret>`; `GuitarTabView({ events, tuning })` with test ids `guitar-tab` / `guitar-tab-empty`.
- Layout: strings drawn low (left) → high (right), string 0 (high e) on the right; 5 frets visible from `baseFret`; SVG uses presentation attributes (`stroke="currentColor"`) so exported/printed SVG keeps its look.

- [ ] **Step 1: Write the failing test `tests/ui/guitar.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest';
import { html, noop } from './render';
import { GuitarChordBox } from '../../src/ui/GuitarChordBox';
import { GuitarTabView } from '../../src/ui/GuitarTabView';
import { STANDARD_GUITAR } from '../../src/core/tunings';
import { parseAsciiTab } from '../../src/core/parse/asciiTab';
import type { ChordShape } from '../../src/core/model';
import { AM_ARPEGGIO } from '../core/parse/fixtures';

const box = (shape: ChordShape) => html(
  <GuitarChordBox shape={shape} tuning={STANDARD_GUITAR} capo={0} flats={false} onChange={noop} onPlay={noop} onRemove={noop} onMove={noop} />,
);

describe('GuitarChordBox', () => {
  it('shows dots, note names and the detected chord name', () => {
    const out = box({ name: '', frets: [0, 1, 2, 2, 0, 'x'], baseFret: 1 });
    expect(out).toContain('A E A C E');
    expect(out).toContain('placeholder="Am"');
    expect(out.match(/class="dot"/g)).toHaveLength(3);
    expect(out).toContain('data-testid="cell-1-1"');
    expect(out).toContain('data-testid="open-5"');
    expect(out).toContain('×');
  });
  it('shows the base fret number when not at the nut', () => {
    const out = box({ name: 'X', frets: [5, 5, null, null, null, null], baseFret: 5 });
    expect(out).toContain('class="base-fret"');
    expect(out).toContain('data-testid="cell-0-5"');
    expect(out.match(/class="dot"/g)).toHaveLength(2);
  });
});

describe('GuitarTabView', () => {
  it('shows an empty state', () => {
    expect(html(<GuitarTabView events={[]} tuning={STANDARD_GUITAR} />)).toContain('No tab yet');
  });
  it('renders systems as monospace ASCII', () => {
    const out = html(<GuitarTabView events={parseAsciiTab(AM_ARPEGGIO).events} tuning={STANDARD_GUITAR} />);
    expect(out).toContain('<pre class="ascii-tab">');
    expect(out).toContain('e|');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/ui/guitar.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/ui/GuitarChordBox.tsx`**

```tsx
import type { ChordShape, Tuning } from '../core/model';
import { chordPitches } from '../core/piece';
import { detectChordName } from '../core/chordName';
import { midiToName, prettyName } from '../core/pitch';
import { cycleOpen, shiftBaseFret, toggleFret } from '../core/edit';

const LEFT = 21;
const TOP = 34;
const SG = 18;
const FG = 22;
const FRETS = 5;

export interface GuitarChordBoxProps {
  shape: ChordShape;
  tuning: Tuning;
  capo: number;
  flats: boolean;
  onChange: (s: ChordShape) => void;
  onPlay: () => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}

export function GuitarChordBox({ shape, tuning, capo, flats, onChange, onPlay, onRemove, onMove }: GuitarChordBoxProps) {
  const n = tuning.courses.length;
  const W = LEFT * 2 + (n - 1) * SG;
  const H = TOP + FRETS * FG + 8;
  const xOf = (s: number) => LEFT + (n - 1 - s) * SG;
  const yOf = (i: number) => TOP + i * FG;
  const pitches = chordPitches(shape, tuning, capo).map((p) => p.pitch);
  const detected = detectChordName(pitches, flats);
  const names = [...pitches].reverse().map((p) => prettyName(midiToName(p, flats, false))).join(' ');
  const strings = Array.from({ length: n }, (_, s) => s);
  const rows = Array.from({ length: FRETS }, (_, i) => i);
  return (
    <figure className="chordbox" data-testid="guitar-chordbox">
      <input
        className="chord-name"
        aria-label="Chord name"
        value={shape.name}
        placeholder={detected ? prettyName(detected) : 'Name'}
        onChange={(e) => onChange({ ...shape, name: e.target.value })}
      />
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="chordbox-svg">
        {shape.baseFret === 1 ? (
          <rect x={xOf(n - 1)} y={TOP - 3} width={xOf(0) - xOf(n - 1)} height={4} fill="currentColor" />
        ) : (
          <text className="base-fret" x={2} y={TOP + FG / 2 + 4} fontSize={11} fill="currentColor">{shape.baseFret}</text>
        )}
        {Array.from({ length: FRETS + 1 }, (_, i) => (
          <line key={`f${i}`} x1={xOf(n - 1)} x2={xOf(0)} y1={yOf(i)} y2={yOf(i)} stroke="currentColor" strokeWidth={1} />
        ))}
        {strings.map((s) => (
          <line key={`s${s}`} x1={xOf(s)} x2={xOf(s)} y1={yOf(0)} y2={yOf(FRETS)} stroke="currentColor" strokeWidth={1} />
        ))}
        {strings.map((s) => {
          const st = shape.frets[s];
          return (
            <g key={`o${s}`}>
              {st === 0 && <circle cx={xOf(s)} cy={TOP - 13} r={5} fill="none" stroke="currentColor" strokeWidth={1.5} />}
              {st === 'x' && <text x={xOf(s)} y={TOP - 8} textAnchor="middle" fontSize={13} fill="currentColor">×</text>}
              <rect
                className="hit"
                data-testid={`open-${s}`}
                x={xOf(s) - SG / 2}
                y={TOP - 24}
                width={SG}
                height={20}
                fill="transparent"
                onClick={() => onChange(cycleOpen(shape, s))}
              />
            </g>
          );
        })}
        {strings.map((s) =>
          rows.map((i) => {
            const fret = shape.baseFret + i;
            return (
              <rect
                key={`c${s}-${i}`}
                className="hit"
                data-testid={`cell-${s}-${fret}`}
                x={xOf(s) - SG / 2}
                y={yOf(i)}
                width={SG}
                height={FG}
                fill="transparent"
                onClick={() => onChange(toggleFret(shape, s, fret))}
              />
            );
          }),
        )}
        {strings.map((s) => {
          const f = shape.frets[s];
          if (typeof f !== 'number' || f === 0 || f < shape.baseFret || f >= shape.baseFret + FRETS) return null;
          return <circle key={`d${s}`} className="dot" cx={xOf(s)} cy={yOf(f - shape.baseFret) + FG / 2} r={6.5} fill="currentColor" pointerEvents="none" />;
        })}
      </svg>
      <figcaption className="notes">{names || '—'}</figcaption>
      <div className="box-controls">
        <button type="button" aria-label="Show lower frets" onClick={() => onChange(shiftBaseFret(shape, -1))}>▲</button>
        <button type="button" aria-label="Show higher frets" onClick={() => onChange(shiftBaseFret(shape, 1))}>▼</button>
        <button type="button" aria-label="Play chord" onClick={onPlay}>♪</button>
        <button type="button" aria-label="Move chord left" onClick={() => onMove(-1)}>◀</button>
        <button type="button" aria-label="Move chord right" onClick={() => onMove(1)}>▶</button>
        <button type="button" aria-label="Delete chord" onClick={onRemove}>✕</button>
      </div>
    </figure>
  );
}
```

- [ ] **Step 4: Implement `src/ui/GuitarTabView.tsx`**

```tsx
import type { TabEvent, Tuning } from '../core/model';
import { renderAsciiSystem, splitSystems, tuningLabels } from '../core/asciiRender';

export function GuitarTabView({ events, tuning }: { events: TabEvent[]; tuning: Tuning }) {
  const systems = splitSystems(events);
  if (!systems.length) {
    return <p className="muted" data-testid="guitar-tab-empty">No tab yet. Use “Import tab…” to paste text or upload a PDF.</p>;
  }
  const labels = tuningLabels(tuning);
  return (
    <div className="ascii-tabs" data-testid="guitar-tab">
      {systems.map((sys, i) => (
        <pre key={i} className="ascii-tab">{renderAsciiSystem(sys, labels).join('\n')}</pre>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run tests/ui && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui tests/ui
git commit -m "feat(ui): clickable guitar chord box and guitar tab view

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 20: Import dialog and guitar view

**Files:**
- Create: `src/ui/ImportDialog.tsx`, `src/ui/GuitarView.tsx`
- Test: `tests/ui/guitarView.test.tsx`

**Interfaces:**
- Consumes: `importTabText`, `TextImport` (Task 6), `extractPdfText` (Task 15, lazy), `looksLikeNotationPdf`, `NOTATION_PDF_MESSAGE` (Task 15), `WarningsPanel` (Task 18), `GuitarChordBox`, `GuitarTabView` (Task 19), edit helpers (Task 12), `GUITAR_PRESETS`, `findPreset` (Task 3), `chordPitches` (Task 3), `clampInt` (Task 18).
- Produces: `ImportDialog({ initialText, hasPins, onImport(imp: TextImport, text: string), onClose })` with test ids `import-text`, `pdf-input`, `do-import`; `GuitarView({ piece, update, flats, onPlayChord })` with test ids `add-chord`, `open-import`.
- Behaviour: the dialog parses live as the user types; Import is disabled when no columns are found; if `hasPins`, the user confirms before tab pins are cleared; PDF text always lands in the textarea, with a specific message for notation-software PDFs and empty PDFs; clicking a warning selects that line in the textarea.

- [ ] **Step 1: Write the failing test `tests/ui/guitarView.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest';
import { html, noop } from './render';
import { ImportDialog } from '../../src/ui/ImportDialog';
import { GuitarView } from '../../src/ui/GuitarView';
import { newPiece } from '../../src/core/piece';
import { addChord } from '../../src/core/edit';
import { AM_ARPEGGIO } from '../core/parse/fixtures';

describe('ImportDialog', () => {
  it('disables import when nothing parses', () => {
    const out = html(<ImportDialog initialText="" hasPins={false} onImport={noop} onClose={noop} />);
    expect(out).toContain('0 columns found');
    expect(out).toMatch(/data-testid="do-import"[^>]*disabled|disabled[^>]*data-testid="do-import"/);
  });
  it('previews parsed tab', () => {
    const out = html(<ImportDialog initialText={AM_ARPEGGIO} hasPins={false} onImport={noop} onClose={noop} />);
    expect(out).toContain('5 columns found');
    expect(out).toContain('tuning Standard (E A D G B E)');
    expect(out).toContain('data-testid="pdf-input"');
  });
});

describe('GuitarView', () => {
  it('shows tuning, capo, chord boxes and tab section', () => {
    const p = addChord(newPiece());
    const out = html(<GuitarView piece={p} update={noop} flats={false} onPlayChord={noop} />);
    expect(out).toContain('Guitar tuning');
    expect(out).toContain('Capo');
    expect(out).toContain('data-testid="guitar-chordbox"');
    expect(out).toContain('data-testid="add-chord"');
    expect(out).toContain('data-testid="open-import"');
    expect(out).toContain('No tab yet');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/ui/guitarView.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/ui/ImportDialog.tsx`**

```tsx
import { useMemo, useRef, useState } from 'react';
import { importTabText, type TextImport } from '../core/parse/importText';
import { looksLikeNotationPdf, NOTATION_PDF_MESSAGE } from '../import/pdfText';
import { WarningsPanel } from './WarningsPanel';

export interface ImportDialogProps {
  initialText: string;
  hasPins: boolean;
  onImport: (imp: TextImport, text: string) => void;
  onClose: () => void;
}

export function ImportDialog({ initialText, hasPins, onImport, onClose }: ImportDialogProps) {
  const [text, setText] = useState(initialText);
  const [pdfMessage, setPdfMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const preview = useMemo(() => importTabText(text), [text]);
  const cols = preview.events.filter((e) => e.kind === 'col').length;

  const onPdf = async (file: File) => {
    setBusy(true);
    setPdfMessage(null);
    try {
      const { extractPdfText } = await import('../import/pdf');
      const extracted = await extractPdfText(await file.arrayBuffer());
      if (!extracted.trim()) setPdfMessage('No text found in this PDF. Scanned (image) PDFs are not supported.');
      else if (looksLikeNotationPdf(extracted)) setPdfMessage(NOTATION_PDF_MESSAGE);
      setText(extracted);
    } catch (e) {
      setPdfMessage(`Could not read this PDF: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const selectLine = (line: number) => {
    const ta = ref.current;
    if (!ta) return;
    const lines = text.split('\n');
    const start = lines.slice(0, line - 1).reduce((a, l) => a + l.length + 1, 0);
    ta.focus();
    ta.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0));
  };

  const doImport = () => {
    if (hasPins && !window.confirm('Re-importing will clear your manual lute placements for the tab. Continue?')) return;
    onImport(preview, text);
  };

  const summary =
    `${cols} column${cols === 1 ? '' : 's'} found` +
    (preview.capo !== null ? ` · capo ${preview.capo}` : '') +
    (preview.tuning ? ` · tuning ${preview.tuning.name}` : '');

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Import guitar tab">
      <div className="modal">
        <h2>Import guitar tab</h2>
        <p className="muted">Paste plain-text tab, or upload a PDF that contains plain-text tab.</p>
        <textarea
          ref={ref}
          data-testid="import-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={16}
          spellCheck={false}
          aria-label="Tab text"
        />
        <div className="row">
          <label className="file-button">
            Upload PDF
            <input
              type="file"
              accept="application/pdf,.pdf"
              data-testid="pdf-input"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onPdf(f);
                e.target.value = '';
              }}
            />
          </label>
          {busy && <span className="muted">Reading PDF…</span>}
        </div>
        {pdfMessage && <p className="error" role="alert">{pdfMessage}</p>}
        <p className="muted">{summary}</p>
        <WarningsPanel warnings={preview.warnings} onSelect={(w) => w.line && selectLine(w.line)} />
        <div className="row end">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" className="primary" data-testid="do-import" disabled={cols === 0} onClick={doImport}>Import</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement `src/ui/GuitarView.tsx`**

```tsx
import { useState } from 'react';
import type { Midi, Piece, Warning } from '../core/model';
import { GUITAR_PRESETS, findPreset } from '../core/tunings';
import { chordPitches } from '../core/piece';
import { addChord, applyImport, moveChord, removeChord, setCapo, setGuitarTuning, updateChord } from '../core/edit';
import { GuitarChordBox } from './GuitarChordBox';
import { GuitarTabView } from './GuitarTabView';
import { ImportDialog } from './ImportDialog';
import { WarningsPanel } from './WarningsPanel';
import { clampInt } from './util';

export interface GuitarViewProps {
  piece: Piece;
  update: (fn: (p: Piece) => Piece) => void;
  flats: boolean;
  onPlayChord: (pitches: Midi[]) => void;
}

export function GuitarView({ piece, update, flats, onPlayChord }: GuitarViewProps) {
  const [importing, setImporting] = useState(false);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const g = piece.guitar;
  const isPreset = GUITAR_PRESETS.some((t) => t.id === g.tuning.id);
  return (
    <section className="view guitar-view">
      <div className="settings-bar">
        <label>
          Guitar tuning
          <select
            value={g.tuning.id}
            onChange={(e) => {
              const t = findPreset(e.target.value);
              if (t) update((p) => setGuitarTuning(p, t));
            }}
          >
            {GUITAR_PRESETS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            {!isPreset && <option value={g.tuning.id}>{g.tuning.name}</option>}
          </select>
        </label>
        <label>
          Capo
          <input type="number" min={0} max={12} value={g.capo} onChange={(e) => update((p) => setCapo(p, clampInt(e.target.value, 0, 12)))} />
        </label>
      </div>

      <h2>Chord boxes</h2>
      <div className="chord-grid">
        {g.chords.map((c, i) => (
          <GuitarChordBox
            key={i}
            shape={c}
            tuning={g.tuning}
            capo={g.capo}
            flats={flats}
            onChange={(s) => update((p) => updateChord(p, i, s))}
            onPlay={() => onPlayChord(chordPitches(c, g.tuning, g.capo).map((x) => x.pitch))}
            onRemove={() => update((p) => removeChord(p, i))}
            onMove={(d) => update((p) => moveChord(p, i, d))}
          />
        ))}
        <button type="button" className="add-chord" data-testid="add-chord" onClick={() => update(addChord)}>+ Add chord</button>
      </div>

      <h2>
        Tab
        <button type="button" data-testid="open-import" onClick={() => setImporting(true)}>Import tab…</button>
      </h2>
      <GuitarTabView events={g.tab} tuning={g.tuning} />
      <WarningsPanel warnings={warnings} />

      {importing && (
        <ImportDialog
          initialText={g.sourceText ?? ''}
          hasPins={Object.keys(piece.overrides.tabPins).length > 0}
          onClose={() => setImporting(false)}
          onImport={(imp, text) => {
            update((p) => applyImport(p, imp, text));
            setWarnings(imp.warnings);
            setImporting(false);
          }}
        />
      )}
    </section>
  );
}
```

- [ ] **Step 5: Run tests, typecheck and build**

Run: `npx vitest run tests/ui && npm run typecheck && npm run build`
Expected: PASS; build succeeds (the PDF modules are split into a lazy chunk).

- [ ] **Step 6: Commit**

```bash
git add src/ui tests/ui
git commit -m "feat(ui): tab import dialog (text + PDF) and guitar view

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 21: Lute chord box and lute tab views

**Files:**
- Create: `src/ui/LuteChordBox.tsx`, `src/ui/LuteTabView.tsx`
- Test: `tests/ui/lute.test.tsx`

**Interfaces:**
- Consumes: `LuteChord`, `LuteResult`, `LuteNote`, `Notation`, `Tuning` (Task 2), `fretGlyph`, `noteGlyph` (Task 4), `midiToName`, `prettyName` (Task 2), `layoutLuteTab`, `LAYOUT` (Task 17).
- Produces: `LuteChordBox({ chord, tuning, notation, flats, onCycle(noteIndex), onVoicing(delta: -1 | 1), onPlay })` with test ids `lute-chordbox`, `lute-note-<srcNoteIndex>`; `LuteTabView({ result, tuning, notation, playing, onCycle(colIndex, noteIndex), width? })` with ids `lute-tab-svg` (element id), test ids `lute-tab`, `glyph-<col>-<note>`, `lute-tab-empty`.
- Rendering: lute chord boxes have one vertical line per fretted course (max = `frettedCourses`), bass left; stopped notes are filled dots containing the fret glyph in the current notation; diapasons are written under the diagram with `noteGlyph`. Shifted notes get class `shifted`, pinned notes class `pinned`.

- [ ] **Step 1: Write the failing test `tests/ui/lute.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest';
import { html, noop } from './render';
import { LuteChordBox } from '../../src/ui/LuteChordBox';
import { LuteTabView } from '../../src/ui/LuteTabView';
import { convertPiece } from '../../src/core/convert/convert';
import { newPiece } from '../../src/core/piece';
import { parseAsciiTab } from '../../src/core/parse/asciiTab';
import { findPreset } from '../../src/core/tunings';
import { AM_ARPEGGIO } from '../core/parse/fixtures';
import type { LuteNote, LuteResult, Notation, Tuning } from '../../src/core/model';

const six = findPreset('lute-6-g')!;

function eChordAtPlus3() {
  const p = newPiece();
  p.guitar.chords = [{ name: '', frets: [0, 0, 1, 2, 2, 0], baseFret: 1 }];
  p.lute.transpose = 3;
  return convertPiece(p);
}

describe('LuteChordBox', () => {
  it('draws stopped notes with French letters', () => {
    const r = eChordAtPlus3();
    const out = html(<LuteChordBox chord={r.chords[0]} tuning={six} notation="french" flats={r.flats} onCycle={noop} onVoicing={noop} onPlay={noop} />);
    expect(out).toContain('data-testid="lute-chordbox"');
    expect(out).toContain('>G<');
    expect(out.match(/>c<\/text>/g)).toHaveLength(3);
    expect(out).toContain('1/');
  });
  it('uses numbers in Italian notation', () => {
    const r = eChordAtPlus3();
    const out = html(<LuteChordBox chord={r.chords[0]} tuning={six} notation="italian" flats={r.flats} onCycle={noop} onVoicing={noop} onPlay={noop} />);
    expect(out.match(/>2<\/text>/g)).toHaveLength(3);
  });
  it('writes diapasons under the diagram', () => {
    const eight = findPreset('lute-8-g')!;
    const chord = { name: 'D', chosen: 0, voicings: [{ notes: [{ placement: { course: 7, fret: 0 }, pitch: 38, shifted: 0, pinned: false, srcNoteIndex: 0 }], dropped: [], cost: 0 }] };
    const out = html(<LuteChordBox chord={chord} tuning={eight} notation="french" flats onCycle={noop} onVoicing={noop} onPlay={noop} />);
    expect(out).toContain('>/a</text>');
  });
  it('renders empty states', () => {
    const empty = { name: '', chosen: 0, voicings: [{ notes: [], dropped: [], cost: 0 }] };
    expect(() => html(<LuteChordBox chord={empty} tuning={six} notation="french" flats onCycle={noop} onVoicing={noop} onPlay={noop} />)).not.toThrow();
    const none = { name: '', chosen: 0, voicings: [] };
    expect(html(<LuteChordBox chord={none} tuning={six} notation="french" flats onCycle={noop} onVoicing={noop} onPlay={noop} />)).toContain('No playable voicing');
  });
});

describe('LuteTabView', () => {
  it('renders glyphs with ids and highlights the playing column', () => {
    const p = newPiece();
    p.guitar.tab = parseAsciiTab(AM_ARPEGGIO).events;
    p.lute.transpose = 3;
    const out = html(<LuteTabView result={convertPiece(p)} tuning={six} notation="french" playing={0} onCycle={noop} />);
    expect(out).toContain('id="lute-tab-svg"');
    expect(out).toContain('data-testid="glyph-0-0"');
    expect(out).toContain('class="playing"');
  });
  it('shows an empty state', () => {
    expect(html(<LuteTabView result={convertPiece(newPiece())} tuning={six} notation="french" playing={null} onCycle={noop} />)).toContain('No tab yet');
  });
});

/** One note on every course (fret 2 on fretted courses, open on diapasons), as a chord and as a tab run. */
function everyCourse(t: Tuning): LuteResult {
  const notes: LuteNote[] = t.courses.map((open, course) => {
    const fret = course < t.frettedCourses ? 2 : 0;
    return { placement: { course, fret }, pitch: open + fret, shifted: 0, pinned: false, srcNoteIndex: course };
  });
  return {
    chords: [{ name: 'G', chosen: 0, voicings: [{ notes, dropped: [], cost: 0 }] }],
    tab: [...notes.map((n, i) => ({ kind: 'col' as const, index: i, x: i * 3, notes: [n], dropped: [] })), { kind: 'bar' }, { kind: 'break' }],
    warnings: [],
    totalCost: 0,
    stats: { shifted: 0, dropped: 0 },
    flats: false,
  };
}

describe('SVG snapshots', () => {
  const presets = ['lute-6-g', 'lute-7-g', 'lute-8-g', 'lute-10-g', 'lute-13-baroque-dm'];
  const notations: Notation[] = ['french', 'italian', 'modern'];
  for (const notation of notations) {
    for (const id of presets) {
      it(`${notation}, ${id}`, () => {
        const t = findPreset(id)!;
        const r = everyCourse(t);
        expect(html(<LuteChordBox chord={r.chords[0]} tuning={t} notation={notation} flats={false} onCycle={noop} onVoicing={noop} onPlay={noop} />)).toMatchSnapshot();
        expect(html(<LuteTabView result={r} tuning={t} notation={notation} playing={null} onCycle={noop} />)).toMatchSnapshot();
      });
    }
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/ui/lute.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/ui/LuteChordBox.tsx`**

```tsx
import type { LuteChord, LuteNote, Notation, Tuning } from '../core/model';
import { fretGlyph, noteGlyph } from '../core/notation';
import { midiToName, prettyName } from '../core/pitch';

const LEFT = 18;
const TOP = 34;
const SG = 17;
const FG = 22;
const DIAP_W = 26;

export interface LuteChordBoxProps {
  chord: LuteChord;
  tuning: Tuning;
  notation: Notation;
  flats: boolean;
  onCycle: (noteIndex: number) => void;
  onVoicing: (delta: -1 | 1) => void;
  onPlay: () => void;
}

export function LuteChordBox({ chord, tuning, notation, flats, onCycle, onVoicing, onPlay }: LuteChordBoxProps) {
  const v = chord.voicings[chord.chosen];
  const controls = (
    <div className="box-controls">
      <button type="button" aria-label="Previous voicing" disabled={chord.chosen <= 0} onClick={() => onVoicing(-1)}>◀</button>
      <span>{`${chord.voicings.length ? chord.chosen + 1 : 0}/${chord.voicings.length}`}</span>
      <button type="button" aria-label="Next voicing" disabled={chord.chosen >= chord.voicings.length - 1} onClick={() => onVoicing(1)}>▶</button>
      <button type="button" aria-label="Play chord" onClick={onPlay}>♪</button>
    </div>
  );
  if (!v) {
    return (
      <figure className="chordbox lute" data-testid="lute-chordbox">
        <div className="chord-title">{chord.name ? prettyName(chord.name) : '—'}</div>
        <p className="muted">No playable voicing</p>
        {controls}
      </figure>
    );
  }
  const lines = Math.min(tuning.frettedCourses, tuning.courses.length);
  const onBoard = v.notes.filter((n) => n.placement.course < lines);
  const diapasons = v.notes.filter((n) => n.placement.course >= lines).sort((a, b) => a.placement.course - b.placement.course);
  const stopped = onBoard.filter((n) => n.placement.fret > 0).map((n) => n.placement.fret);
  const maxF = stopped.length ? Math.max(...stopped) : 0;
  const base = maxF > 5 ? Math.min(...stopped) : 1;
  const rows = Math.max(4, maxF - base + 1);
  const xOf = (c: number) => LEFT + (lines - 1 - c) * SG;
  const yOf = (i: number) => TOP + i * FG;
  const gridBottom = yOf(rows);
  const width = Math.max(LEFT * 2 + (lines - 1) * SG, LEFT + diapasons.length * DIAP_W);
  const height = gridBottom + (diapasons.length ? 26 : 8);
  const played = new Set(v.notes.map((n) => n.placement.course));
  const cls = (n: LuteNote, base: string) => `${base}${n.shifted ? ' shifted' : ''}${n.pinned ? ' pinned' : ''}`;
  const names = [...v.notes].sort((a, b) => a.pitch - b.pitch).map((n) => prettyName(midiToName(n.pitch, flats, false))).join(' ');

  return (
    <figure className="chordbox lute" data-testid="lute-chordbox">
      <div className="chord-title">{chord.name ? prettyName(chord.name) : '—'}</div>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="chordbox-svg">
        {base === 1 ? (
          <rect x={xOf(lines - 1)} y={TOP - 3} width={xOf(0) - xOf(lines - 1)} height={4} fill="currentColor" />
        ) : (
          <text x={2} y={TOP + FG / 2 + 4} fontSize={11} fill="currentColor">{base}</text>
        )}
        {Array.from({ length: rows + 1 }, (_, i) => (
          <line key={`f${i}`} x1={xOf(lines - 1)} x2={xOf(0)} y1={yOf(i)} y2={yOf(i)} stroke="currentColor" strokeWidth={1} />
        ))}
        {Array.from({ length: lines }, (_, c) => (
          <line key={`c${c}`} x1={xOf(c)} x2={xOf(c)} y1={yOf(0)} y2={gridBottom} stroke="currentColor" strokeWidth={1} />
        ))}
        {Array.from({ length: lines }, (_, c) =>
          played.has(c) ? null : (
            <text key={`m${c}`} x={xOf(c)} y={TOP - 8} textAnchor="middle" fontSize={12} fill="currentColor">×</text>
          ),
        )}
        {onBoard.map((n) =>
          n.placement.fret === 0 ? (
            <circle
              key={`n${n.srcNoteIndex}`}
              data-testid={`lute-note-${n.srcNoteIndex}`}
              className={cls(n, 'lute-dot open')}
              cx={xOf(n.placement.course)}
              cy={TOP - 13}
              r={5}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              onClick={() => onCycle(n.srcNoteIndex)}
            />
          ) : (
            <g key={`n${n.srcNoteIndex}`} data-testid={`lute-note-${n.srcNoteIndex}`} className={cls(n, 'lute-dot')} onClick={() => onCycle(n.srcNoteIndex)}>
              <circle cx={xOf(n.placement.course)} cy={yOf(n.placement.fret - base) + FG / 2} r={7.5} fill="currentColor" />
              <text className="dot-text" x={xOf(n.placement.course)} y={yOf(n.placement.fret - base) + FG / 2 + 4} textAnchor="middle" fontSize={10} fill="#ffffff">
                {fretGlyph(n.placement.fret, notation)}
              </text>
            </g>
          ),
        )}
        {diapasons.map((n, i) => (
          <text
            key={`d${n.srcNoteIndex}`}
            data-testid={`lute-note-${n.srcNoteIndex}`}
            className={cls(n, 'lute-dot diapason')}
            x={LEFT + i * DIAP_W}
            y={gridBottom + 18}
            fontSize={12}
            fill="currentColor"
            onClick={() => onCycle(n.srcNoteIndex)}
          >
            {noteGlyph(n.placement.course, n.placement.fret, notation)}
          </text>
        ))}
      </svg>
      <figcaption className="notes">{names || '—'}</figcaption>
      {v.dropped.length > 0 && (
        <div className="warn-inline">{`Dropped: ${v.dropped.map((p) => prettyName(midiToName(p, flats, false))).join(' ')}`}</div>
      )}
      {controls}
    </figure>
  );
}
```

- [ ] **Step 4: Implement `src/ui/LuteTabView.tsx`**

```tsx
import { useMemo } from 'react';
import type { LuteResult, Notation, Tuning } from '../core/model';
import { layoutLuteTab, LAYOUT } from '../core/luteTabLayout';

export interface LuteTabViewProps {
  result: LuteResult;
  tuning: Tuning;
  notation: Notation;
  playing: number | null;
  onCycle: (colIndex: number, noteIndex: number) => void;
  width?: number;
}

export function LuteTabView({ result, tuning, notation, playing, onCycle, width = 900 }: LuteTabViewProps) {
  const layout = useMemo(() => layoutLuteTab(result.tab, tuning, notation, width), [result.tab, tuning, notation, width]);
  if (!layout.systems.length) {
    return <p className="muted" data-testid="lute-tab-empty">No tab yet. Import guitar tab in the Guitar view.</p>;
  }
  return (
    <svg
      id="lute-tab-svg"
      data-testid="lute-tab"
      className="lute-tab"
      width={layout.width}
      height={layout.height}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
    >
      {layout.systems.map((s, si) => (
        <g key={si}>
          {s.columns
            .filter((c) => c.colIndex === playing)
            .map((c) => (
              <rect key="hl" className="playing" x={c.x - 9} y={s.y} width={18} height={s.height} fill="transparent" />
            ))}
          {s.lineYs.map((y, i) => (
            <line key={`l${i}`} x1={LAYOUT.margin / 2} x2={s.width - LAYOUT.margin / 2} y1={y} y2={y} stroke="currentColor" strokeWidth={0.8} />
          ))}
          {s.bars.map((x, i) => (
            <line key={`b${i}`} x1={x} x2={x} y1={s.lineYs[0]} y2={s.lineYs[s.lineYs.length - 1]} stroke="currentColor" strokeWidth={1} />
          ))}
          {s.glyphs.map((g, gi) => {
            const w = Math.max(12, g.text.length * 7 + 4);
            return (
              <g
                key={gi}
                className={`glyph${g.shifted ? ' shifted' : ''}${g.pinned ? ' pinned' : ''}`}
                data-testid={`glyph-${g.colIndex}-${g.noteIndex}`}
                onClick={() => onCycle(g.colIndex, g.noteIndex)}
              >
                {g.ledger && <line x1={g.x - 9} x2={g.x + 9} y1={g.y} y2={g.y} stroke="currentColor" strokeWidth={0.8} />}
                <rect className="glyph-bg" x={g.x - w / 2} y={g.y - 7} width={w} height={14} fill="#ffffff" />
                <text x={g.x} y={g.y + 4} textAnchor="middle" fontSize={13} fill="currentColor" fontFamily="Georgia, serif">{g.text}</text>
                {g.shifted && <circle cx={g.x} cy={g.y - 10} r={1.8} fill="currentColor" />}
                {g.pinned && <line x1={g.x - 5} x2={g.x + 5} y1={g.y + 9} y2={g.y + 9} stroke="currentColor" strokeWidth={1.2} />}
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run tests/ui && npm run typecheck`
Expected: PASS. The first run writes `tests/ui/__snapshots__/lute.test.tsx.snap` (30 snapshots: French, Italian and modern × 6, 7, 8, 10 and 13 courses). Before committing it, check a few by eye: paste the French 10-course and Italian 13-course tab SVGs into a blank HTML page and confirm the diapason marks sit below (French) or above (Italian) the staff without overlapping the next system. Do not run this step with `CI` set, because Vitest will not write new snapshots in CI mode.

- [ ] **Step 6: Commit**

```bash
git add src/ui tests/ui
git commit -m "feat(ui): lute chord boxes and lute tablature SVG

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 22: Lute settings bar, tuning editor and lute view

**Files:**
- Create: `src/ui/LuteSettingsBar.tsx`, `src/ui/TuningEditor.tsx`, `src/ui/LuteView.tsx`
- Test: `tests/ui/luteView.test.tsx`

**Interfaces:**
- Consumes: `LUTE_PRESETS`, `findPreset`, `addBassCourse`, `removeBassCourse`, `setCoursePitch`, `setFrettedCourses` (Task 3), `pitchClass`, `octaveOf`, `pcName`, `prettyName` (Task 2), `limitsOf`, `cycleNote` (Task 11), `autoTranspose` (Task 11), edit helpers incl. `pinTabColumn`, `pinChord` (Task 12), `LuteChordBox`, `LuteTabView` (Task 21), `WarningsPanel` (Task 18), `clampInt` (Task 18).
- Produces: `LuteSettingsBar({ settings, hasOverrides, onChange(patch), onEditTuning, onAuto, onClearOverrides })` with test ids `lute-settings`, `lute-tuning`, `transpose`, `auto-transpose`, `notation`; `TuningEditor({ tuning, onChange, onClose })` with test id `tuning-editor`; `LuteView({ piece, update, result, playing, onPlayChord })`.
- Behaviour: clicking a lute note applies `cycleNote(shownNotes, noteIndex, limits)`: the clicked note moves to its next placement that fits beside the others, and every shown note is pinned where it is (tab: `pinTabColumn`; chords: `pinChord`, which also resets the chosen voicing); ◀/▶ on a chord calls `setChordVoicing`; "+3 guitar shapes" sets transpose 3; "Auto" sets `autoTranspose(piece)`.

- [ ] **Step 1: Write the failing test `tests/ui/luteView.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest';
import { html, noop } from './render';
import { LuteSettingsBar } from '../../src/ui/LuteSettingsBar';
import { TuningEditor } from '../../src/ui/TuningEditor';
import { LuteView } from '../../src/ui/LuteView';
import { newPiece } from '../../src/core/piece';
import { convertPiece } from '../../src/core/convert/convert';
import { addBassCourse, findPreset } from '../../src/core/tunings';

describe('LuteSettingsBar', () => {
  it('shows presets, transpose shortcuts and notation choices', () => {
    const out = html(<LuteSettingsBar settings={newPiece().lute} hasOverrides={false} onChange={noop} onEditTuning={noop} onAuto={noop} onClearOverrides={noop} />);
    expect(out).toContain('Renaissance 6-course in G');
    expect(out).toContain('Baroque 13-course D minor');
    expect(out).toContain('+3 guitar shapes');
    expect(out).toContain('French (letters)');
    expect(out).toContain('Italian (numbers)');
    expect(out).toContain('Modern (numbers)');
  });
  it('lists a custom tuning as an extra option', () => {
    const s = { ...newPiece().lute, tuning: addBassCourse(findPreset('lute-6-g')!) };
    expect(html(<LuteSettingsBar settings={s} hasOverrides onChange={noop} onEditTuning={noop} onAuto={noop} onClearOverrides={noop} />)).toContain('>Custom<');
  });
});

describe('TuningEditor', () => {
  it('shows one row per course and the fretted/open status', () => {
    const out = html(<TuningEditor tuning={findPreset('lute-8-g')!} onChange={noop} onClose={noop} />);
    expect(out.match(/<tr>/g)).toHaveLength(9);
    expect(out).toContain('open (diapason)');
    expect(out).toContain('+ Add bass course');
  });
});

describe('LuteView', () => {
  it('renders chord boxes, tab section and settings', () => {
    const p = newPiece();
    p.guitar.chords = [{ name: '', frets: [0, 0, 1, 2, 2, 0], baseFret: 1 }];
    const out = html(<LuteView piece={p} update={noop} result={convertPiece(p)} playing={null} onPlayChord={noop} />);
    expect(out).toContain('data-testid="lute-settings"');
    expect(out).toContain('data-testid="lute-chordbox"');
    expect(out).toContain('Lute tab');
    expect(out).toContain('data-testid="warnings"');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/ui/luteView.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/ui/LuteSettingsBar.tsx`**

```tsx
import type { LuteSettings, Notation } from '../core/model';
import { LUTE_PRESETS, findPreset } from '../core/tunings';
import { clampInt } from './util';

export interface LuteSettingsBarProps {
  settings: LuteSettings;
  hasOverrides: boolean;
  onChange: (patch: Partial<LuteSettings>) => void;
  onEditTuning: () => void;
  onAuto: () => void;
  onClearOverrides: () => void;
}

export function LuteSettingsBar({ settings, hasOverrides, onChange, onEditTuning, onAuto, onClearOverrides }: LuteSettingsBarProps) {
  const isPreset = LUTE_PRESETS.some((t) => t.id === settings.tuning.id);
  return (
    <div className="settings-bar" data-testid="lute-settings">
      <label>
        Lute tuning
        <select
          data-testid="lute-tuning"
          value={settings.tuning.id}
          onChange={(e) => {
            const t = findPreset(e.target.value);
            if (t) onChange({ tuning: t });
          }}
        >
          {LUTE_PRESETS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          {!isPreset && <option value={settings.tuning.id}>{settings.tuning.name}</option>}
        </select>
      </label>
      <button type="button" onClick={onEditTuning}>Edit tuning…</button>
      <label>
        Transpose
        <input
          type="number"
          data-testid="transpose"
          min={-12}
          max={12}
          value={settings.transpose}
          onChange={(e) => onChange({ transpose: clampInt(e.target.value, -12, 12) })}
        />
      </label>
      <button type="button" title="Keeps guitar shapes on a lute in G" onClick={() => onChange({ transpose: 3 })}>+3 guitar shapes</button>
      <button type="button" data-testid="auto-transpose" title="Pick the transpose that plays best" onClick={onAuto}>Auto</button>
      <label>
        Max fret
        <input type="number" min={4} max={12} value={settings.maxFret} onChange={(e) => onChange({ maxFret: clampInt(e.target.value, 4, 12) })} />
      </label>
      <label>
        Max stretch
        <input type="number" min={2} max={6} value={settings.maxStretch} onChange={(e) => onChange({ maxStretch: clampInt(e.target.value, 2, 6) })} />
      </label>
      <label>
        Notation
        <select data-testid="notation" value={settings.notation} onChange={(e) => onChange({ notation: e.target.value as Notation })}>
          <option value="french">French (letters)</option>
          <option value="italian">Italian (numbers)</option>
          <option value="modern">Modern (numbers)</option>
        </select>
      </label>
      <button type="button" disabled={!hasOverrides} onClick={onClearOverrides}>Clear overrides</button>
    </div>
  );
}
```

- [ ] **Step 4: Implement `src/ui/TuningEditor.tsx`**

```tsx
import type { Tuning } from '../core/model';
import { octaveOf, pcName, pitchClass, prettyName } from '../core/pitch';
import { addBassCourse, removeBassCourse, setCoursePitch, setFrettedCourses } from '../core/tunings';
import { clampInt } from './util';

const PCS = Array.from({ length: 12 }, (_, i) => i);
const OCTAVES = [0, 1, 2, 3, 4, 5];

export interface TuningEditorProps { tuning: Tuning; onChange: (t: Tuning) => void; onClose: () => void; }

export function TuningEditor({ tuning, onChange, onClose }: TuningEditorProps) {
  return (
    <div className="tuning-editor" data-testid="tuning-editor">
      <h3>Edit tuning</h3>
      <p className="muted">Courses 4 and below are octave-strung on a real lute, so bass pitches here are nominal.</p>
      <table>
        <thead>
          <tr><th>Course</th><th>Note</th><th>Octave</th><th>Type</th></tr>
        </thead>
        <tbody>
          {tuning.courses.map((m, c) => (
            <tr key={c}>
              <td>{c + 1}</td>
              <td>
                <select
                  aria-label={`Course ${c + 1} note`}
                  value={pitchClass(m)}
                  onChange={(e) => onChange(setCoursePitch(tuning, c, (octaveOf(m) + 1) * 12 + Number(e.target.value)))}
                >
                  {PCS.map((pc) => <option key={pc} value={pc}>{prettyName(pcName(pc, true))}</option>)}
                </select>
              </td>
              <td>
                <select
                  aria-label={`Course ${c + 1} octave`}
                  value={octaveOf(m)}
                  onChange={(e) => onChange(setCoursePitch(tuning, c, (Number(e.target.value) + 1) * 12 + pitchClass(m)))}
                >
                  {OCTAVES.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </td>
              <td>{c < tuning.frettedCourses ? 'fretted' : 'open (diapason)'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <button type="button" disabled={tuning.courses.length >= 14} onClick={() => onChange(addBassCourse(tuning))}>+ Add bass course</button>
        <button type="button" disabled={tuning.courses.length <= 6} onClick={() => onChange(removeBassCourse(tuning))}>− Remove bass course</button>
        <label>
          Fretted courses
          <input
            type="number"
            min={1}
            max={tuning.courses.length}
            value={tuning.frettedCourses}
            onChange={(e) => onChange(setFrettedCourses(tuning, clampInt(e.target.value, 1, tuning.courses.length)))}
          />
        </label>
        <button type="button" className="primary" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Implement `src/ui/LuteView.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import type { LuteColumn, LuteResult, Midi, Piece } from '../core/model';
import { cycleNote, limitsOf } from '../core/convert/convert';
import { autoTranspose } from '../core/convert/autoTranspose';
import { clearOverrides, pinChord, pinTabColumn, setChordVoicing, setLuteSettings } from '../core/edit';
import { LuteSettingsBar } from './LuteSettingsBar';
import { TuningEditor } from './TuningEditor';
import { LuteChordBox } from './LuteChordBox';
import { LuteTabView } from './LuteTabView';
import { WarningsPanel } from './WarningsPanel';

export interface LuteViewProps {
  piece: Piece;
  update: (fn: (p: Piece) => Piece) => void;
  result: LuteResult;
  playing: number | null;
  onPlayChord: (pitches: Midi[]) => void;
}

export function LuteView({ piece, update, result, playing, onPlayChord }: LuteViewProps) {
  const [editing, setEditing] = useState(false);
  const [width, setWidth] = useState(900);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(320, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const s = piece.lute;
  const limits = limitsOf(s);
  const o = piece.overrides;
  const hasOverrides = Object.keys(o.tabPins).length + Object.keys(o.chordPins).length + Object.keys(o.chordVoicing).length > 0;

  const cycleTab = (colIndex: number, noteIndex: number) => {
    const col = result.tab.find((e): e is LuteColumn => e.kind === 'col' && e.index === colIndex);
    const pins = col && cycleNote(col.notes, noteIndex, limits);
    if (pins) update((p) => pinTabColumn(p, colIndex, pins));
  };
  const cycleChord = (chordIndex: number, noteIndex: number) => {
    const c = result.chords[chordIndex];
    const pins = c?.voicings[c.chosen] && cycleNote(c.voicings[c.chosen].notes, noteIndex, limits);
    if (pins) update((p) => pinChord(p, chordIndex, pins));
  };

  return (
    <section className="view lute-view">
      <LuteSettingsBar
        settings={s}
        hasOverrides={hasOverrides}
        onChange={(patch) => update((p) => setLuteSettings(p, patch))}
        onEditTuning={() => setEditing((e) => !e)}
        onAuto={() => update((p) => setLuteSettings(p, { transpose: autoTranspose(p) }))}
        onClearOverrides={() => update(clearOverrides)}
      />
      {editing && <TuningEditor tuning={s.tuning} onChange={(t) => update((p) => setLuteSettings(p, { tuning: t }))} onClose={() => setEditing(false)} />}

      <h2>Lute chord boxes</h2>
      <div className="chord-grid">
        {result.chords.map((c, i) => (
          <LuteChordBox
            key={i}
            chord={c}
            tuning={s.tuning}
            notation={s.notation}
            flats={result.flats}
            onCycle={(n) => cycleChord(i, n)}
            onVoicing={(d) => update((p) => setChordVoicing(p, i, Math.max(0, c.chosen + d)))}
            onPlay={() => onPlayChord((c.voicings[c.chosen]?.notes ?? []).map((n) => n.pitch))}
          />
        ))}
        {!result.chords.length && <p className="muted">No chord boxes yet. Add them in the Guitar view.</p>}
      </div>

      <h2>Lute tab</h2>
      <p className="muted hint">Click a note to move it to another course; your choice is kept when the conversion re-runs.</p>
      <div ref={wrapRef} className="tab-wrap">
        <LuteTabView result={result} tuning={s.tuning} notation={s.notation} playing={playing} onCycle={cycleTab} width={width} />
      </div>
      <WarningsPanel warnings={result.warnings} />
    </section>
  );
}
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run tests/ui && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui tests/ui
git commit -m "feat(ui): lute settings, tuning editor and lute view with overrides

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 23: App assembly, playback, exports and styling

**Files:**
- Create: `src/ui/ErrorBoundary.tsx`
- Modify: `src/ui/App.tsx` (full rewrite), `src/styles.css` (full rewrite), `src/main.tsx` (wrap `App` in `ErrorBoundary`), `tests/ui/App.test.tsx` (rewrite)

**Interfaces:**
- Consumes: everything from Tasks 11–22 (`usePieces`, `browserStorage`, `convertPiece`, `guitarColumns`, `preferFlats`, `toTabCode`, `exportPieces`, `importPieces`, `setTitle`, `Player`, `stepsFromColumns`, `Header`, `PieceList`, `GuitarView`, `LuteView`, `downloadText`, `slug`, `svgMarkup`, `combineSvgs`).
- Produces: `App({ storage?: StorageLike })`, `ErrorBoundary` (React class component; on a render error shows the message, "Download saved data" for every `g2l:` localStorage key, and "Reload").
- Behaviour: one `Player`; "Play tab" plays the guitar columns in Guitar view and the converted lute columns in Lute view, highlighting the current lute column; exports per spec §9; the print view shows the piece title plus the current view's chord boxes and tab.

- [ ] **Step 1: Rewrite the failing test `tests/ui/App.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest';
import { html } from './render';
import { App } from '../../src/ui/App';
import { ErrorBoundary } from '../../src/ui/ErrorBoundary';
import { MemoryStorage, PieceStore } from '../../src/core/storage';
import { newPiece } from '../../src/core/piece';

describe('ErrorBoundary', () => {
  it('shows a recovery screen instead of a blank page', () => {
    // Server rendering does not run error boundaries, so drive the component directly.
    const b = new ErrorBoundary({ children: null });
    b.state = ErrorBoundary.getDerivedStateFromError(new Error('boom'));
    const out = html(<>{b.render()}</>);
    expect(out).toContain('Something went wrong');
    expect(out).toContain('boom');
    expect(out).toContain('Download saved data');
  });
});

describe('App', () => {
  it('starts with a new untitled piece in the guitar view', () => {
    const out = html(<App storage={new MemoryStorage()} />);
    expect(out).toContain('Guitar → Lute');
    expect(out).toContain('value="Untitled"');
    expect(out).toContain('data-testid="add-chord"');
  });
  it('opens the most recent saved piece', () => {
    const s = new MemoryStorage();
    new PieceStore(s).save(newPiece('Greensleeves'));
    expect(html(<App storage={s} />)).toContain('value="Greensleeves"');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/ui/App.test.tsx`
Expected: FAIL — `ErrorBoundary` does not exist yet, and the scaffold `App` ignores `storage` and has no `add-chord`.

- [ ] **Step 3: Rewrite `src/ui/App.tsx`**

```tsx
import { useCallback, useMemo, useState } from 'react';
import type { Midi } from '../core/model';
import { browserStorage, exportPieces, importPieces, type StorageLike } from '../core/storage';
import { convertPiece } from '../core/convert/convert';
import { guitarColumns } from '../core/piece';
import { preferFlats } from '../core/pitch';
import { toTabCode } from '../core/tabcode';
import { setTitle } from '../core/edit';
import { Player, stepsFromColumns } from '../audio/pluck';
import { usePieces } from './state';
import { Header, type ExportKind, type View } from './Header';
import { PieceList } from './PieceList';
import { GuitarView } from './GuitarView';
import { LuteView } from './LuteView';
import { combineSvgs, downloadText, slug, svgMarkup } from './util';

export function App({ storage }: { storage?: StorageLike }) {
  const [store] = useState<StorageLike>(() => storage ?? browserStorage());
  const s = usePieces(store);
  const { piece, update } = s;
  const [view, setView] = useState<View>('guitar');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [playing, setPlaying] = useState<number | null>(null);
  const [msPerUnit, setMsPerUnit] = useState(120);
  const player = useMemo(() => new Player(), []);

  const { guitar, lute, overrides } = piece;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const result = useMemo(() => convertPiece(piece), [guitar, lute, overrides]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const guitarFlats = useMemo(() => preferFlats(guitarColumns(piece).flatMap((c) => c.pitches)), [guitar]);

  const playChord = useCallback((pitches: Midi[]) => player.playChord(pitches), [player]);

  const playTab = () => {
    const cols =
      view === 'guitar'
        ? guitarColumns(piece)
        : result.tab.flatMap((e) => (e.kind === 'col' ? [{ x: e.x, pitches: e.notes.map((n) => n.pitch), index: e.index }] : []));
    player.playSteps(stepsFromColumns(cols, msPerUnit), setPlaying);
    setPlaying(cols.length ? cols[0].index : null);
  };
  const stop = () => {
    player.stop();
    setPlaying(null);
  };

  const onExport = (kind: ExportKind) => {
    const name = slug(piece.title);
    switch (kind) {
      case 'json':
        downloadText(`${name}.json`, exportPieces([piece]), 'application/json');
        return;
      case 'json-all':
        downloadText('guitar-to-lute-pieces.json', exportPieces(s.allPieces()), 'application/json');
        return;
      case 'tabcode':
        downloadText(`${name}.tc`, toTabCode(result, piece.title), 'text/plain');
        return;
      case 'tab-svg': {
        const el = document.getElementById('lute-tab-svg') as SVGSVGElement | null;
        if (!el) {
          window.alert('Open the Lute view (with some tab) first.');
          return;
        }
        downloadText(`${name}-lute-tab.svg`, svgMarkup(el), 'image/svg+xml');
        return;
      }
      case 'chords-svg': {
        const els = [...document.querySelectorAll<SVGSVGElement>('[data-testid="lute-chordbox"] svg')];
        if (!els.length) {
          window.alert('Open the Lute view (with some chord boxes) first.');
          return;
        }
        downloadText(`${name}-lute-chords.svg`, combineSvgs(els), 'image/svg+xml');
        return;
      }
      case 'print':
        window.print();
    }
  };

  const onImportJson = async (file: File) => {
    try {
      s.importMany(importPieces(await file.text()));
    } catch (e) {
      window.alert(`Could not import: ${(e as Error).message}`);
    }
  };

  return (
    <div className="app">
      <Header
        title={piece.title}
        onTitle={(t) => update((p) => setTitle(p, t))}
        view={view}
        onView={setView}
        playing={playing !== null}
        onPlay={playTab}
        onStop={stop}
        msPerUnit={msPerUnit}
        onTempo={setMsPerUnit}
        onExport={onExport}
        onImportJson={(f) => void onImportJson(f)}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
      />
      {s.saveError && <div className="banner" role="alert">{s.saveError}</div>}
      <div className="layout">
        <PieceList
          open={sidebarOpen}
          list={s.list}
          currentId={piece.id}
          onOpen={(id) => {
            stop();
            s.open(id);
            setSidebarOpen(false);
          }}
          onNew={() => {
            stop();
            s.create();
            setSidebarOpen(false);
          }}
          onDelete={s.remove}
        />
        <main className="main">
          <h1 className="print-title">{piece.title}</h1>
          {view === 'guitar' ? (
            <GuitarView piece={piece} update={update} flats={guitarFlats} onPlayChord={playChord} />
          ) : (
            <LuteView piece={piece} update={update} result={result} playing={playing} onPlayChord={playChord} />
          )}
        </main>
      </div>
    </div>
  );
}
```

Remove the two `eslint-disable` comments if no ESLint is configured (they are harmless either way).

- [ ] **Step 4: Rewrite `src/styles.css`**

```css
:root {
  --bg: #fbf7ef;
  --surface: #ffffff;
  --text: #2b2118;
  --muted: #7a6a5a;
  --accent: #6b4423;
  --accent-2: #b5651d;
  --border: #e3d8c6;
  --warn: #9a5b00;
  --error: #b3261e;
  --playing: rgba(181, 101, 29, 0.18);
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1b1714;
    --surface: #25201b;
    --text: #efe6da;
    --muted: #a8998a;
    --accent: #e0b07a;
    --accent-2: #f0a35e;
    --border: #3a322b;
    --warn: #f0b35e;
    --error: #ff8a80;
    --playing: rgba(240, 163, 94, 0.22);
    color-scheme: dark;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif; }
button, select, input, textarea { font: inherit; color: inherit; }
button { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 4px 10px; cursor: pointer; }
button:hover:not(:disabled) { border-color: var(--accent); }
button:disabled { opacity: 0.45; cursor: default; }
button.primary { background: var(--accent); border-color: var(--accent); color: var(--bg); }
button.link { background: none; border: none; padding: 0; text-align: left; color: var(--accent); }
.icon-btn { padding: 2px 8px; }
input, select { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 4px 6px; }
input[type='number'] { width: 4.5em; }

.header { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 8px 16px; border-bottom: 1px solid var(--border); background: var(--surface); position: sticky; top: 0; z-index: 5; }
.brand { font-weight: 700; color: var(--accent); }
.header .title { flex: 1 1 160px; min-width: 120px; font-weight: 600; }
.segmented { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.segmented button { border: none; border-radius: 0; }
.segmented button.active { background: var(--accent); color: var(--bg); }
.playback { display: flex; align-items: center; gap: 8px; }
.tempo { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); }
.tempo input { width: 90px; }
.file-button { position: relative; overflow: hidden; display: inline-block; border: 1px solid var(--border); border-radius: 6px; padding: 4px 10px; background: var(--surface); cursor: pointer; }
.file-button input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.banner { background: var(--error); color: #fff; padding: 6px 16px; }

.layout { display: flex; min-height: calc(100vh - 52px); }
.sidebar { width: 220px; flex: none; border-right: 1px solid var(--border); padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.piece-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.piece-list li { display: flex; align-items: center; gap: 4px; padding: 4px 6px; border-radius: 6px; }
.piece-list li.current { background: var(--playing); }
.piece-open { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.piece-open span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.piece-open small { color: var(--muted); }
.menu { display: none; }
.main { flex: 1; min-width: 0; padding: 16px; }
.print-title { display: none; }

.view h2 { font-size: 1.05rem; margin: 20px 0 8px; display: flex; align-items: center; gap: 12px; }
.settings-bar { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; padding: 10px 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; }
.settings-bar label { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); }
.hint { font-size: 0.85rem; margin: 0 0 6px; }

.chord-grid { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; }
.chordbox { margin: 0; padding: 8px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; display: flex; flex-direction: column; align-items: center; gap: 4px; color: var(--text); }
.chord-name { width: 110px; text-align: center; font-weight: 600; }
.chord-title { font-weight: 600; min-height: 1.4em; }
.chordbox .notes { font-size: 0.8rem; color: var(--muted); text-align: center; }
.box-controls { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; justify-content: center; }
.box-controls button { padding: 0 6px; font-size: 0.85rem; }
.hit { cursor: pointer; }
.hit:hover { fill: var(--playing); }
.add-chord { align-self: center; padding: 24px 16px; border-style: dashed; }
.lute-dot, .glyph { cursor: pointer; }
.dot-text { fill: var(--surface); }
.lute-dot.shifted circle { fill: var(--accent-2); }
.lute-dot.pinned circle, circle.lute-dot.pinned { stroke: var(--accent-2); stroke-width: 2.5; }
.lute-dot.diapason.pinned, .glyph.pinned text { fill: var(--accent-2); }

.ascii-tabs { overflow-x: auto; }
.ascii-tab { font: 14px/1.25 ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace; margin: 0 0 12px; }
.tab-wrap { overflow-x: auto; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 8px; color: var(--text); }
.glyph-bg { fill: var(--surface); }
.playing { fill: var(--playing); }

.warnings { margin-top: 12px; border: 1px solid var(--border); border-left: 4px solid var(--warn); border-radius: 6px; padding: 6px 10px; background: var(--surface); }
.warnings summary { cursor: pointer; color: var(--warn); font-weight: 600; }
.warnings ul { margin: 6px 0 0; padding-left: 18px; }
.warn-inline { font-size: 0.75rem; color: var(--warn); }
.muted { color: var(--muted); }
.error { color: var(--error); }

.modal-backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); display: grid; place-items: center; padding: 16px; z-index: 20; }
.modal { background: var(--bg); border-radius: 10px; padding: 16px; width: min(760px, 100%); max-height: calc(100vh - 32px); overflow: auto; }
.modal h2 { margin-top: 0; }
.modal textarea { width: 100%; font: 13px/1.3 ui-monospace, Menlo, Consolas, monospace; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 8px; }
.row { display: flex; gap: 8px; align-items: center; margin-top: 8px; flex-wrap: wrap; }
.row.end { justify-content: flex-end; }
.tuning-editor { margin-top: 10px; padding: 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow-x: auto; }
.tuning-editor h3 { margin: 0 0 6px; }
.tuning-editor table { border-collapse: collapse; }
.tuning-editor td, .tuning-editor th { padding: 2px 8px; text-align: left; }

@media (max-width: 720px) {
  .menu { display: inline-block; }
  .sidebar { position: fixed; top: 0; bottom: 0; left: 0; z-index: 10; background: var(--bg); transform: translateX(-100%); transition: transform 0.2s; }
  .sidebar.open { transform: none; box-shadow: 0 0 24px rgba(0, 0, 0, 0.3); }
  .main { padding: 12px 16px; }
  .header { padding: 8px 16px; }
}

@media print {
  .header, .sidebar, .settings-bar, .box-controls, .warnings, .tuning-editor, .add-chord, .hint, .view h2 button, .banner { display: none !important; }
  .print-title { display: block; font-size: 1.3rem; }
  :root { --bg: #fff; --surface: #fff; --text: #000; }
  .chordbox, .tab-wrap { border: none; }
  .tab-wrap { overflow: visible; }
  .chord-name { border: none; }
}
.crash { max-width: 40rem; margin: 3rem auto; padding: 0 16px; }
```

- [ ] **Step 5: Create `src/ui/ErrorBoundary.tsx`**

A last resort for bugs: stored data is already validated by `migrate` (Task 14), but a blank page would hide the user's pieces.

`src/ui/ErrorBoundary.tsx`:
```tsx
import { Component, type ReactNode } from 'react';
import { downloadText } from './util';

interface State { error: Error | null; }

/** Last-resort screen: a bug never leaves a blank page, and saved pieces can always be downloaded. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  private exportRaw = () => {
    const data: Record<string, string> = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith('g2l:')) data[k] = localStorage.getItem(k) ?? '';
      }
    } catch {
      // storage unavailable: download what we have (nothing)
    }
    downloadText('guitar-to-lute-saved-data.json', JSON.stringify(data, null, 2), 'application/json');
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="crash" role="alert">
        <h1>Something went wrong</h1>
        <p>{this.state.error.message}</p>
        <p>Your saved pieces are still in this browser. Download a copy before reloading.</p>
        <button type="button" onClick={this.exportRaw}>Download saved data</button>{' '}
        <button type="button" onClick={() => location.reload()}>Reload</button>
      </main>
    );
  }
}
```

- [ ] **Step 6: Rewrite `src/main.tsx` to use it**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './ui/App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import './styles.css';

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
```

- [ ] **Step 7: Run all unit tests, typecheck and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all tests PASS; build succeeds.

- [ ] **Step 8: Manual check in the browser**

Run: `npm run dev` and open the printed URL. Check:
1. Add a chord box; click strings/frets to make Am (x 0 2 2 1 0); the name placeholder shows "Am" and notes "A E A C E".
2. Import tab: paste the `AM_ARPEGGIO` fixture text from `tests/core/parse/fixtures.ts`; the ASCII view appears.
3. Switch to Lute; chord box and tab render; switch notation French/Italian/Modern; choose the 8-course and 13-course presets; press "+3 guitar shapes" and "Auto".
4. Click a lute tab glyph: it moves and gets the pinned underline; "Clear overrides" removes it.
5. Play tab and play a chord: sound plays and the playing column is highlighted in the lute view.
6. Export JSON, TabCode, tab SVG, chords SVG; open the SVGs in the browser and check they are visible on a white background.
7. Narrow the window to phone width (≈375 px): no horizontal page scroll; the ☰ button opens the piece list.

- [ ] **Step 9: Commit**

```bash
git add src/ui/App.tsx src/ui/ErrorBoundary.tsx src/main.tsx src/styles.css tests/ui/App.test.tsx
git commit -m "feat(ui): assemble app with playback, exports, styling and print view

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 24: End-to-end tests (Playwright)

**Files:**
- Create: `playwright.config.ts`, `e2e/helpers/pdf.ts`, `e2e/app.spec.ts`

**Interfaces:**
- Consumes: the built app (`npm run build && npm run preview` on port 4173) and the test ids from Tasks 18–22.
- Produces: `makeTextPdf(lines: string[]): Buffer` — a minimal single-page PDF using the built-in Courier font.

- [ ] **Step 1: Install the browser**

Run: `npx playwright install chromium`
Expected: Chromium downloaded.

- [ ] **Step 2: Create `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:4173' },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

- [ ] **Step 3: Create `e2e/helpers/pdf.ts`**

```ts
/** Builds a minimal one-page PDF that draws each line in 10pt Courier. */
export function makeTextPdf(lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, (m) => `\\${m}`);
  const content = ['BT', '/F1 10 Tf', '12 TL', '40 800 Td', ...lines.map((l) => `(${esc(l)}) Tj T*`), 'ET'].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
```

- [ ] **Step 4: Create `e2e/app.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { makeTextPdf } from './helpers/pdf';

const TAB = [
  'e|-------0---|',
  'B|-----1---1-|',
  'G|---2-------|',
  'D|-----------|',
  'A|-0---------|',
  'E|-----------|',
];

test('enter a chord, import tab, convert to lute and override a note', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('add-chord').click();
  const box = page.getByTestId('guitar-chordbox').first();
  await box.getByTestId('open-0').click(); // high e open
  await box.getByTestId('cell-1-1').click(); // B fret 1
  await box.getByTestId('cell-2-2').click(); // G fret 2
  await box.getByTestId('cell-3-2').click(); // D fret 2
  await box.getByTestId('open-4').click(); // A open
  await box.getByTestId('open-5').click(); // low E open...
  await box.getByTestId('open-5').click(); // ...then muted
  await expect(box.locator('figcaption')).toHaveText('A E A C E');
  await expect(box.getByLabel('Chord name')).toHaveAttribute('placeholder', 'Am');

  await page.getByTestId('open-import').click();
  await page.getByTestId('import-text').fill(TAB.join('\n'));
  await page.getByTestId('do-import').click();
  await expect(page.getByTestId('guitar-tab')).toContainText('e|');

  await page.getByTestId('view-lute').click();
  await expect(page.getByTestId('lute-chordbox')).toHaveCount(1);
  await expect(page.getByTestId('lute-tab')).toBeVisible();
  await page.getByTestId('notation').selectOption('italian');
  await expect(page.getByTestId('glyph-0-0')).toBeVisible();
  await page.getByTestId('glyph-0-0').click();
  await expect(page.getByTestId('glyph-0-0')).toHaveClass(/pinned/);

  await page.waitForTimeout(800); // autosave debounce
  await page.reload();
  await expect(page.getByTestId('guitar-chordbox')).toHaveCount(1);
});

test('imports a text-based PDF', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('open-import').click();
  await page.getByTestId('pdf-input').setInputFiles({
    name: 'tab.pdf',
    mimeType: 'application/pdf',
    buffer: makeTextPdf(['My Song', '', ...TAB]),
  });
  await expect(page.getByTestId('import-text')).toHaveValue(/e\|-------0---\|/);
  await page.getByTestId('do-import').click();
  await expect(page.getByTestId('guitar-tab')).toBeVisible();
});

test('works offline after the first visit', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Guitar → Lute')).toBeVisible();
  await expect(page.getByTestId('add-chord')).toBeVisible();
});
```

- [ ] **Step 5: Run the e2e tests**

Run: `npm run e2e`
Expected: 3 tests pass. If the PDF test fails, print the textarea value (`console.log(await page.getByTestId('import-text').inputValue())`) and fix `reconstructPage`/`extractPdfText`, not the fixture. If the offline test fails, check that `dist/sw.js` precaches the HTML and JS (`globPatterns`) and that `registerType: 'autoUpdate'` is set.

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts e2e
git commit -m "test(e2e): chord entry, tab import, PDF import, overrides and offline

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Final verification

- [ ] Run: `npm test && npm run typecheck && npm run build && npm run e2e` — everything passes.
- [ ] Check spec §13 items are *not* implemented (no OCR, no notation-software PDF parsing, no rhythm flags).
- [ ] Use superpowers:finishing-a-development-branch to decide how to integrate the work.
