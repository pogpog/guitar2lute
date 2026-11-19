# Guitar → Lute Converter (PWA) — Design

Date: 2026-11-19
Status: Draft for review

## 1. Purpose

A personal tool for a guitarist/lutenist: enter guitar chord boxes (by clicking on a diagram) and guitar tab (pasted text or a text-based PDF), then convert them to lute chord boxes and lute tablature for a chosen lute tuning and number of courses. The lute output must contain the same notes/chords as the guitar version (optionally transposed), shown in French, Italian or modern tab notation.

### Success criteria
- A typical ASCII guitar tab pasted from the web imports with correct pitches (including capo / alternate tuning headers) and displays correctly.
- A text-based PDF of ASCII tab imports to the same result as pasting the text.
- Converting to a 6-course G lute with the "+3 guitar shapes" transpose produces the expected shape-equivalent fingerings.
- Every lute note sounds the guitar pitch + transpose, except notes explicitly flagged as octave-shifted or dropped.
- The user can correct any lute placement by hand, and corrections survive re-conversion.
- Works offline once loaded and is installable as a PWA.

### Decisions made with the user
| Topic | Decision |
|---|---|
| Lute notation | Selector: French letters, Italian numbers, modern numbers |
| PDF import | Text-based PDFs of ASCII tab only; no OCR |
| Conversion semantics | Same sounding pitch by default + semitone transpose control (with "+3 guitar shapes" shortcut and auto-transpose) |
| Stack | Vite + TypeScript + React; framework-free core; client-side only |
| v1 extras | Manual override, alternative chord voicings, audio playback, TabCode export |

## 2. Architecture

Fully client-side single-page app. No backend.

```
src/
  core/                 # pure TypeScript, no DOM, no React — fully unit-tested
    model.ts            # types (Piece, Tuning, ChordShape, TabEvent, …)
    pitch.ts            # MIDI ↔ note names, key-aware spelling
    tunings.ts          # guitar + lute presets, guitar header/label tuning detection
    chordName.ts        # chord detection/transposition (tonal)
    notation.ts         # fret → glyph tables (French, Italian, modern), diapason symbols
    parse/
      normalize.ts      # text cleanup before parsing
      headers.ts        # capo / tuning header detection
      asciiTab.ts       # ASCII tab → TabEvent[] + warnings
    convert/
      candidates.ts     # enumerate placements of a pitch set on a tuning
      playability.ts    # stretch / finger-count / barré checks
      cost.ts           # placement + transition costs
      viterbi.ts        # DP over tab columns with pins
      convert.ts        # public API: convertPiece(piece) → LuteResult
      autoTranspose.ts  # try −6..+6, pick cheapest
    tabcode.ts          # LuteResult → TabCode text
    storage.ts          # schemaVersion, migrations, (de)serialise
  import/
    pdf.ts              # pdfjs-dist text extraction → reconstructed monospace text (lazy-loaded)
  audio/
    pluck.ts            # WebAudio Karplus-Strong pluck + scheduler
  ui/                   # React components
    App.tsx, PieceList.tsx, GuitarView.tsx, LuteView.tsx,
    ChordBoxEditor.tsx, ChordBoxView.tsx, TabView.tsx, LuteTabView.tsx,
    ImportDialog.tsx, LuteSettingsBar.tsx, TuningEditor.tsx, WarningsPanel.tsx,
    PlaybackControls.tsx
```

Dependencies: `react`, `react-dom`, `vite`, `typescript`, `vite-plugin-pwa`, `pdfjs-dist`, `tonal`; dev: `vitest`, `@playwright/test`.

Data flow: user input → `Piece` (stored) → `convertPiece()` (pure, derived, memoised) → `LuteResult` → renderers. Lute output is never stored; only the settings and user overrides are.

## 3. Data model

