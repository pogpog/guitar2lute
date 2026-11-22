# MusicXML Tab Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open a MusicXML (`.musicxml`/`.xml`) or compressed MusicXML (`.mxl`) file, or a plain-text tab file, from the import dialog, and turn a MusicXML tab staff into ASCII tab text in the paste box, keeping the existing preview → Import flow.

**Architecture:** A byte sniffer routes each opened file to the PDF path, a small zip reader, the MusicXML reader, or straight into the paste box. The MusicXML reader turns the tab staff into a time-based score model (one cursor per part); a writer turns that model into ASCII tab with `Tuning:`/`Capo:` headers, spaced by time and broken into blocks that fit one lute line. Two parser changes support it: tuning headers with octaves, and blocks that follow each other in time.

**Tech Stack:** Vite 8, React 18, TypeScript 5.9 strict, Vitest 5 (Node environment), Playwright 1.65; browser `DOMParser`, `DecompressionStream`, `TextDecoder`; dev-only `@xmldom/xmldom`.

**Spec:** `docs/superpowers/specs/2026-11-19-guitar-to-lute-design.md` — §5.3 steps 2 and 6, §5.5 (all of it), §11, §12. Background: `docs/superpowers/reviews/2026-11-20-musicxml-spec-review.md`.

## Global Constraints

- Node ≥ 22.12 (package.json `engines`). Android Chrome first; iOS not a target.
- No new runtime dependencies. Dev only: `@xmldom/xmldom` (`npm install -D @xmldom/xmldom@^0.9`). App code never imports it; the `DOMParser` is passed in.
- Third-party scores never enter the repo. Tests use hand-written XML and archives built in the test (`node:zlib`).
- `src/import/musicxml/*`, `src/import/unzip.ts` and the PDF code are lazy-loaded from the dialog (dynamic `import()`), like `pdf.ts` today.
- XML reading uses only `getElementsByTagName`, `childNodes`, `getAttribute`, `textContent`, `nodeType`, `nodeName`/`tagName` (xmldom has no `querySelector`/`children`).
- Generated tab uses ASCII only: labels from `tuningLabels()`, note names from `midiToName(m, false)` (`#`, never ♯/♭).
- User-facing copy is verbatim from the spec where the spec gives it (quoted in the tasks). Copy the spec leaves open is fixed in this plan and must be used as written.
- Every commit ends with the two trailer lines (`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01LJHCyD9fbkdZjvpTX5nQ8S`).
- Test commands: `npm test` (all unit), `npx vitest run <file>`, `npx tsc -p tsconfig.json --noEmit`, `npm run build && npx playwright test`.

## Review Focus

1. Text generated from MusicXML must re-parse with **zero** warnings — the guitar view recomputes warnings from the stored source text forever, so any warning here would haunt the piece. (Task 9 test `generated text parses without warnings`.)
2. A long score (400 measures, two voices) must convert fast enough for a phone: under 1.5 s in Node. (Task 9 test `converts a 400-measure score quickly`.)
3. Re-opening "Import tab…" after a MusicXML import shows the generated text, and importing it again gives the same tab. (Task 11 e2e `re-opening import shows the generated tab`.)
4. Two-digit frets at minimum spacing next to barlines (`12|`, `|12`, `1-12`) survive the round trip. (Task 9 pushed-notes fixture includes them.)
5. A notation-software PDF opened through the new "Open file…" button still gets the existing notation-PDF message, and a text PDF still fills the paste box. (Task 10 tests `routes PDFs to the PDF reader` with an injected extractor.)

## File Structure

| File | Responsibility |
|---|---|
| `src/core/parse/headers.ts` (modify) | `Tuning:` header with octaves |
| `src/core/tunings.ts` (modify) | export `guitarTuningFromCourses` (preset match or custom) |
| `src/core/parse/asciiTab.ts` (modify) | consecutive blocks continue in time |
| `src/core/luteTabLayout.ts` (modify) | export `LUTE_VIEW_WIDTH`, `luteLineWidth`; layout uses the same advance rule |
| `src/import/unzip.ts` (create) | central-directory zip reader with limits |
| `src/import/sniff.ts` (create) | classify bytes; decode XML/text |
| `src/import/musicxml/xml.ts` (create) | `parseXml`, `ImportError`, DOM helpers |
| `src/import/musicxml/read.ts` (create) | MusicXML document → `TabScore` (staff, tuning, time, notes, capo, checks, notices) |
| `src/import/musicxml/capo.ts` (create) | capo text matching |
| `src/import/musicxml/write.ts` (create) | `TabScore` → ASCII tab text |
| `src/import/musicxml/index.ts` (create) | `musicXmlToTabText(xmlText, parser)` |
| `src/import/openFile.ts` (create) | bytes → `{ text, notices, message }` or error, for every file kind |
| `src/ui/ImportDialog.tsx` (modify) | "Open file…", notices, `wrap="off"` |
| `tests/helpers/zip.ts` (create) | build zip archives in tests (stored/deflated, data descriptor, extra fields, comment, flags) |
| `tests/import/musicxml/build.ts` (create) | build small MusicXML scores in tests |

