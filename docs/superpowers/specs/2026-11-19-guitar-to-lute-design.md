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
- **Lute chord boxes:** vertical diagram with one line per fretted course; diapasons used by the chord shown underneath using the selected notation's diapason symbols. Under a chord box there is no staff position to tell courses apart, so the 7th course and every modern-notation diapason are labelled with their course number (`7:a`, `7:0`, `8:0`); the other French and Italian diapason symbols are already distinct.
- **Tab systems** grow to fit the diapasons they use: the space above (Italian) or below (French) the staff is sized from the most simultaneous diapasons in that system, so stacked diapasons never clip or run into the next system.

### 4.4 Note and chord naming
`pitch.ts` spells notes by key: after transposition, choose sharps or flats by the most likely key (from the detected key of the whole piece, falling back to flats, which suit lute repertoire). Chord names are detected with tonal's `Chord.detect` (first result) and transposed with the piece; user-entered names are transposed by capo + transpose, so a typed name always matches the sounding chord (a box named "D" played with capo 2 is shown as E). A typed name is only transposed when it reads as a chord: any letters after the root must be chord vocabulary (`m`, `maj`, `min`, `dim`, `aug`, `sus`, `add`, `alt`), so a label such as "Bridge" or "Chorus" stays as typed.

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
9. **Warnings** carry source line numbers; the warnings panel links back to the paste box with that line selected. The last import's warnings stay listed in the guitar view (they are recomputed from the stored source text) until the next import, including after switching views or reloading.

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
For a set of pitches (a chord or tab column): enumerate assignments of each pitch to a distinct course (backtracking), keeping only playable ones (§6.3). Each search visits at most 5000 assignments and uses branch-and-bound: a branch is abandoned as soon as its lowest possible cost cannot beat the current K-th best candidate. Only the best K candidates are kept.

### 6.3 Playability (`playability.ts`)
For the stopped notes (fret > 0):
- Fret span (max − min) ≤ `maxStretch`.
- **Barré:** if two or more stopped notes share the lowest fret `b`, they may be barréd: the barré covers the course range between them; no course in that range may be open, and the barré counts as one finger.
- Fingers needed = stopped notes not covered by the barré + (barré ? 1 : 0) ≤ 4.

### 6.4 Unplaceable notes, octave shifts and dropping
Conversion runs in two passes.
1. **As written:** every note at its own pitch. A note with no placement at all on the lute (outside its range) takes its nearest octave that has one. A bass pitch matching a diapason exactly needs no shift, because diapasons are candidates.
2. **Only if pass 1 finds nothing playable:** each note may also move by an octave (0, +12, −12, +24, −24), and notes may be dropped. Every combination of shifts and drops is costed (§6.5), and the cheapest result wins. Shifts and drops therefore compete on cost rather than following a fixed "shift first, then drop" order.
   - Drop penalties follow the note's musical role, taken from the input pitches (a shift never changes which note is the bass or top): an exact duplicate of another kept note 4; an octave doubling of another kept note's pitch class 7; an inner voice 10; the top (melody) note 16; the bass 20; a pinned note 30. Each octave-shifted note costs 5.
   - So dropping an exact duplicate (4) is preferred to shifting it (5), while an octave doubling is shifted rather than dropped when a shift fits (5 < 7), and the bass and top note are kept as long as possible.
   - An octave shift that lands in unison with another note is not allowed (it would be a drop in disguise).
3. Every shifted note carries `shifted: ±12/±24` and every dropped note is recorded. If the lowest output note's pitch class differs from the input bass's (and the bass shift has not already been reported), the change is flagged as "inversion changed".

### 6.5 Costs (`cost.ts`)
- **Placement cost** of a candidate: Σ stopped fret × 1.0 + span × 1.5 + fingers × 0.5 − open strings × 0.3 + shifted notes × 5 + Σ drop penalties by role (§6.4) + (lowest stopped fret above 5) × 1.0.
- **Transition cost** between consecutive columns: |hand position − previous hand position| × 1.0, where hand position = lowest stopped fret (an all-open column keeps the previous position); + 0.5 if a new note reuses the course that held the previous column's bass (keeps a held bass ringing, since no durations are known).
- Weights live in one exported constant and are tuned against test fixtures.

