# Final review — feat/guitar-to-lute (b0e1835..f273a6d)

Reviewed in passes:
1. Spec and ledger.
2. Core: `model`, `pitch`, `tunings`, `notation`, `chordName`, `parse/*`, `convert/*`, `piece`, `edit`, `storage`, `tabcode`, `asciiRender`, `luteTabLayout`.
3. `audio` and `import`.
4. Every `ui/*` file, plus `styles.css`, `vite.config.ts` and `e2e`.

I re-ran `vitest` (27 files, 206 passed) and `tsc` (clean) at HEAD, then a production build in a scratch copy. All probes ran as throwaway vitest files in a scratch copy of the repo (`/tmp/claude-1000/.../scratchpad/probe/tests/probe/*.test.ts[x]`). Nothing in the checkout was modified apart from this file.

### Strengths

- **Clean architecture that follows the spec.** `src/core` is pure TypeScript with no DOM or React. `convertPiece` is a pure function of the piece, and the UI memoises it on `guitar`/`lute`/`overrides`, so editing the title never re-converts.
- **A carefully built solver.** It has:
  - two passes (as written, then octave shifts and drops);
  - branch-and-bound with a live top-K limit, and a 5000-leaf cap;
  - drop penalties by musical role, with roles taken from the input pitches;
  - a rule that rejects a shift into unison;
  - a memo per (pitches, pins) column, so repeated songs are cheap: 1000 columns of 6 repeated barre chords on a 10-course lute convert in 9 ms, and Auto takes 146 ms.
- **Overrides stay consistent.** `removeChord`, `moveChord` and `updateChord` re-index or clear chord overrides. Re-importing clears tab pins after a confirm. Pins that fail `pinShift` (wrong course, fret above max fret, course removed) become `pin` warnings instead of crashing.
- **Storage is defensive.** `migrate` validates the whole piece shape. A newer `schemaVersion` gives a clear error. `safeLoad`/`initialPiece` skip corrupt pieces, quota errors show a banner, and the `ErrorBoundary` offers a raw-data download.
- **No injection sinks.** `grep -rn "dangerouslySetInnerHTML\|innerHTML\|outerHTML\|eval(\|new Function" src/` finds only `util.ts:35`. That line reads `innerHTML` from SVG that React rendered, which is already escaped. Titles and chord names reach the DOM only as React text nodes. The TabCode title comment strips `{}`. pdfjs-dist is ^4.10.38, past the 4.2.67 font-eval fix.
- **The deferred build rulings are now closed.** The Task 15 and Task 20 rulings asked for a re-check at Task 23/24. A production build at HEAD shows pdf.js in its own lazy chunk (`pdf-*.js`, 365 kB). `pdf.worker.min-*.mjs` (1.38 MB) is in the service-worker precache (11 entries, 1.93 MB), so PDF import works offline as spec §10 requires.
- **The tests exercise real behaviour,** not just the happy path:
  - a property test of pitch fidelity;
  - a DP regression test;
  - real-world tab fixtures;
  - snapshots across notations and course counts;
  - Playwright tests for chord entry, PDF import, overrides plus reload, and offline.

### Review Focus verdicts