---

### Task 1: `Tuning:` header with octaves

**Files:**
- Modify: `src/core/parse/headers.ts` (the `NOTE_LIST` match and tuning branch)
- Modify: `src/core/tunings.ts` (rename private `guitarTuning(courses)` → exported `guitarTuningFromCourses`)
- Test: `tests/core/parse/headers.test.ts`, `tests/core/tunings.test.ts`

**Interfaces:**
- Produces: `guitarTuningFromCourses(courses: Midi[]): Tuning` (courses high → low; preset clone if equal to a preset, else `{ id: 'guitar-custom', name: 'Custom (…low→high…)', courses, frettedCourses: 6 }`). `parseHeaders(text)` unchanged in shape.

- [ ] **Step 1: Failing tests** in `headers.test.ts`:
  - `takes octaves as written`: `parseHeaders('Tuning: E3 A3 D4 G4 B3 E4').tuning!.courses` → `[64, 59, 67, 62, 57, 52]`.
  - `matches a preset when octaves agree`: `parseHeaders('Tuning: E2 A2 D3 F#3 B3 E4').tuning!.courses` → `[64, 59, 54, 50, 45, 40]`; `parseHeaders('Tuning: E2 A2 D3 G3 B3 E4').tuning!.id` → `'guitar-standard'`.
  - `rejects a mix of octave and plain names`: `parseHeaders('Tuning: E2 A D3 G3 B3 E4').tuning` → `null`.
  - `still reads plain names and dashes`: `parseHeaders('Tuning: D-A-D-G-B-E').tuning!.id` → `'guitar-drop-d'`.
  - In `tests/core/parse/asciiTab.test.ts` or `importText` tests: `the header wins over labels`: text `'Tuning: E3 A3 D4 G4 B3 E4\n' +` a 6-line block labelled `e B G D A E` → `importTabText(...).tuning!.courses` equals the header's.
  - In `tunings.test.ts`: `guitarTuningFromCourses([64,59,55,50,45,38]).id` → `'guitar-drop-d'`.
- [ ] **Step 2:** `npx vitest run tests/core/parse/headers.test.ts tests/core/tunings.test.ts` → the octave tests FAIL (tuning `null`), `guitarTuningFromCourses` not exported.
- [ ] **Step 3: Implement.** Accept six names `[A-Ga-g][#b♯♭]?\d?` separated by `[\s,\-]*`; all six with an octave digit → `nameToMidi` each, reverse to high→low, `guitarTuningFromCourses`; none with a digit → existing pitch-class path; otherwise no tuning. `inferGuitarTuning` keeps working by calling `guitarTuningFromCourses`.
- [ ] **Step 4:** same command → PASS; `npm test` → all pass.
- [ ] **Step 5: Commit** `feat(parse): Tuning header with octaves`.

### Task 2: Consecutive tab blocks continue in time

**Files:**
- Modify: `src/core/parse/asciiTab.ts` (`parseAsciiTab` block loop; `parseBlock` returns whether the block starts/ends with a barline)
- Test: `tests/core/parse/asciiTab.test.ts`, `tests/core/asciiRender.test.ts`

