# Review: §5.5 MusicXML import (commit 31adece, branch feat/musicxml-import)

Scope: §5.5, plus the edits to §2, §5.3 step 2, §11, §12 and §13. I checked the design against the existing pipeline (`headers.ts`, `asciiTab.ts`, `importText.ts`, `normalize.ts`, `asciiRender.ts`, `edit.ts`, `pluck.ts`, `luteTabLayout.ts`, `ImportDialog.tsx`, `pdf.ts`/`pdfText.ts`) and against the sample MuseScore export.

## How I checked

- **The sample file.** I surveyed `robin-galliard-…-tablature.mxl` with scripts. It was extracted into my own session scratch directory, never into the repo. What it contains:
  - Exported by MuseScore 3.6.2 as MusicXML 3.1, with no `mimetype` entry in the zip.
  - Two parts in a brace group: P1 is standard notation (treble clef 8vb), P2 is TAB.
  - P2 has `staff-lines` 6 and a standard `staff-tuning` (E2 A2 D3 G3 B3 E4).
  - P2 has 459 notes: 440 pitched notes, all with `<string>`/`<fret>`, and 19 rests.
  - Voices are numbered 1, 2 and 4, with `<backup>` always back to the start of the measure.
  - P2 has no `<forward>`, ties, grace notes or `<staff>` elements.
  - `divisions` is 4 throughout, the time is 3/4, and measure 0 is an implicit one-beat pickup.
  - "Capo III" appears only as `<words>`, in both P1 and P2. There is no `<capo>` element.
  - `<print new-system>` at measures 7, 13, 19, 31, 36, 41 and 45; measure 25 has `new-page` only.
  - For all 440 notes, `<pitch>` = staff-tuning + fret, so the frets are relative to the capo.
- **The existing parser.** I bundled the parser (`importTabText`, `parseHeaders`, `stepsFromColumns`, `tuningLabels`) with the repo's own rolldown into scratch. I then fed it hand-made generated-style tab to see exactly what survives the re-parse. Results are quoted as "run N" below.
- **Repo files:** none were edited.

**Overall:** the approach is sound and fits the sample well. Reading string/fret from the tab staff avoids every pitch, transposition and octave-clef problem. String 1 = highest and `staff-tuning line="1"` = lowest are both correct. Reading the zip's central directory is the right call. Reusing the paste box keeps one source of truth.

Two things should change in the spec before anyone codes: the time model (C1) and the "rhythm survives exactly" claim (C2). The Important items are mostly gaps where two implementers would build different things, and some of those differences silently corrupt the result.

---

## Critical

### C1. "Each voice keeps its own position" is not how MusicXML timing works

**What the spec says:**
> each voice keeps its own position, advanced by `<duration>` and moved by `<backup>` / `<forward>`

**How MusicXML actually works:**
- Each part has a single time cursor per measure.
- Every non-`<chord/>` note advances it by its `<duration>`, whatever its voice or staff. That includes rests, cue notes and notes on other staves.
- `<backup>` and `<forward>` move that same cursor.
- `<voice>` and `<staff>` are labels; they do not own a position.
- A `<chord/>` note starts where the previous note started and does not advance the cursor. The spec says the first half of this but not the second.

**Failure scenarios:**
1. **Partial backup** (legal, and used by some exporters and hand-edited files). In 3/4, voice 1 has three quarter notes, then `<backup>` 1 quarter, then voice 2 has one quarter on beat 3.
   - Correct result: the voice 2 note starts on beat 3.
   - Under the spec's model, the backup moves voice 1's position (the current voice). Voice 2 then starts at its own position 0, so its note joins the beat-1 column.
   - The lute conversion then gets a wrong chord on beat 1 and nothing on beat 3.