1. **Label widths** (`e |`, `D#|`, `e  |`): **holds.** Bodies are measured from the first `|`/`-`/`:` after the label. I probed spaces after the label, `D# |`, indented blocks, `e:` labels, lowercase labels and unlabelled blocks; all align. One related edge case breaks (Minor #12).
2. **Empty input:** **holds.** An empty piece, an all-muted or all-unset chord (`chordPitches` returns `[]`, giving an empty voicing), an empty tab, and chord boxes with no voicing all render. The guitar and lute empty states are covered by tests.
3. **Changing lute tuning after pinning:** **partly holds.** No crash in any probe. Pins that fail on their own (removed course, changed pitch, fret above max fret) become `pin` warnings. However, a pinned shape whose notes are each still valid but which is no longer playable as a whole silently **drops a note** instead of ignoring the pin (Important #2). I reproduced this by lowering Max stretch.
4. **Corrupted localStorage:** **partly holds.** Bad index JSON, bad piece JSON, a piece of the wrong shape and a newer-schema piece all start the app. An index that is **valid JSON with the wrong entry shape** crashes on every load (Important #4). A corrupt index also orphans every saved piece (Minor #6).
5. **Long tabs:** **holds for realistic input; marginal in the worst case.** A repeated song takes 9 ms to convert and 146 ms for Auto. The worst case I could construct was 1000 *distinct* dense 6-note columns, most needing pass 2: about 0.85 s per edit and about 9.8 s for a synchronous Auto, with no busy indicator. The plan's own test allows 15 s for Auto, so it does not check "interactive" (Minor #11).

### Issues

#### Critical (Must Fix)

None.

#### Important (Should Fix)

**1. Number fields clamp on every keystroke, so transpose can't be typed and Max fret can't be set to 10 or 11.** Confirmed.
- **Where:** `src/ui/util.ts:1-5` (`clampInt`), used by `LuteSettingsBar.tsx:311,318,322` and `GuitarView.tsx:255`.
- **What's wrong:** `clampInt('')` returns the lower bound. A probe gives `clampInt("",-12,12) = -12`, `clampInt("-",-12,12) = -12` and `clampInt("1",4,12) = 4`. The inputs are controlled and commit on every `onChange`. In a `type=number` field, a lone `-` or an empty field reports `value === ""`.
- **Effect:**
  - Deleting the transpose value, or starting to type `-3`, immediately sets transpose to −12 and re-converts. Typing on gives `-123`, which clamps back to −12. Negative transposes can only be reached with the spinner.
  - For Max fret, typing `1` becomes 4, then `0` gives 40, which clamps to 12. 10 and 11 can't be typed.
  - Transpose is a headline control (spec §6.9).
- **Fix:** keep a local draft string for each field. Commit only when the draft parses to an in-range integer, or on blur/Enter, and ignore `''` and `'-'`.

**2. A pinned shape that has become unplayable drops a note instead of ignoring the pin.** Confirmed by probe.
- **Where:** `src/core/convert/column.ts:249-292`.
- **What's wrong:** `pinShift` checks each pin on its own. If every pin still fits but the pinned shape as a whole no longer passes `isPlayable` (for example after lowering **Max stretch**), pass 1 finds nothing. Pass 2 can then only drop notes, and every note is pinned because `cycleNote` pins the whole shape.
- **Probe:** a pinned shape `[1:5, 2:2, 5:0]` at Max stretch 6. After setting Max stretch to 2:
  - B2 is **dropped**, with the warning "dropped (no playable place)" and no `pin` warning.
  - The same column without pins converts with all three notes and no drop.
- **Effect:** a note silently disappears, and the message blames the lute rather than the stale pin. This contradicts spec §6.8 ("A pin that becomes impossible … is dropped with a warning") and §11 ("Impossible pin → Pin removed, warning").
- **Fix:** in `solveColumn`, if pass 1 finds nothing while any pins are applied, re-run without them. If that run finds a playable result, report every pinned index in `badPins` and use the unpinned solution. Add a test that pins a span-4 shape, sets `maxStretch: 2`, and expects no drop plus `pin` warnings.

**3. Guitar-view note spelling ignores the chord boxes, so sharp-key chords are spelled with flats.** Confirmed by probe.
- **Where:** `src/ui/App.tsx:130`. `guitarFlats` is `preferFlats(guitarColumns(piece)…)`, which reads tab columns only.
- **What's wrong:** with no tab, `preferFlats([])` is `true`. The spec's own example (§5.1) is an E chord whose notes read "E B E G♯ B E".
- **Probe:**
  - An E chord with no tab shows the caption **"E B E A♭ B E"**.
  - B7 shows **"B E♭ A B G♭"**.
  - The lute side of the same piece correctly gives `flats=false`, because `convertPiece` includes the chord pitches.
- **Effect:** every chord entered in a sharp key before a tab is imported is misspelled on the main input screen.
- **Fix:** compute `guitarFlats` from the chord pitches plus the tab pitches, as `convertPiece` already does.

**4. An index entry with a non-string `title` crashes the app on every load.** Confirmed by probe. The trigger is contrived, but the app can't recover from it.
- **Where:** `src/core/storage.ts:274-281` and `src/ui/PieceList.tsx:211`. `list()` only checks that `id` is a string, and `PieceList` renders `m.title || 'Untitled'` as a React child.
- **Probe:** `g2l:index = [{"id":"a","title":{"x":1}}]` (or `title: [{}]`) makes `<App>` throw "Objects are not valid as a React child".
- **Effect:**
  - The ErrorBoundary appears, but **Reload** crashes again: the throw happens before any autosave effect could rewrite the index.
  - The user can't get back without clearing site data by hand. "Download saved data" does still work.
  - This is the "valid JSON, wrong shape" class that Review Focus 4 names explicitly.
  - The index has no `schemaVersion`, so a future change to `PieceMeta` would hit the same path, for example after a PWA rollback.
- **Fix:**
  - In `list()`, coerce each entry to `{ id: string, title: typeof title === 'string' ? title : '', updatedAt: typeof updatedAt === 'string' ? updatedAt : '' }`, and de-duplicate by id.
  - Optionally give the ErrorBoundary a "Reset index" button.

#### Minor (Nice to Have)

5. **Playing a chord during tab playback leaves the app stuck in "playing".** Confirmed by code path.
   - **Where:** `src/audio/pluck.ts:280-283` and `src/ui/App.tsx:132`.
   - **Cause:** `playChord` calls `this.stop()`, which also clears the pending `onStep(null)` timer. App's `playing` state is never reset.
   - **Effect:** the header keeps showing "■ Stop", and a lute column stays highlighted until the user clicks Stop.
   - **Fix:** have `playChord` notify via a stop callback, or have App call `setPlaying(null)` in `playChord`.

6. **A corrupt or out-of-sync index permanently hides every saved piece.** Confirmed by probe.
   - **Where:** `src/core/storage.ts:274-293`.
   - **Cause:** `list()` returns `[]` for an unparseable index, and the next `save()` rewrites the index with only the current piece. The piece keys stay in localStorage but can never be reached from the UI.
   - **Probe:** with A and B stored and the index corrupted, the list shows only `['C']` after the next save, while A's data is still stored.
   - The same orphaning happens if a quota error hits the index write after the piece write succeeded.
   - **Fix:** add `keys()` to `StorageLike` and rebuild the index from `g2l:piece:*` when it is unreadable or missing ids.

7. **JSON import checks types, not ranges.** Confirmed by probe.
   - **Where:** `src/core/storage.ts:222-258`.
   - **Effects:**
     - A tab note with `string: 9`, or a guitar tuning with only 2 courses, gives the warning "Tab column 1: **undefinedNaN** dropped".
     - `lute.maxFret: 20` makes TabCode export throw `RangeError` inside an event handler, so nothing happens and nothing is shown.
     - `frettedCourses: 99` is accepted.
   - The UI can't produce any of these values; only hand-edited JSON can.
   - **Fix:** validate the ranges the UI enforces:
     - string 0–5;
     - fret 0–24;
     - capo 0–12;
     - transpose −12..12;
     - maxFret 4–12;
     - maxStretch 2–6;
     - 1 ≤ frettedCourses ≤ courses.length;
     - guitar `courses.length === 6`.

     Also wrap `toTabCode` in a try/catch that calls `alert`.

8. **Voicings that look identical are offered when a chord contains a unison.** Confirmed by probe.
   - **Where:** `src/core/convert/column.ts:192-195`. The candidate key is ordered by srcIndex, so swapping two unison notes gives a "different" candidate.
   - **Probe:** guitar `[0,5,4,2,x,x]` at +3 returns voicings 1 and 2 with exactly the same placements; only `srcNoteIndex` differs.
   - **Effect:** spec §6.7 asks for the "top 3 *distinct* voicings". Here ◀/▶ shows the same diagram twice, wasting a slot.
   - **Fix:** de-duplicate by the sorted set of `course:fret` (or `course:fret:pitch`) when adding to `TopK`.

9. **Italian tab clips simultaneous diapasons from 2 upward.** Confirmed by probe.
   - **Where:** `src/core/luteTabLayout.ts:124,131,190`. With `rowsAbove = 3`, the 2nd stacked diapason lands at the system's top edge and the 3rd above it.
   - **Probe:** on a 13-course lute the glyphs are at y = 14, 0 and −14 in the first system, so they are clipped by the SVG viewBox.
   - **Relation to deferred items:** this is related to the deferred French item ("> 3 diapasons in 10-course French"), but here it triggers at 2 diapasons, in Italian, at the top of the page.
   - **Fix:** size `rowsAbove`/`rowsBelow` from the largest stack actually used in each system.

10. **Guitar tab playback has no current-column highlight.** Confirmed by code path.
    - **Where:** `src/ui/App.tsx:227`. `GuitarView` is not given `playing`.
    - **Effect:** spec §8 says "the current column is highlighted" for both tabs, but only the lute tab does this.

11. **Conversion and Auto run synchronously, with no busy state.** Confirmed by probe; see focus item 5 for the timings.
    - **Effect:** realistic input is fine. Pathological input freezes the tab for about 10 s on Auto.
    - **Fix:** show a busy state and yield (or use a worker) for Auto. Tighten the test to a meaningful budget for a dense, non-repeating input.

12. **A tab line that lacks its leading `|` while the other lines have one is shifted by one column.** Confirmed by probe.
    - **Where:** `src/core/parse/asciiTab.ts:87-93`.
    - **Probe:** `B ---1---|` among `x|---0---|` lines splits one chord into columns `["1:1", "0:0 2:0 3:2 4:3"]`.
    - **Effect:** rare in real tabs.
    - **Fix:** align on the median origin of the block rather than each line's own origin.

13. **Diapasons in chord boxes are ambiguous in some notations.** Confirmed by code path.
    - **Where:** `src/core/notation.ts:22`, as used in `LuteChordBox.tsx:259`.
    - **Effect:**
      - In modern notation every diapason in a chord box renders as a bare `0`, so which course it is gets lost.
      - On the 13-course Baroque lute in French, the open 7th course renders as a plain `a`, which looks like course 1 open.
    - **Fix:** use a course-qualified label in chord boxes, such as `7:0` or the course number.

14. **Unreadable pieces stay in the sidebar and fail silently.** Confirmed by code path.
    - **Where:** `src/ui/state.ts:51-58,93-96`.
    - **Effect:** clicking a corrupt or newer-schema piece does nothing and shows no message. "All pieces (JSON)" export silently leaves those pieces out.
    - **Fix:** show the `migrate` error message, such as "made by a newer version", and mark the list entry.

15. **Lute chord-box SVG export has no chord names.** Confirmed by code path.
    - **Where:** `src/ui/LuteChordBox.tsx:207-208` and `src/ui/util.ts:28-38`. The name and note caption live in HTML outside the `<svg>`, and `combineSvgs` copies only the SVG contents.
    - **Effect:** the exported chord chart is a row of unlabelled diagrams.
    - **Fix:** draw the chord name as `<text>` inside each box's SVG.

16. **Autosave has no flush on unload.** Not confirmed in a browser; code reading only.
    - **Where:** `src/ui/state.ts:44-47`.
    - **Effect:** closing the tab within 500 ms of an edit loses that edit.
    - **Fix:** add a `pagehide`/`visibilitychange` listener that calls `trySave(piece)`.

### Declined to judge

- **TabCode diapason syntax** (`Xa`, `Xa/`, `Xa//`): the executor's Task 13 ruling covers it. The spec sources were unreachable for the executor, and I can't verify them either.
- **Tab string assignment is by position, even when labels are written low→high:** spec §5.3.4 mandates assignment by position.
- **Typed chord names that start with A–G but aren't chords get transposed** (e.g. "Bridge" becomes "Dridge" at +3): spec §4.4 says typed names are transposed. Chord boxes are meant to hold chord names.
- **`overrides.chordVoicing` is an index, so it can point to a different voicing after a transpose or tuning change:** spec §3 defines it as an index.
- **Auto transpose ignores existing pins** (its conversions run with overrides cleared): this follows spec §6.9, and the pins then surface as stale-pin warnings.
- **Auto tie-breaks compare floating-point totals exactly:** this could in theory miss ties. It's cosmetic, and the spec's tie order is followed otherwise.
- **The PWA manifest has only an SVG icon** (`sizes: any`): some platforms (iOS home screen, older Chrome installability) want PNG 192/512. I didn't verify current Chrome criteria, and the spec only asks for "icons".
- **Deferred by the user, not re-reported:**
  - impossible pins are never removed from storage;
  - import warnings are lost when switching views;
  - there is no custom guitar tuning entry;
  - `importMany` overwrites pieces with the same id;
  - empty Untitled pieces are autosaved;
  - French 10-course diapason overlap.

  Minor #9 is related to the last one but is a different, earlier trigger.

### Recommendations

1. Fix Important #1–#4 first. Each is small and local:
   - #1: a draft-string number-input helper.
   - #2: a fallback without pins in `solveColumn`, plus one test.
   - #3: include chord pitches in `guitarFlats`.
   - #4: coerce `PieceMeta` fields in `list()`.
2. Then take the cheap Minor fixes: #5 (stuck playing state), #15 (chord names in the SVG export), #8 (de-duplicate voicings) and #7 (range validation in `migrate`).
3. Add regression tests for:
   - stale pins via `maxStretch`;
   - wrong-shape index entries rendered through `<App>`;
   - guitar spelling with chords only;
   - number-field editing (`''`, `'-'`, `'1'` then `'10'`).

### Assessment

**Ready to merge?** With fixes

**Reasoning:** The core is well built and well tested, and nothing loses data in normal use. However, four user-facing defects are cheap to fix and should go in before merge:
- transpose and Max fret can't be typed normally;
- stale pins can silently drop notes, against §6.8 and §11;
- chord boxes are misspelled in sharp keys, against the §5.1 example;
- a wrong-shape index entry causes a crash loop the user can't recover from.