```ts
type Midi = number;

interface Tuning {
  id: string;
  name: string;
  courses: Midi[];          // index 0 = course 1 = highest; displayed 1-based
  frettedCourses: number;   // courses beyond this are open-only (diapasons)
}

type StringState = number /* fret ≥ 0 */ | 'x' /* muted */ | null /* unset */;

interface ChordShape {
  name: string;             // user-entered; auto-detected name shown if empty
  frets: StringState[];     // per guitar string, high → low
  baseFret: number;         // first fret shown in the diagram (1 = nut)
}

interface TabNote { string: number; fret: number; }   // string 0 = highest
interface TabColumn { notes: TabNote[]; x: number; src?: { line: number; col: number }; }
type TabEvent =
  | { kind: 'col'; col: TabColumn }
  | { kind: 'bar' }
  | { kind: 'break' };      // system/line break from the source

interface Placement { course: number; fret: number; }   // course 0 = course 1

interface LuteSettings {
  tuning: Tuning;
  transpose: number;        // semitones, −12..+12
  maxFret: number;          // default 8
  maxStretch: number;       // default 4 (fret span of stopped notes)
  notation: 'french' | 'italian' | 'modern';
}

interface Piece {
  schemaVersion: 1;
  id: string;
  title: string;
  updatedAt: string;
  guitar: {
    tuning: Tuning;         // input tuning (from header/labels or selector)
    capo: number;
    chords: ChordShape[];
    tab: TabEvent[];
    sourceText?: string;    // last imported/pasted text, for re-editing
  };
  lute: LuteSettings;
  overrides: {
    chordVoicing: Record<number, number>;       // chord index → chosen alternative index
    chordPins: Record<number, Record<number, Placement>>; // chord index → note index → pin (applies to the chosen voicing)
    tabPins: Record<number, Record<number, Placement>>; // column index → note index → pin
  };
}
```

Re-importing tab replaces `guitar.tab` and clears `overrides.tabPins` (the user is warned first).

## 4. Tunings and notation

### 4.1 Presets (courses listed high → low)
| Preset | Courses | Fretted courses |
|---|---|---|
| Guitar standard | E4 B3 G3 D3 A2 E2 | 6 |
| Guitar presets (input) | Drop D, DADGAD, Open G, Open D, Half-step down | 6 |
| Renaissance 6-course in G | G4 D4 A3 F3 C3 G2 | 6 |
| Renaissance 7-course in G | + F2 | 7 |
| Renaissance 8-course in G | + F2 D2 | 7 |
| Renaissance 10-course in G | + F2 E♭2 D2 C2 | 7 |
| Baroque 13-course D minor | F4 D4 A3 F3 D3 A2 G2 F2 E2 D2 C2 B1 A1 | 6 |
| Custom | Any, edited in TuningEditor | user-set |

Selecting a preset sets the course count. The TuningEditor lets the user change any course pitch, add/remove bass courses (new ones default diatonically downward from the lowest), and set the fretted-course count. There is no separate "number of courses" control.

"Lute in G" is nominal; help text notes that tab encodes fingering and that courses 4+ are octave-strung, so bass pitch is nominal too.

### 4.2 Fret glyphs
| Fret | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| French | a | b | c | d | e | f | g | h | i | k | l | m | n |
| Italian | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | X | 1̄ | 2̄ |
| Modern | 0 | 1 | 2 | … | | | | | | | 10 | 11 | 12 |

All glyph mappings live in one table in `notation.ts` so period letter forms (e.g. `r` for `c`) can be swapped later.

### 4.3 Staff layout and diapasons
- **French:** 6 lines, top line = course 1. Course 7: written below the staff (fretted 7th-course notes on a ledger line below). Open diapasons below the staff: 8 = `/a`, 9 = `//a`, 10 = `///a`; on the Baroque 13-course 11 = `4`, 12 = `5`, 13 = `6`.
- **Italian:** 6 lines, top line = course 6 (lowest), bottom line = course 1. Courses 7+ written **above** the staff: fretted 7th-course notes on a ledger above; open diapasons as the course number (`8`, `9`, `10`, …) above the staff.
- **Modern:** one line per course, top = course 1, numbers on lines; diapasons get their own lines.
- **Lute chord boxes:** vertical diagram with one line per fretted course; diapasons used by the chord shown underneath using the selected notation's diapason symbols.

### 4.4 Note and chord naming
`pitch.ts` spells notes by key: after transposition, choose sharps or flats by the most likely key (from the detected key of the whole piece, falling back to flats, which suit lute repertoire). Chord names are detected with tonal's `Chord.detect` (first result) and transposed with the piece; user-entered names are transposed with `Chord.transpose`.

## 5. Guitar input

### 5.1 Chord box editor
- SVG diagram, 6 strings × 5 frets visible, starting at `baseFret` (▲/▼ to move; nut drawn when `baseFret = 1`).
- Click a string at a fret → place dot (one dot per string; clicking the same dot removes it).
- Click above the nut → cycle `null → 0 (○) → 'x' (×) → null`.
- Editable name field; detected chord name and note names (e.g. "E B E G♯ B E") shown underneath.
- "+ Add chord" appends a new empty box; delete and reorder buttons on each box.