2. **`<forward>` without `<voice>`.** `<voice>` is optional on `<forward>`, so the per-voice model cannot tell which position to move.
3. **Multi-staff part.** "Notes on any other staff are ignored" invites dropping staff-1 notes before computing time.
   - With a single cursor, the `<backup>` that follows staff 1 then drives the cursor negative.
   - Every tab-staff note lands one measure early, or at a negative time.
4. **`<divisions>`.** The spec never mentions it.
   - It can change mid-part, and `<duration>` is a decimal in the schema.
   - Raw division counts from different measures are not comparable.
   - If times are kept as floats, onsets that should be equal (triplets) can fail an equality test, so they land in separate columns.

The sample works under either model, because MuseScore always backs up to the start of the measure. So tests modelled on the sample will not catch this.

**Change:** rewrite the Notes bullet along these lines:
- A single cursor per measure. Every note (any voice, any staff, rests and cue notes included) advances it, except `<chord/>` notes, which start with the previous note and do not advance it. `<backup>`/`<forward>` move it.
- Notes on other staves still move the cursor but produce no output.
- Times are kept as integers in a common unit (the LCM of every `<divisions>` value seen). Decimal durations are rounded to that grid.
- A cursor below 0 or past the measure is clamped, with a notice.

### C2. "So the rhythm survives exactly" is false once the text is re-parsed

Playback time is `x × msPerUnit`, where `x` is the column's character position (`stepsFromColumns`, `pluck.ts:26`). Two things in the generated text add time that isn't in the music.

**Barlines** (run 8, and a second check):
- Spacing is 3 characters per 16th note. If `|` is written as an extra character, the onset gap across the barline is 400 ms instead of 300 ms.
- So every barline adds a third of the shortest note.
- If `|` instead takes one of the dash slots in the gap, the gap stays 300 ms. I verified this: `|0--0--0--0-|0--…` gives even 300 ms gaps.

**System breaks** (run 8):
- `parseAsciiTab` adds `width + 4` between blocks (`asciiTab.ts:218`), plus the closing and opening bars.
- In my two-block run, the gap across the break was 900 ms where 300 ms was expected.
- The sample has a system break every 4–7 measures, so playback hesitates at every system.
- (The lute layout resets its spacing at each break, `luteTabLayout.ts:76`, so only playback is affected.)

**Grace notes:** "columns pushed apart where grace notes need room" shifts every later note, so the rhythm is not exact there either.

**Ambiguity:** the spec doesn't say where `|` sits or whether it takes time, so two implementers will produce different spacing.

**Change:** decide before implementation.
1. **Barline:** place `|` in the last dash slot before the next measure's first position, so it takes no time.
   - For this to always be possible, include measure ends when computing the shortest gap.
   - Otherwise a short last note followed by a measure that starts with a rest can leave no free slot.
2. **System breaks:** either
   - change the parser's inter-block offset so that consecutive blocks continue in time. This touches §5.3 behaviour and tests for pasted tab too, where arguably it is also better. Or
   - drop "exactly" and say that system breaks and grace notes add short pauses.
3. Add a timing assertion to the round-trip test (see Testing).

---

## Important

### I1. Lines will be 150–450 characters wide, and the paste box soft-wraps them on a phone

I computed line widths for the sample with the spec's rules (16th = 3 characters, 36 per 3/4 measure):
- Systems that honour `new-system` come out at **149–236 characters** per string line.
- Measure 25 has `<print new-page="yes">` and no `new-system`. If only `new-system` starts a block, measures 19–30 become one 12-measure block **445 characters** wide.
- The `.modal textarea` has no `wrap="off"` or `white-space: pre`, so it soft-wraps.
- On a phone (~40–45 monospace characters across the modal), each of the six string lines wraps into 4–11 rows, interleaved.
- The tab becomes unreadable and uneditable in exactly the place the spec sends the user to correct things.
- Separately, a file with a single manual `new-system` (not "without any such marks") gets one block running up to that break: hundreds of measures on one line.