**Interfaces:**
- Consumes: `TabEvent` with `bar.x` and `break.next` (already in the model).
- Produces: x positions where block k+1's origin = block k's origin + its width (longest body line), minus 1 when block k ends with `|` and block k+1 starts with `|`, each judged on ≥ 4 of the 6 lines. `break.next` = the origin of the following block (set when that block is parsed; the last break's `next` = origin + width).

- [ ] **Step 1: Failing tests.**
  - Update `records where each bar is and where the next block starts`: with block `'|0---|--3-|'` ×6 twice, bars → `[5, 10, 15, 20]`, breaks' `next` → `[10, 20]`.
  - `blocks follow each other in time`: two blocks `'|0--0-|'`-style (notes at body cols 1 and 4, closing bar at 6) → `stepsFromColumns(cols, 100)` times are evenly spaced 300 ms across the line break (`[0, 0.3, 0.6, 0.9]`).
  - `blocks without bars at the join just follow on`: block A bodies `'-0--0-'` (width 6), block B `'-0--0-'` → second block's first column x = 6 + 1 = 7.
  - `the shared bar counts once only when 4+ lines have it`: block A with `|` closing only 3 of 6 lines → no overlap (origin = width).
  - Keep the renderer tests green: `keeps each block of a longer tab as written` must still pass (renderer uses `break.next`).
- [ ] **Step 2:** `npx vitest run tests/core/parse/asciiTab.test.ts tests/core/asciiRender.test.ts` → new/updated tests FAIL (gap of 4 still added).
- [ ] **Step 3: Implement** in `parseAsciiTab`: remove `+ 4`; compute origin per the Interfaces rule; keep a reference to the last pushed break and set its `next` when the next block's origin is known.
- [ ] **Step 4:** same command → PASS; `npm test` → all pass (fix any other test that encoded the 4-character gap; none expected beyond the one updated).
- [ ] **Step 5: Commit** `feat(parse): tab blocks follow each other in time`.

### Task 3: Measure a lute line

**Files:**
- Modify: `src/core/luteTabLayout.ts`, `src/ui/LuteTabView.tsx` (default `width = LUTE_VIEW_WIDTH`)
- Test: `tests/core/luteTabLayout.test.ts`

**Interfaces:**
- Produces: `export const LUTE_VIEW_WIDTH = 900;` and `export function luteLineWidth(items: ({ kind: 'col'; x: number } | { kind: 'bar' })[]): number` — the px width `layoutLuteTab` needs to keep these items on one line, margins included, using the same rule as the layout: first column advances `minGap / 2`; later ones `min(minGap * 4, max(minGap, Δx × unit))`; a bar adds `minGap / 2` only after a column; result = final cursor + margin. A block fits one line iff `luteLineWidth(items) <= LUTE_VIEW_WIDTH`.

- [ ] **Step 1: Failing tests.**
  - `agrees with the layout`: for item lists of 3/4 with 16ths (3 bars, columns every 3 chars), 4/4 (2 bars) and 2/4 (5 bars), `luteLineWidth(items) <= 900` exactly when `layoutLuteTab(sameColumns, tuning, 'french', 900).systems.length === 1`. Build lute events from the same x list.
  - `ignores a leading bar`: `luteLineWidth([{ kind: 'bar' }, { kind: 'col', x: 0 }])` equals `luteLineWidth([{ kind: 'col', x: 0 }])`.
- [ ] **Step 2:** `npx vitest run tests/core/luteTabLayout.test.ts` → FAIL (not exported).
- [ ] **Step 3: Implement**: extract the advance rule into one private function used by both `layoutLuteTab` and `luteLineWidth`.
- [ ] **Step 4:** same command → PASS; `npm test` → snapshots unchanged.
- [ ] **Step 5: Commit** `feat(lute): export the lute line measure`.

### Task 4: Zip reader for `.mxl`

**Files:**
- Create: `src/import/unzip.ts`, `tests/helpers/zip.ts`, `tests/import/unzip.test.ts`
- Create: `src/import/musicxml/xml.ts` with just `export class ImportError extends Error {}` (the rest comes in Task 6)

**Interfaces:**
- Produces:
  - `export const MAX_ENTRY_BYTES = 20 * 1024 * 1024;`
  - `export interface ZipEntry { name: string; read(): Promise<Uint8Array> }` (name normalised: leading `./` removed, `\` → `/`)
  - `export function listZip(bytes: Uint8Array): ZipEntry[]` — throws `ImportError` with the messages below.
  - Test helper `makeZip(entries: { name: string; data: Uint8Array | string; method?: 0 | 8; dataDescriptor?: boolean; localExtra?: Uint8Array; centralExtra?: Uint8Array; flags?: number; declaredSize?: number }[], opts?: { comment?: string; methodOverride?: number }): Uint8Array` using `zlib.deflateRawSync` and `zlib.crc32`.
- Messages (fixed here; spec says only "refused with a message"):
  - Zip64, encrypted entry, or compression method other than 0/8: `"This .mxl file uses a zip feature this app can't read."`
  - Inflated entry over 20 MB: `"This .mxl file is too large to open (over 20 MB unpacked)."`
  - No end-of-central-directory record / bad offsets: `"Could not read this MusicXML file; it may be damaged."`
  - No `DecompressionStream('deflate-raw')`: `"This browser can't open .mxl files; export uncompressed MusicXML instead."` (spec copy)

- [ ] **Step 1: Failing tests** (`unzip.test.ts`):
  - `reads stored and deflated entries` (round-trip content).
  - `finds the directory behind an archive comment`.
  - `takes sizes from the central directory for data-descriptor entries`.
  - `uses the local extra-field length for the data offset` (local extra 9 bytes, central 5).
  - `normalises ./ and backslashes in names`.
  - `refuses encrypted entries`, `refuses method 12`, `refuses Zip64` (EOCD fields 0xFFFF/0xFFFFFFFF) — each with the exact message.
  - `stops inflating past 20 MB even when the declared size is small` (an entry of 21 MB zeros, declared size 10).
  - `rejects a file that is not a zip archive` → damaged message.
- [ ] **Step 2:** `npx vitest run tests/import/unzip.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** per spec §5.5 ".mxl files": EOCD by scanning backwards from the end (max comment 65535); central entries give method, flags, sizes, local offset; data offset = local offset + 30 + local name length + local extra length (read from the local header); deflate via `new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')))` read chunk by chunk, aborting past `MAX_ENTRY_BYTES`.
- [ ] **Step 4:** same command → PASS; `npm test` → all pass.
- [ ] **Step 5: Commit** `feat(import): zip reader for .mxl files`.

### Task 5: Sniff file bytes

**Files:**
- Create: `src/import/sniff.ts`, `tests/import/sniff.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Sniffed =
    | { kind: 'pdf' }
    | { kind: 'zip' }
    | { kind: 'musicxml'; text: string }   // decoded with the declared encoding
    | { kind: 'timewise' }
    | { kind: 'text'; text: string }       // ≤ 1 MB, no NUL; UTF-8 (BOM dropped) else Windows-1252
    | { kind: 'unknown' };
  export const MAX_TEXT_BYTES = 1024 * 1024;
  export function sniff(bytes: Uint8Array): Sniffed;
  export function xmlRootName(text: string): string | null; // first tag after declaration, comments, PIs, DOCTYPE
  ```
  Rules exactly as spec §5.5 "Opening a file" (PDF within first 1024 bytes; `PK\x03\x04` at 0; UTF-16 BOM; UTF-8 BOM skipped; ASCII scan for the root and `encoding`; non-strict decode with the declared label, default UTF-8; any root other than `score-partwise`/`score-timewise` → `unknown`).

- [ ] **Step 1: Failing tests** — one per spec §12 sniff case: PDF at byte 0; PDF after 20 junk bytes; zip; XML with declaration; XML starting with `<!DOCTYPE score-partwise …>`; XML starting with a comment; UTF-16 LE and BE with BOM; UTF-8 BOM before `<?xml`; declared `ISO-8859-1` with `é` in `<work-title>` → `text` contains `é`; `score-timewise` → `timewise`; `<html>` → `unknown`; plain-text tab (UTF-8) → `text`; Windows-1252 text with byte `0xE9` → `text` containing `é`; text of 1 MB + 1 byte → `unknown`; bytes with a NUL → `unknown`.
- [ ] **Step 2:** `npx vitest run tests/import/sniff.test.ts` → FAIL.
- [ ] **Step 3: Implement** with `TextDecoder` (`fatal: true` only for the UTF-8 plain-text attempt).
- [ ] **Step 4:** same → PASS.
- [ ] **Step 5: Commit** `feat(import): detect PDF, zip, MusicXML and text files`.

### Task 6: MusicXML reader — XML, staff, tuning, time

**Files:**
- Modify: `src/import/musicxml/xml.ts`; Create: `src/import/musicxml/read.ts`, `tests/import/musicxml/build.ts`, `tests/import/musicxml/read.test.ts`
- Modify: `package.json`/lock (`@xmldom/xmldom` dev dependency); spec §2 file tree (`musicxml.ts` → `musicxml/{xml,read,capo,write,index}.ts`, add `openFile.ts`)

**Interfaces:**
- Produces (`xml.ts`):
  - `export interface XmlParser { parseFromString(text: string, type: 'application/xml'): Document }`
  - `export function parseXml(text: string, parser: XmlParser): Document` — throws `ImportError("Could not read this MusicXML file; it may be damaged.")` when the parser throws or the result contains a `parsererror` element.
  - `export function childElements(el: Element, name?: string): Element[]`, `export function childText(el: Element, name: string): string | null`.
- Produces (`read.ts`):
  ```ts
  export interface TabNote { time: number; slot: number; string: number; fret: number; measure: number }
  //   time: integer units; slot: 0 = main, -k = k-th grace column before (−1 nearest), +k = after-grace; string 0 = highest
  export interface TabMeasure { number: string; start: number; length: number; newBlock: boolean }
  export interface TabScore {
    unit: number;            // time units per quarter = LCM of every <divisions> value in the part; a duration d under divisions D is round(d × unit / D)
    tuning: number[];        // 6 open strings, MIDI, index 0 = highest
    capo: number;            // 0..12
    measures: TabMeasure[];
    notes: TabNote[];        // sorted by time, slot, string
    notices: string[];       // aggregated, final wording
  }
  export function readMusicXml(doc: Document): TabScore; // throws ImportError for fatal cases
  ```
- Test builder (`build.ts`): `score(parts: { id: string; name?: string; measures: string[] }[], opts?: { credits?: string[] }): string` and `n(o: { s?: number; f?: number; d?: number; v?: number; chord?: boolean; staff?: number; pitch?: string /* 'F#3' */; rest?: boolean; grace?: boolean; tie?: 'start'|'stop'; tied?: 'stop'|'continue'; cue?: boolean; head?: string; harmonic?: boolean }): string`, plus `tabAttrs(o?: { divisions?: number; tuning?: string[] /* low→high 'E2'… */; staves?: number; tabStaff?: number; capo?: number; lines?: number; beats?: string; transpose?: { chromatic: number; octave: number; number?: number } }): string`, `backup(d)`, `forward(d)`, `words(text)`, `print({ system?: boolean; page?: boolean })`.

- [ ] **Step 1: Failing tests** (`read.test.ts`, parser = xmldom `DOMParser`):
  - `parseXml` throws the damaged message for `'<score-partwise><part>'` (xmldom path) and for a document containing `<parsererror>` (simulate with a stub parser returning one).
  - staff choice: `finds a tab part`; `finds a tab staff inside a two-staff part` (clef number 2, notes with `<staff>2`, `staff-details number="2"`); `staff-details without number applies`; `skips a 4-string tab staff before a 6-string one` (notice `"Other tab staves were not imported: Bass (4 strings)."`); errors with the exact spec messages for no tab staff and for 7 strings only (`"The tab staff has 7 strings; only 6-string guitar tab can be imported."`).
  - tuning: `<staff-tuning>` lines 1..6 → `tuning` high→low MIDI.
  - time: `one cursor per part` (partial `<backup>` 1 beat → voice-2 note at beat 3); `<forward> without <voice>`; `<chord/> shares the start and does not advance`; `notes on the notation staff move the cursor` (two-staff part); `divisions changing mid-piece` (2 then 3 → integer times on LCM 6); `pickup measure length is its content` (`implicit="yes"`, one quarter in 3/4 → `length` = 1 quarter); `empty measure uses the time signature`; `a cursor driven below the measure start is clamped` (notice `"Timing in bar 2 went before the start of the bar and was corrected."`).
  - snapping: `triplets against 16ths` with exporter-rounded durations land in shared columns where onsets are < unit/48 apart.
  - measure numbers come from `number` attributes (`"0"`, `"X1"`).
- [ ] **Step 2:** `npx vitest run tests/import/musicxml/read.test.ts` → FAIL.
- [ ] **Step 3: Implement** the cursor model of spec §5.5 "Time" and "Which staff". Run `npm install -D @xmldom/xmldom@^0.9` first; update the spec §2 file tree in this commit. Notes: only tab-staff pitched notes with string/fret produce `TabNote`s (full note rules in Task 7; here, every tab note with string/fret becomes a note).
- [ ] **Step 4:** same → PASS; `npm test`; `npx tsc -p tsconfig.json --noEmit`.
- [ ] **Step 5: Commit** `feat(musicxml): read tab staff, tuning and timing`.

### Task 7: MusicXML reader — note rules and notices

**Files:** Modify `src/import/musicxml/read.ts`; Test `tests/import/musicxml/notes.test.ts`

**Interfaces:**
- Produces: notices aggregated per kind as `"<count> <what> (bars <list>)"`, at most 10 bars then `"…"`, singular when count is 1. Kinds and wording (fixed here):
  - `"note without string/fret"` → `"3 notes without string/fret were skipped (bars 3, 4, 9)."`
  - harmonics → `"2 harmonics were skipped (bars 5, 6)."`
  - frets above 24 → `"1 note above fret 24 was skipped (bar 7)."`
  - strings outside 1–6 → `"1 note on a string outside 1–6 was skipped (bar 2)."`
  - same-string clash → `"2 places had two notes on one string; the first was kept (bars 4, 8)."`

- [ ] **Step 1: Failing tests:** ties — `<tie type="stop"/>` makes no note; `<tied type="stop"/>` only (no `<tie>`) makes no note; `<tied type="continue"/>` makes no note; a column of only tie-stops makes no column; tie-stops are ignored by the clash check. Cue, `<unpitched>`, `<notehead>x</notehead>` take time but make no note; `print-object="no"` notes are kept. Harmonic, fret 25, string 7, missing string/fret → skipped with the notices above. Same string same fret from two voices → one note, no notice; different frets → first kept, notice. Grace notes: two graces before a main note → slots −2, −1 at the main note's time; a grace with no following note in its voice and measure → slot +1 at the previous note's time.
- [ ] **Step 2:** `npx vitest run tests/import/musicxml/notes.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** same → PASS; `npm test`.
- [ ] **Step 5: Commit** `feat(musicxml): ties, graces, skipped notes and notices`.

### Task 8: MusicXML reader — capo, transpose, pitch check, layout marks

**Files:** Create `src/import/musicxml/capo.ts`; Modify `read.ts`; Test `tests/import/musicxml/capo.test.ts`, `tests/import/musicxml/checks.test.ts`

**Interfaces:**
- Produces: `export function capoFromText(text: string): number | null` (1–12 or I–XII after "capo", optional "on"/"at", optional "fret", separated by spaces/punctuation; never after "da "); `readMusicXml` fills `capo`, sounding-pitch checks, `newBlock`, and these notices (fixed here unless quoted from the spec):
  - conflicting capo → `"The score names more than one capo; used capo 3."`
  - capo > 12 → `"The score says capo 14, which is more than 12; set the capo yourself."` (capo written as 0)
  - later clef/tuning/capo change → `"The tab's tuning or capo changes in bar 12; the first one was used."`
  - pitch check (spec) → `"The written pitches don't match the tab's tuning and frets in bars 3, 5; check the tuning and capo."`
  - tuning from pitches → `"The tab has no tuning, so it was worked out from the notes."` plus, when a capo was found, `" The written pitches may already include the capo, so the tuning could be 3 semitones high."`
  - no tuning and no pitches → `"The tab has no tuning; standard tuning was used."`
  - repeats (spec) → `"This score has repeats or D.C./D.S. marks; they are not followed: the music plays straight through as written, with first and second endings one after the other."`

- [ ] **Step 1: Failing tests.** `capoFromText`: "Capo III" 3, "capo 3" 3, "Capo: III" 3, "Capo. 2" 2, "Capo on 2" 2, "Capo at fret 3" 3, "Da Capo al Fine (2x)" null, "Capo XIII" null, "Capo 14" 14 (range check happens in the reader). Reader: `<staff-details><capo>2` wins over words "Capo III"; words split over two `<words>` in one direction ("Capo", "III"); "Capo III" in both parts → 3, no notice; `<credit-words>Capo 2` → 2; two different capos → first + notice; capo 14 → 0 + notice; no capo → 0. Transpose: a part with `<transpose><chromatic>0</chromatic><octave-change>-1</octave-change>` → no pitch-check notice; `<transpose number="2">` applies only to staff 2; missing `<staff-tuning>` with transposed pitches → tuning not an octave high, notice; with a capo too → the capo sentence appended. Pitch check: frets off by one in bars 3 and 5 → spec notice naming them; d = capo for most notes → no notice. Layout: `<print new-system="yes">` and `new-page="yes"` set `newBlock`; `<print>` read from the tab part, else the first part. Repeats: `<repeat>`, `<ending>`, `<segno>`, `<sound dacapo="yes">` → one notice; a light-light double barline → none.
- [ ] **Step 2:** `npx vitest run tests/import/musicxml/capo.test.ts tests/import/musicxml/checks.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** same → PASS; `npm test`.
- [ ] **Step 5: Commit** `feat(musicxml): capo, transposition, pitch check and layout marks`.

### Task 9: Write the tab text

**Files:** Create `src/import/musicxml/write.ts`, `src/import/musicxml/index.ts`; Test `tests/import/musicxml/write.test.ts`, `tests/import/musicxml/roundtrip.test.ts`

**Interfaces:**
- Consumes: `TabScore` (Task 6), `luteLineWidth`, `LUTE_VIEW_WIDTH` (Task 3), `tuningLabels`, `midiToName`, `importTabText`, `stepsFromColumns`.
- Produces: `export function writeTabText(score: TabScore): string`; `export function musicXmlToTabText(xmlText: string, parser: XmlParser): { text: string; notices: string[] }` (throws `ImportError`).
- Rules: spec §5.5 "The generated text" — headers `Tuning: <low→high with octaves>` and `Capo: N`, blank line, blocks of 6 lines labelled by `tuningLabels`; scale from gap list (5% rule; 12 characters per quarter with no gaps); placement walk with `earliest` = prev column's last digit + 2 / directly after a digit or `|` for a bar / directly after `|` for a column; each measure's `|` timed one character before the next measure's start; new block at `newBlock` or before a measure that would make `luteLineWidth(block items) > LUTE_VIEW_WIDTH` (a lone wider measure stays whole); each block's lines start with `|` and end with that block's last `|`.

- [ ] **Step 1: Failing tests.**
  - `write.test.ts`: headers exact (`'Tuning: E2 A2 D3 G3 B3 E4'`, `'Capo: 0'` when none); labels `d# A# F# C# G# D#` for half-step down and ASCII `F#` in the header for F#3; 16ths at 3 characters, a single 32nd (< 5% of gaps) squeezed not scaling the piece; single-column piece uses 12 characters per quarter; barline sits in the last slot before the next measure; a grace column takes 3 characters from the gap before when free, else shifts the rest; blocks: 3/4 with 16ths → 3 bars per block, 4/4 → 2, 2/4 → 4, each block lays out as exactly one lute line (`layoutLuteTab(importTabText(text) …).systems.length` per block); `newBlock` starts a block.
  - `roundtrip.test.ts`:
    - `gives back every note` — strings/frets in order, tuning MIDI for `E3 A3 D4 G4 B3 E4` (label fallback would be wrong), capo 3.
    - `keeps the rhythm` — `stepsFromColumns` times proportional to onsets across barlines and a block break, for a fixture with nothing pushed.
    - `pushed notes stay in their bars` — a 32nd run under 5% of gaps, a last note pushed onto the barline slot, frets 1, 1, 2 squeezed, `12` before `|` and `|12` after → every note in the right bar (bar index from `bar` events), order kept, no two numbers on one string touching.
    - `generated text parses without warnings` (Review Focus 1) — for every fixture in the file, `importTabText(text).warnings` is `[]`.
    - `converts a 400-measure score quickly` (Review Focus 2) — two voices, 16ths; `musicXmlToTabText` under 1500 ms.
    - `Dowland-shaped score` — two parts (notation P1, tab P2), "Capo III" words in both, implicit one-beat pickup in 3/4, voices 1, 2, 4 with backups to measure start, `new-page` without `new-system`: capo 3, pickup bar one beat long, blocks broken at the page mark.
- [ ] **Step 2:** `npx vitest run tests/import/musicxml/write.test.ts tests/import/musicxml/roundtrip.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** same → PASS; `npm test`; typecheck.
- [ ] **Step 5: Commit** `feat(musicxml): write tab text from a MusicXML tab staff`.

### Task 10: Open any import file

**Files:** Create `src/import/openFile.ts`; Test `tests/import/openFile.test.ts`, `tests/import/musicxml/samples.test.ts`

**Interfaces:**
- Consumes: `sniff`, `listZip`, `musicXmlToTabText`, `ImportError`, existing `extractPdfText`, `looksLikeNotationPdf`, `NOTATION_PDF_MESSAGE`.
- Produces:
  ```ts
  export type OpenedFile =
    | { ok: true; text: string; notices: string[]; message: string | null }  // message: e.g. the notation-PDF or no-text-PDF message
    | { ok: false; message: string };
  export interface OpenDeps { parser: XmlParser; extractPdfText: (data: ArrayBuffer) => Promise<string> }
  export async function openImportFile(bytes: Uint8Array, deps: OpenDeps): Promise<OpenedFile>;
  ```
  PDF branch keeps today's behaviour and messages (empty text → `'No text found in this PDF. Scanned (image) PDFs are not supported.'`; notation → `NOTATION_PDF_MESSAGE`; read error → `'Could not read this PDF: <reason>'`). Zip branch: `META-INF/container.xml` first `rootfile full-path` (normalised), else first `.xml`/`.musicxml` outside `META-INF/` whose `sniff` is `musicxml`; `timewise` → spec message; none → `"This file isn't a PDF, MusicXML or text file."`. `unknown` → same message. `ImportError` → `{ ok: false, message }`.

- [ ] **Step 1: Failing tests:** routes PDFs to the PDF reader (stub extractor; text PDF → text, notation PDF → `NOTATION_PDF_MESSAGE` with text, Review Focus 5); `.mxl` via container; `.mxl` without container picks the score, skipping `[Content_Types].xml`; `.docx`-like zip → not-a-file message; `score-timewise` → spec message; plain text → `{ ok: true, text, notices: [], message: null }`; damaged XML → damaged message. `samples.test.ts`: `describe.skipIf(!process.env.MUSICXML_SAMPLES)` — every `.mxl`/`.musicxml` in that folder opens with `ok: true` and no pitch-check notice.
- [ ] **Step 2:** `npx vitest run tests/import/openFile.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** same → PASS; `MUSICXML_SAMPLES=~/Documents/Music npx vitest run tests/import/musicxml/samples.test.ts` → PASS locally (Robin Galliard); without the variable → skipped.
- [ ] **Step 5: Commit** `feat(import): open PDF, MusicXML, .mxl and text files`.

### Task 11: Import dialog and browser tests

**Files:** Modify `src/ui/ImportDialog.tsx`, `src/styles.css` (if needed), `e2e/app.spec.ts`, `README.md` (one line: import accepts MusicXML/`.mxl` and text files); Create `e2e/helpers/mxl.ts` (re-exports `makeZip` from `tests/helpers/zip.ts` and a tiny score builder or literal)

**Interfaces:**
- Consumes: `openImportFile` (lazy `import('../import/openFile')`), browser `DOMParser`, lazy `extractPdfText`.
- UI copy (fixed): intro `"Paste plain-text tab, or open a file: a PDF of plain-text tab, a MusicXML file with a tab staff (.musicxml, .mxl), or a text file."`; button `"Open file…"` with no `accept`, `data-testid="import-file"`; busy `"Reading file…"`; notices `<ul data-testid="import-notices">` under the button, cleared when another file is opened; errors keep `role="alert"`; textarea `wrap="off"`.

- [ ] **Step 1: Failing tests.** UI unit (`tests/ui/guitarView.test.tsx` ImportDialog block): markup has `data-testid="import-file"` without an `accept` attribute, `wrap="off"`, the new intro. E2E: update `imports a text-based PDF` to `import-file`; `opens a MusicXML .mxl` (built with `makeZip`; paste box starts with `Tuning: E2 A2 D3 G3 B3 E4` and `Capo: 3`; after Import, Capo field shows 3 and the guitar tab is visible); `re-opening import shows the generated tab` (Review Focus 3: open Import tab… again → textarea equals the generated text; Import again → same `guitar-tab` text); `a damaged .musicxml shows the damaged-file message` (browser `parsererror` path); `a .txt tab file lands in the paste box`.
- [ ] **Step 2:** `npx vitest run tests/ui/guitarView.test.tsx` → FAIL; `npm run build && npx playwright test` → new e2e FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** `npm test`, typecheck, `npm run build && npx playwright test` → all PASS.
- [ ] **Step 5: Commit** `feat(ui): open MusicXML, .mxl and text files from the import dialog`.
- [ ] **Step 6: Manual (user):** on an Android phone, "Open file…" picks an `.mxl` from Downloads (spec §12). Report the result; do not claim it.