### 6.6 Tab: dynamic programming (`viterbi.ts`)
Keep the top K = 8 candidates per column by placement cost (always including any candidate that satisfies the column's pins). Viterbi over the columns minimises Σ placement + Σ transition. Bar and break events do not reset the hand position. Ties are broken deterministically (lower total placement cost, then lexicographic course list).

### 6.7 Chord boxes
Each chord is converted independently with the same candidate generation and placement cost; the top 3 distinct voicings are returned, ranked (the same placements in a different note order, which a unison in the chord allows, count as one voicing). When the whole chord fits, versions that leave out one doubled note (never the bass, top or a pinned note) are also offered, ranked after every full-chord voicing, so a full six-note chord still has alternatives. The chosen voicing defaults to rank 1; `overrides.chordVoicing` selects another.

### 6.8 Manual override
- Clicking a note in the lute tab or a lute chord box moves it to its next valid placement (course/fret) for the same pitch or one of its octave shifts (marked). Only placements that fit beside the other notes shown are offered: a free course, no unison with another note, and a playable shape. Clicking never drops or moves another note.
- The click pins the **whole shape shown** for that column or chord: the clicked note's new placement plus every other note's current placement. This stops the rest of the chord from re-arranging itself around the moved note. Every note in the shape then shows the pinned underline.
- Pinning a chord clears its `chordVoicing` choice; choosing another voicing with ◀ ▶ clears the chord's pins (so ◀ ▶ stay usable on a pinned chord).
- Pins are stored per note. Pins are hard constraints: candidates that violate them are discarded, and the DP is re-run so neighbouring columns adapt.
- A pin that becomes impossible (e.g. after a tuning change) is ignored with a warning. Because a click pins the whole shape, the check also covers the shape as a whole: if every pin still fits on its own but the pinned shape is no longer playable (e.g. after lowering max stretch), so that keeping it would cost a note the unpinned column keeps, the column is solved without its pins. A chord or column with stale pins gives **one** warning ("Tab column 12 (line 5): 3 manual placements no longer fit and are ignored."), not one per note.
- Ignored pins stay stored, so they apply again if the settings change back. Each stale-pin warning has a **Remove** button that forgets that chord's or column's manual placements, and when several chords or columns have stale pins the warnings panel also offers **Remove all that no longer fit**. Nothing is removed without the user asking.
- "Clear overrides" resets all pins for the piece.

### 6.9 Transpose controls and auto-transpose
- Numeric transpose field (−12..+12).
- "+3 guitar shapes" button: sets transpose to +3. On a G lute this gives the classic mapping (guitar strings 1, 2, 4, 5, 6 at the same fret; string 3 one fret higher).
- "Auto" button: run the conversion for each transpose −6..+6 and pick the lowest total cost (shifted and dropped notes are heavily penalised); ties go to the smallest |transpose|, then 0, then +3. Auto yields to the browser between transposes and shows "Working…" (button disabled) until it finishes, so a long piece never freezes the page without feedback. Auto ignores pins.
- Number fields (transpose, max fret, max stretch, capo, fretted courses) keep what is being typed (`-`, `1` on the way to `10`) and commit only complete in-range integers; leaving a field restores the saved value.

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
- Autosave the current piece to `localStorage` (debounced 500 ms, and at once when the page is hidden or closed), one key per piece plus an index. Quota errors show a non-blocking banner. An untouched new piece (default or empty title, no chords, no tab) is not saved until something is added, so "New piece" never leaves empty "Untitled" entries; a piece that is already saved keeps being saved even if it is emptied.
- The index is a convenience, not the source of truth: entries are coerced to strings and de-duplicated, and pieces whose keys exist but are missing from the index (corrupt index, interrupted save) are listed again and kept on the next save.
- Opening a stored piece that cannot be read shows why (e.g. "made by a newer version of the app"); "All pieces" export lists the pieces it had to leave out.
- JSON export/import of a single piece or all pieces; files contain `schemaVersion`; `storage.ts` holds the migration functions (v1 needs none, but the hook exists). Loading checks the whole structure and the ranges the app's own controls allow (6 guitar strings, frets 0–24, capo 0–12, transpose −12..+12, max fret 4–12, max stretch 2–6, 1 ≤ fretted courses ≤ courses, MIDI 0–127) and rejects anything else with a message naming the field. Importing never overwrites a saved piece: the open piece is saved first, then an imported piece whose id is already saved with different contents (or with contents this version cannot read) arrives as a copy with a new id and "(imported)" added to its title. A piece that already exists (same contents and title under any id, including an earlier "(imported)" copy) is not imported silently: the user is asked "“Greensleeves” already exists. Do you want to import it again?" (one question naming every such piece); yes imports them again as copies, no skips them, and the other pieces in the file are imported either way. Repeats within one file are skipped.
- **TabCode export:** chords and tab written as TabCode text (`.tc`): one chord token per column using fret letter + course number pairs (e.g. `c1a2d3`), `|` for barlines, a newline per system; no rhythm signs (TabCode allows omitted rhythm). The exact diapason syntax is checked against the TabCode specification (Crawford/Wray, ECOLM) during implementation and covered by fixture tests.
- SVG export of the lute chord boxes (each titled with its chord name) and the lute tab.

## 10. PWA
- `vite-plugin-pwa` with `registerType: 'autoUpdate'`, a manifest (name, icons, `display: standalone`, theme colour). Icons: the SVG plus 192 px and 512 px PNGs, which Android needs to install the app. Android (Chrome) is the primary target; iPhone/iPad support is not a goal.
- Workbox `maximumFileSizeToCacheInBytes` raised to 5 MB so the pdfjs worker is precached and PDF import works offline. pdfjs cMaps/standard fonts are not bundled; unusual PDFs may fail offline (documented).

## 11. Error handling summary
| Source | Behaviour |
|---|---|
| Unparseable tab lines | Warning with line number; the rest imports |
| Non-6-string block | Warning; block skipped |
| PDF without text / notation-software PDF | Specific error message; extracted text placed in paste box |
| Unplaceable note | Octave-shift or drop, whichever costs less (§6.4); both flagged |
| Impossible pin, or a pinned shape that is no longer playable | Pins ignored (still stored); one warning per chord or column, with Remove / Remove all that no longer fit |
| Unreadable stored piece | Listed; opening it shows the reason; left out of "All pieces" export with a note |
| Damaged index | Rebuilt from the stored pieces; never stops the app from starting |
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