**Change:**
- Break on `new-system` **or** `new-page`.
- Also always cap a block, at N measures or about 100 characters of body, whatever the marks say.
- Read `<print>` from the tab part, falling back to the first part. MusicXML layout is usually only in the first part, and the tab part is often second, as P2 is here.
- Give the import textarea `wrap="off"` with horizontal scroll. This also helps PDF text.

### I2. Setting the scale from the single shortest gap in the whole piece blows up line widths

**Failure scenarios:**
- One 32nd-note ornament anywhere doubles every measure's width.
- 16th-note triplets in one voice against straight 16ths in another give an onset gap of 1/12 of a beat. At 3 characters per gap, that is 108 characters per 3/4 measure.
- Exporters that round tuplets to integer divisions produce onsets 1 division apart that should coincide. Those also set a tiny minimum gap, and become separate columns.

**Change:**
- Pick the scale from a robust statistic, such as the most common onset gap or a low percentile, with a floor of 3 characters.
- Place each column at `max(round(t·scale), previous start + previous width + 1)`. Rhythm is then approximate only where it gets squeezed.
- Snap onsets within a small tolerance (for example 1/48 of a quarter) into one column.

This also keeps the default Speed comparable between pieces. Today a piece containing 32nds would play at half the tempo of one with 16ths.

### I3. When no capo is written, the piece keeps its old capo

**The problem:** the spec writes `Capo: N` only when a capo is found.
- With no capo line, `parseHeaders` returns `capo: null` (run 3b).
- `applyImport` then keeps the piece's capo: `capo: imp.capo ?? p.guitar.capo` (`edit.ts:95`).

**Failure scenario:** a piece already has capo 3. The user imports a MusicXML file with no capo into it. Every note is 3 semitones high, with no warning.

The same happens for capo values above 12: `Capo: 14` is silently ignored (run 3c).

**Change:**
- Always write `Capo: N`, including `Capo: 0`. Clamp values above 12 or reject them with a notice.
- State that the `Tuning:` header is always written too. The spec implies it but doesn't say so.

### I4. String labels must be ASCII, or whole blocks vanish

**The problem:** `LABEL_RE` only accepts `[#b]`.
- A label like `F♯|` is not a label, and the line is not recognised as tab at all.
- In run 2b, one `F♯` line split the block, giving "Found 3 tab-like lines (expected 6); skipped".
- Run 2c (E♭ tuning written with ♭) gave "No guitar tab found".
- The app's display helper `prettyName` produces ♯/♭, so an implementer could easily use it.
- F♯3 is the motivating lute-on-guitar tuning: §5.3's own example uses it.

**Change:**
- Say the labels come from `tuningLabels()` (`src/core/asciiRender.ts:17`). It gives ASCII sharps and lowercases the top string when it repeats the bottom: Standard → `e B G D A E`, Half-step down → `d# A# F# C# G# D#`.
- Say the `Tuning:` header uses ASCII `#`/`b`.

### I5. The octave header doesn't work yet, and the round-trip test can't tell

**The problem:**
- Today, `parseHeaders('Tuning: E2 A2 D3 F#3 B3 E4')` returns `tuning: null` (run 1), because `NOTE_LIST` rejects digits. The §5.3 change is a prerequisite.
- `importTabText` then falls back to the labels, placing each in the octave nearest standard tuning. That reproduces E2 A2 D3 F#3 B3 E4 anyway.
- So the specified round trip "with the given tuning" passes even if the header change is never implemented.

**Change:**
- The round-trip test must use a tuning that the fallback guesses wrongly, and assert the MIDI values.
  - Examples: an octave-displaced string (Nashville-style E3 A3 D4 G4 B3 E4), or a string raised by 6 or more semitones.
- Add a header test with mixed octave and no-octave names (say which is allowed).
- Add a test that the header wins over the labels.

### I6. The spec doesn't say where a measure's length comes from (sample: pickup measure)