### 5.2 Guitar tuning and capo
Piece-level selector for guitar input tuning (presets + custom) and capo (0–12). Capo adds semitones to every guitar pitch (tab frets are relative to the capo). Both are auto-filled from tab headers/labels on import, and the user can override them.

### 5.3 Text import (`normalize.ts`, `headers.ts`, `asciiTab.ts`)
1. **Normalize:** CRLF → LF; expand tab characters to 8-column stops; NBSP → space; Unicode dashes (– — ‐ − ‒) → `-`; `‖`, `|:`, `:|`, `*|`, `|*` → `|`.
2. **Headers:** `capo\s*(on\s*)?(\d+)` (also "2nd fret"); `tuning:\s*…` matched against known names (Standard, Drop D, DADGAD, Open G, Open D, Eb/half-step down) or six note names.
3. **Find string lines:** a line is a candidate if, after an optional label `^\s*[A-Ga-g][#b]?\s*[|:]?`, at least 60% of its characters are in `-0-9|hpbr/\\~x()<>sn`. Exactly 6 consecutive candidate lines form a block (v1 is 6-string only); other runs produce a warning with line numbers. Lines may differ in length.
4. **String assignment:** by position in the block (top line = string 1, high). Labels are used only to infer tuning: each label's pitch class is placed in the octave nearest the standard-tuning pitch of that string.
5. **Tokenize** each string line into `(startCol, endCol, kind, value)` tokens: fret numbers (adjacent digits form one number when ≤ 24), barlines, technique characters.
6. **Columns** are formed by grouping fret tokens across the 6 lines whose column spans overlap, so `-10-` aligns with `--3-` whether the number is left- or right-aligned. A column's `x` is the leftmost start column (relative to the block start, accumulated across blocks).
7. **Techniques:**
   - `h`, `p`, `/`, `\`, `s`: both notes are kept as separate attacks.
   - `b`, `r` (bend/release): the target fret after `b`/`r` is **not** a new attack and is dropped.
   - `(7)` ghost/tied: kept.
   - `<12>`, `n12` (natural harmonic): dropped with a warning.
   - `x` (dead note): skipped.
   - `~`, `PM`, `let ring`, `t`: ignored.
8. **Skipped content:** lyrics, chord-name lines, rhythm/count lines (`|---1---|` style lines outside a 6-line block), trailing `x4`/`repeat` annotations. Each block end becomes a `break` event.
9. **Warnings** carry source line numbers; the warnings panel links back to the paste box with that line selected.

### 5.4 PDF import (`import/pdf.ts`)
- `pdfjs-dist` is lazy-loaded on first use; the worker is imported via `?url`.
- For each page, collect text items; group them into lines by y with a tolerance of half the median glyph height.
- Character width per font = `item.width / item.str.length`; column = `round((x − pageLeft) / charWidth)`. Items are padded with spaces into those columns to rebuild monospace text.
- Remove repeated page headers/footers (identical lines at the same y on several pages) and lone page numbers. Drop private-use code-point characters (music fonts).
- Join pages, then run the same text pipeline as §5.3.
- **Detection:** if the text contains fret digits but no dash runs (`-{3,}`) on candidate lines, show a specific error: "This PDF looks like it was produced by notation software (Guitar Pro/MuseScore). Only PDFs of plain-text tab are supported in this version." Also put the extracted text in the paste box.
- Any parse warnings: the extracted text is placed in the paste box for manual correction.

## 6. Conversion

### 6.1 Pitches
Guitar note pitch = `tuning.courses[string] + capo + fret`. Target pitch = guitar pitch + `transpose`.

### 6.2 Candidate placements (`candidates.ts`)
For a pitch `p` and lute course `c`: fret `f = p − open(c)`; valid if `0 ≤ f ≤ maxFret` and (`c < frettedCourses` or `f = 0`).
For a set of pitches (a chord or tab column): enumerate assignments of each pitch to a distinct course (backtracking), keeping only playable ones (§6.3). Cap enumeration at 200 candidates per column, keeping the best by placement cost.

### 6.3 Playability (`playability.ts`)
For the stopped notes (fret > 0):
- Fret span (max − min) ≤ `maxStretch`.
- **Barré:** if two or more stopped notes share the lowest fret `b`, they may be barréd: the barré covers the course range between them; no course in that range may be open, and the barré counts as one finger.
- Fingers needed = stopped notes not covered by the barré + (barré ? 1 : 0) ≤ 4.

### 6.4 Unplaceable notes, octave shifts and dropping
If a column has no playable assignment:
1. **Octave-shift** offending pitches toward the lute's range: below the lowest available pitch → +12 (repeat up to twice); above the highest → −12. A bass pitch matching a diapason exactly is always tried before shifting (this happens naturally because diapasons are candidates).
2. If the column still has no playable assignment, or has more pitches than courses, **drop** notes in this order: duplicate identical pitches; octave doublings of a pitch class (never the bass or top note); inner voices from the middle outward. The bass and top (melody) notes are kept as long as possible.
3. Every shifted note carries `shifted: ±12` and every dropped note is recorded; shifting the bass is flagged separately as "inversion changed".

### 6.5 Costs (`cost.ts`)
- **Placement cost** of a candidate: Σ stopped fret × 1.0 + span × 1.5 + fingers × 0.5 − open strings × 0.3 + shifted notes × 5 + dropped notes × 10 + (lowest stopped fret above 5) × 1.0.
- **Transition cost** between consecutive columns: |hand position − previous hand position| × 1.0, where hand position = lowest stopped fret (an all-open column keeps the previous position); + 0.5 if a new note reuses the course that held the previous column's bass (keeps a held bass ringing, since no durations are known).
- Weights live in one exported constant and are tuned against test fixtures.

### 6.6 Tab: dynamic programming (`viterbi.ts`)
Keep the top K = 8 candidates per column by placement cost (always including any candidate that satisfies the column's pins). Viterbi over the columns minimises Σ placement + Σ transition. Bar and break events do not reset the hand position. Ties are broken deterministically (lower total placement cost, then lexicographic course list).

### 6.7 Chord boxes
Each chord is converted independently with the same candidate generation and placement cost; the top 3 distinct voicings are returned, ranked. The chosen voicing defaults to rank 1; `overrides.chordVoicing` selects another.

### 6.8 Manual override
- Clicking a note in the lute tab or a lute chord box cycles it through its other valid placements (course/fret) for the same pitch (and its octave shifts, marked).
- The chosen placement is stored as a pin. Pins are hard constraints: candidates that violate them are discarded, and the DP is re-run so neighbouring columns adapt.
- A pin that becomes impossible (e.g. after a tuning change) is dropped with a warning.
- "Clear overrides" resets all pins for the piece.

### 6.9 Transpose controls and auto-transpose
- Numeric transpose field (−12..+12).
- "+3 guitar shapes" button: sets transpose to +3. On a G lute this gives the classic mapping (guitar strings 1, 2, 4, 5, 6 at the same fret; string 3 one fret higher).
- "Auto" button: run the conversion for each transpose −6..+6 and pick the lowest total cost (shifted and dropped notes are heavily penalised); ties go to the smallest |transpose|, then 0, then +3.

### 6.10 Output (`LuteResult`)
```ts
interface LuteNote { placement: Placement; pitch: Midi; shifted: 0 | 12 | -12 | 24 | -24; pinned: boolean; srcNoteIndex: number; }
interface LuteColumn { notes: LuteNote[]; dropped: Midi[]; x: number; }
interface LuteChord { name: string; voicings: { notes: LuteNote[]; dropped: Midi[]; cost: number }[]; chosen: number; }
interface LuteResult { chords: LuteChord[]; tab: (LuteColumn | {kind:'bar'} | {kind:'break'})[]; warnings: Warning[]; totalCost: number; }
```

## 7. UI

- **Header:** piece title (editable), Guitar | Lute toggle, Import, Export (JSON / TabCode / SVG / Print), playback controls.
- **Sidebar (minimal):** list of saved pieces (title, updated date), New, Delete; collapses to a menu on narrow screens.
- **Guitar view:** tuning + capo selectors; chord box grid with "+ Add chord"; tab view (wrapped systems rendered from the model, monospace style); warnings panel.
- **Lute view:** settings bar (tuning preset, Edit tuning…, transpose + "+3 guitar shapes" + "Auto", max fret, max stretch, notation selector, Clear overrides); lute chord box grid with ◀ ▶ to step through the 3 voicings; lute tab view; warnings panel (shifted notes, dropped notes, broken pins).
- **Lute tab rendering:** SVG, wrapped into systems at the source `break` events (or by width); horizontal spacing proportional to the source column `x` offsets (keeps rough rhythm spacing); bar lines carried across; octave-shifted notes marked with a small dot above the glyph; pinned notes with an underline; the currently playing column highlighted.
- **Responsive:** usable at phone width (chord grid wraps, tab scrolls horizontally inside its panel).
- **Print:** print stylesheet that shows just the current view's title, chord boxes and tab.

## 8. Audio playback (`audio/pluck.ts`)
- WebAudio Karplus-Strong pluck synthesis (no samples to download).
- Play a single chord box (strummed, 30 ms between notes, low to high) by clicking a ▶ on the box.
- Play the guitar tab or the lute tab: columns scheduled with spacing proportional to `x` offsets at a tempo slider value (default: 1 column-unit = 120 ms); Stop button; the current column is highlighted.
- Lute playback uses the converted pitches, so the user can compare the two by ear.

## 9. Persistence and export
- Autosave the current piece to `localStorage` (debounced 500 ms), one key per piece plus an index. Quota errors show a non-blocking banner.
- JSON export/import of a single piece or all pieces; files contain `schemaVersion`; `storage.ts` holds the migration functions (v1 needs none, but the hook exists).
- **TabCode export:** chords and tab written as TabCode text (`.tc`): one chord token per column using fret letter + course number pairs (e.g. `c1a2d3`), `|` for barlines, a newline per system; no rhythm signs (TabCode allows omitted rhythm). The exact diapason syntax is checked against the TabCode specification (Crawford/Wray, ECOLM) during implementation and covered by fixture tests.
- SVG export of the lute chord boxes and the lute tab.

## 10. PWA
- `vite-plugin-pwa` with `registerType: 'autoUpdate'`, a manifest (name, icons, `display: standalone`, theme colour).
- Workbox `maximumFileSizeToCacheInBytes` raised to 5 MB so the pdfjs worker is precached and PDF import works offline. pdfjs cMaps/standard fonts are not bundled; unusual PDFs may fail offline (documented).

## 11. Error handling summary
| Source | Behaviour |
|---|---|
| Unparseable tab lines | Warning with line number; the rest imports |
| Non-6-string block | Warning; block skipped |
| PDF without text / notation-software PDF | Specific error message; extracted text placed in paste box |
| Unplaceable note | Octave-shift (flagged), then drop (flagged) |
| Impossible pin | Pin removed, warning |
| Storage quota | Banner; export still available |

## 12. Testing
- **Vitest (core):**
  - `pitch`: MIDI ↔ name, key-aware spelling.
  - `tunings`: presets, label-based tuning inference, header parsing (capo, Drop D, DADGAD).
  - `notation`: glyph tables (French incl. no `j`, Italian `X` for 10), diapason symbols for 7, 8, 10 and 13 courses.
  - `asciiTab`: fixture corpus of messy real-world tabs (CRLF, tab chars, Unicode dashes, mixed one/two-digit frets, left/right-aligned numbers, bends, harmonics, capo headers, lyrics and chord lines interleaved, repeat marks).
  - `convert`: known guitar → lute chord mappings (E, A, D, G, C, Em, Am at transpose 0 and +3 on 6-course G lute); finger-count/barré checks; drop priority keeps bass and top note.
  - **Property test:** every output note's pitch = input pitch + transpose, ± 12/24 only when flagged as shifted.
  - **DP regression:** a fixture where greedy column-by-column choice differs from the DP optimum.
  - Pins: pinned placements are respected; impossible pins produce a warning.
  - `tabcode`: fixture output.
  - `storage`: round-trip and schemaVersion handling.
- **Snapshot tests:** SVG output of chord boxes and tab for French/Italian/modern with 6, 7, 8, 10 and 13 courses.
- **Playwright smoke test:** load app → add a chord by clicking → paste a short tab → switch to Lute → change notation → output visible; app loads offline after first visit.

## 13. Out of scope for v1 (v2 candidates)
- PDFs from notation software (positioned numbers on vector staff lines): clustering numeric text items into 6 y-bands.
- OCR of scanned PDFs.
- Non-6-string guitar tab (7-string, bass).
- Rhythm/duration input and lute rhythm flags.
- TabCode import; MusicXML/Guitar Pro import.
- Period letter-form font for French tab.
- Cloud sync / sharing.