**The problem:** the spec says columns are proportional to start time and each measure ends with `|`, but not how long a measure is.
- The sample's measure 0 is `implicit="yes"` and 4 divisions (one beat) long, in 3/4.
- If the width comes from the time signature, the pickup gets 2 beats of trailing dashes.
- Playback then waits 2 extra beats before the first downbeat.
- Incomplete final measures and voices that end early have the same problem.

**Change:**
- A measure's length is the furthest cursor position reached in it, `<forward>` included. Use the time signature only for a measure with no content.
- Say that notices "name the bar" by the `number` attribute. Here that is "0", and it can be non-numeric, such as "X1".

### I7. Grace notes: spacing undefined, and with the existing parser they can merge into neighbours

**What happens:**
- A grace note `12` one character before its main note on another string merges into the same column, `s0f12+s1f3` (run 5).
- On the same string, `12` then `3` with no gap reads as `123`, which the parser splits into frets 1, 2, 3 (second check).
- The spec says "just before" and "pushed apart where grace notes need room" but not how much room, where it comes from, or whether later notes shift.
- Grace notes after a note (MuseScore "grace after", or a grace note at the end of a voice) precede nothing in their measure.

**Change:**
- A grace column needs the same minimum slot as any column (3 characters).
- Take the room from the preceding gap when it has 3 spare characters per grace note. Otherwise shift the rest of the measure, and accept approximate rhythm there.
- A grace note with no following note in its voice attaches after the previous note.
- Grace notes are excluded from the shortest-gap calculation.

### I8. The `.mxl` reader has two classic traps the spec's own tests won't catch

**The traps:**
- **Data offset.** An entry's data starts at local header offset + 30 + the **local** name length + the **local** extra-field length. The local extra field can be longer than the central one. Info-ZIP's `UT` timestamp field has 9 bytes of data locally versus 5 in the central directory. So a file re-zipped with common tools gives a wrong offset and a "damaged .mxl" error on a valid file.
- **Data descriptors.** Entries with flag bit 3 have zero sizes in the local header, which is common in streaming writers such as Java-based exporters. Sizes must come from the central directory.
  - The spec says "reads the central directory", which is right; this should be explicit.
- **20 MB limit.** Enforce it on the bytes actually inflated, aborting the stream, not on the declared size.

The spec's test (".mxl built in the test") will be written by the same implementer, with the same assumptions, so it won't catch any of these.

**Change:**
- Spell out these three rules in §5.5.
- Add unzip tests for an entry with a data descriptor, a local extra field longer than the central one, and an entry whose inflated size exceeds its declared size.

### I9. The capo fret convention isn't stated; use `<pitch>` as a cheap cross-check

**What the sample shows:** for every note, pitch = staff-tuning + fret, and "Capo III" is text only. So the frets are relative to the capo and `<pitch>` is written as if the capo were the nut. That matches the app (pitch = tuning + capo + fret). MusicXML's own definition of `<capo>` (it raises the open strings) implies capo-relative frets too.

**The gap:**
- The spec doesn't state the convention.
- I couldn't confirm what MuseScore 4 or Guitar Pro write when a capo is set: absolute frets would double the transposition.
- "Missing staff-tuning → standard" can also be silently wrong.

**Change:**
- State that frets are relative to the capo.
- For each note, compute `d = pitch − (tuning + fret)`.
  - If the most common `d` is 0 or equals the capo, the file is as designed.
  - Anything else gets a notice naming the bars. This also catches harmonics, wrong tunings and misread capos.
- When `staff-tuning` is missing, derive each string's open pitch from `pitch − fret`, rather than assuming standard tuning.

---

## Minor

### M1. Sniffing
- **`%PDF` at byte 0 only.** I believe PDF readers, pdf.js included, accept the header anywhere in the first 1024 bytes; I didn't verify this.
  - Failure: a PDF with a few junk bytes before `%PDF` opens through today's PDF button but would get "This file isn't a PDF or a MusicXML file."
  - Change: search the first 1024 bytes.
- **XML without an `<?xml` declaration.** A file that starts with `<!DOCTYPE score-partwise …>` or a comment is valid XML but would be rejected. So would UTF-16 files with an `FF FE` or `FE FF` BOM.
  - Decode using the BOM (UTF-8, UTF-16 LE or BE).
  - Then skip the declaration, comments, processing instructions and DOCTYPE, and look at the root element:
    - `score-partwise` → continue
    - `score-timewise` → its own message
    - anything else → "This file isn't a PDF or a MusicXML file."
- **Zips that aren't MusicXML** (`.docx`, and I believe Guitar Pro 7's `.gp`). The fallback "first `.xml` outside `META-INF/`" would pick something like `[Content_Types].xml` and report "no tab staff", which is misleading. The same root-element check fixes this.
- **Plain-text files.** With the filter gone, a `.txt` tab file is pickable but rejected. Loading text that isn't XML into the paste box is the obvious behaviour. This is your call; it is a small addition.

### M2. More `.mxl` details
**Failure scenarios:**
- An `.mxl` that ends with a zip comment, or uses a compression method other than 0 or 8, gets a generic "damaged file" error instead of a clear message.
- On a browser without `deflate-raw`, the user sees a raw exception.

**Change:**
- Find the end-of-central-directory record by scanning backwards, because the archive may end with a comment.
- Refuse compression methods other than 0 and 8 with a message.
- Normalise `./` prefixes and backslashes in `full-path`.
- Feature-detect `DecompressionStream('deflate-raw')` and show a message if it's missing. It needs Chrome 103 or later; Node 22.23 has it, which I checked, so the unzip tests can run in Vitest's `node` environment.

### M3. Which staff, which details, how many strings
- **Staff details.** Match `<staff-details number="n">` to the tab staff. The spec only mentions `<clef number>`. A `staff-details` with no `number` applies to every staff.
- **String count.** Use the number of `staff-tuning` lines, else `staff-lines`. `staff-lines` defaults to 5, so a tab staff without it would be reported as "5 strings".
- **First tab staff not 6-string.** If the first tab staff is a 4-string bass and a later one is a 6-string guitar, the spec errors even though a usable staff exists. Pick the first 6-string tab staff, with a notice for the others.
- **Mid-piece changes** to clef, tuning or capo: first one wins, with a notice.
- **Possible fallback (unverified).** Some exporters may put `<string>`/`<fret>` on a standard-notation staff with no TAB clef. I believe Guitar Pro or TuxGuitar may, but couldn't check. A fallback of "a staff with `staff-tuning` and string/fret on its notes" would cover them; check with an export before deciding.

### M4. Notes that shouldn't sound, or would sound wrong
These should take time but produce no column, or get a notice:
- `<cue/>` notes
- `print-object="no"` notes (decide which)
- dead notes (`<notehead>x</notehead>`)
- `<unpitched>` notes
- `<technical><harmonic>`: the text parser drops harmonics with a warning, but this import would silently play the fretted pitch, which is wrong at frets 5 and 7.

Two more:
- Frets above 24 are split by the parser: `25` becomes 2 and 5 (run 6). Skip them with a notice.
- String numbers outside 1–6: skip with a notice.

### M5. Ties
**Failure scenario:** an exporter writes only the visual `<tied>`, so the import misses the tie. A bass note held across the barline is struck again on every downbeat.

**Change:**
- Prefer `<tie type="stop">`. Fall back to `<notations><tied type="stop">` when `<tie>` is absent, because some exporters write only the visual one.
- Exclude tie-stops from same-string clash detection.
- Say that a moment where every note is a tie-stop produces no column.

### M6. Notices
- **Unisons.** Two voices with the same string and the same fret at the same moment are a shared unison (MuseScore allows it): drop the duplicate silently. Only different frets need a notice.
- **Aggregate.** Report "37 notes without string/fret (bars 3, 4, 9…)", not one notice per note.
- **Lifecycle.** Clear notices when another file is opened.

### M7. Capo text
- **Split text.** A direction can carry several `<words>`: the sample's measure 22 has two. Concatenate them per direction before matching.
- **Credits.** Also look in `<credit-words>`. MuseScore exports title-frame text, a common place for "Capo 2", as credits, not directions.
- **"Da Capo".** Exclude it. Reusing the header regex `\bcapo\b[^\d\n]{0,15}(\d{1,2})` on "Da Capo al Fine (2x)" yields capo 2. I checked this with `parseHeaders`.
- **Roman numerals:** accept I–XII only. The existing regex returns nothing for "Capo III" (checked), so Roman numerals need their own pattern.
- **Conflicting values:** first wins, with a notice.

### M8. Repeats and navigation
- Detect `<repeat>` and `<ending>`, and also D.C./D.S./segno/coda (`<sound dacapo|dalsegno|tocoda>`, `<segno>`, `<coda>`).
- The notice should say that first and second endings play one after the other, not only "repeated sections play once".
- Optional: emit `|:`/`:|`. `normalize.ts` already maps them to `|-`/`-|` with no change in width, so the user can see where the repeats are.
- Unverified: if an exporter writes `<measure-style><measure-repeat>` or slash notation without writing out the notes, those measures import empty. They deserve at least a notice.

### M9. Browser DOMParser and xmldom fail differently
**Failure scenario:** a truncated `.musicxml` in the browser parses to a `<parsererror>` document. The user gets "This MusicXML file has no tab staff" instead of a damaged-file message. Unit tests won't see this, because xmldom throws instead.

**Details:**
- On malformed XML, the browser `DOMParser` returns a document containing `<parsererror>` and does not throw. `@xmldom/xmldom` throws or reports through its error handler.
- xmldom has no `querySelector`.

**Change:**
- Write one `parseXml()` wrapper that detects both failure styles.
- Limit the code to `getElementsByTagName`, `childNodes`, `getAttribute` and `textContent`.
- Pass the `DOMParser` in, or read it from `globalThis`, so app code never imports xmldom.
- Add a Playwright case with a malformed file, because only the browser path matters to users.

### M10. Android file picker and UI details
- **Picker.** No `accept` is a plausible fix for `.mxl` being greyed out, but Playwright here only runs Desktop Chrome.
  - Add a manual check on an Android device to §12.
  - I couldn't verify whether Chrome on Android shows a chooser with camera/recorder options before Files when `accept` is empty.
- **Test id.** Renaming the input's `data-testid="pdf-input"` breaks the existing PDF e2e test (`e2e/app.spec.ts:48`). Keep the id or update the test.
- **Dialog text.** Update the intro sentence and the "Reading PDF…" busy label.
- **Lazy loading.** Load `musicxml.ts`/`unzip.ts` with a dynamic import, as `pdf.ts` is.

---

## §2, §11 and §13

- **§2 and §13:** consistent with §5.5. Keeping `@xmldom/xmldom` dev-only is right, but see M9 for how the app's DOM code must be written.
- **§11:** consistent, but its notices row should also list the kinds these findings add:
  - `<pitch>` mismatch (I9)
  - capo above 12 (I3)
  - rhythm approximated where grace notes or squeezed onsets shifted columns (I2, I7)
  - aggregated notes without string/fret (M6)
  - unsounded or skipped notes: cue, dead and harmonic notes, frets above 24 (M4)
  - D.C./D.S. and endings (M8)

## Testing gaps (§12)

- **Timing in the round trip.** Assert that the ratios of consecutive column gaps (or `stepsFromColumns` times) equal the ratios of the MusicXML onset gaps, including across barlines and system breaks. This would have caught C2.
- **Round-trip tuning.** Use a tuning the label fallback gets wrong (I5), and assert MIDI values. Also cover:
  - an F# tuning (ASCII labels, I4)
  - `Capo: 0` when there's no capo (I3)
  - a two-digit fret at the minimum gap
- **A Dowland-shaped hand-written fixture** with no third-party content, copying only the structure of the sample:
  - two parts in a brace group, standard first and tab second
  - "Capo III" words in both parts
  - a one-beat implicit pickup in 3/4
  - voices 1, 2 and 4 with backup to the start of the measure
  - `new-page` without `new-system`
  - a light-light double barline (expect no repeat notice)
- **Timing edge fixtures:**
  - a partial backup
  - `<forward>` without `<voice>`
  - a multi-staff part with tab on staff 2
  - `<divisions>` changing mid-piece
  - triplets against 16ths in two voices
  - a grace note with a two-digit fret at the start of a measure
  - an after-grace
- **unzip:**
  - an entry with a data descriptor
  - a local extra field longer than the central one
  - an archive comment
  - an unsupported compression method
  - inflated output larger than declared
  - Node 22 has `zlib.deflateRawSync` and `zlib.crc32` to build these.
- **sniff:**
  - a PDF with leading bytes
  - XML that starts with a DOCTYPE
  - UTF-16 XML
  - a zip with no MusicXML in it
- **Browser parse path:** a Playwright case with a malformed `.musicxml` file (M9).
- **Optional local-only test** for real exports like the Dowland file, without committing them:
  - Read every file in a directory named by an environment variable (for example `MUSICXML_SAMPLES`), and skip when it's unset.
  - Check that nothing throws and that the `<pitch>` cross-check (I9) passes.

## Quick list: where two implementers would differ

| Question | Suggested answer |
|---|---|
| Time model | Single cursor; other staves still move it (C1) |
| Time unit | Integers on the LCM of all `divisions` (C1) |
| Does `\|` take time? | No: it takes a dash slot (C2) |
| Measure length | Furthest cursor position; time signature only for empty measures (I6) |
| Scale | Robust common gap, minimum slot 3 characters, snap tolerance (I2) |
| Block breaks | `new-system` or `new-page`, plus a width or measure cap (I1) |
| Which part's `<print>` | Tab part, else first part (I1) |
| Label alphabet | `tuningLabels()`, ASCII (I4) |
| Capo header with no capo | Always write `Capo: 0` (I3) |
| Grace spacing | Full slot, taken from the previous gap, else shift (I7) |
| Which `staff-details` | Matched by `number` (M3) |
| Notice granularity | Aggregated per kind, with bar numbers (M6) |
| What counts as "repeats" | Repeats, endings, D.C./D.S./segno/coda (M8) |

---

# Second pass (on revision 2939b58)

Adopts every earlier item. New problems found and how the spec (af23076) answers them:

1. **100-character block cap chops lute output into 2-bar systems** (lute lines break at every guitar block; view 900 px ≈ 125–130 source characters). → Cap raised to 125 characters.
2. **A pushed note can land on the barline and show in the previous bar** (parser places a note on the barline character before the bar). → Barlines are one-character items in placement; at least one dash after a column's last digit; pushed-notes test fixture.
3. **`<transpose>` ignored** by the pitch check and by "missing tuning from pitches" (an octave-transposing guitar part would warn wrongly, or give a tuning an octave high); capo possibly double-counted. → Sounding pitch applies `<transpose>` first; notice when a pitch-derived tuning may include the capo; fixture.

Smaller: XML decoded with its declared encoding (ISO-8859-1), plain text capped at 1 MB; continuous blocks defined (longest line; `|` on 4+ of 6 lines; parser change, old pieces keep the pause until re-imported); exact gap counting for the scale (threshold 5%, sample's 16ths are 11–13%); single-column default scale; `<tied type="continue">`; "Capo at fret 3"; out-of-date text in §1, §2 (sniff comment, ui/ file list) and §11; default speed ≈ 42 bpm noted.
