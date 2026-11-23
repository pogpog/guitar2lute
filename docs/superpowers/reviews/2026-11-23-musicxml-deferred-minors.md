# MusicXML import: deferred minor findings

These are the minor findings from the MusicXML import reviews (task reviews, the whole-branch review and the re-checks) that are still open after the merge (`75d60e8`). Every item was judged "can wait": none of them refuses a valid file or gives a wrong note on realistic input. IDs are `T<task>-<n>` from the task reviews and `F<n>` from the final reviews.

## Open questions for the user

- **Lute layout on phones.** Lute lines are sized for a 900 px reference view (`LUTE_VIEW_WIDTH`). On a 360 px phone each block wraps on its own, which leaves short tail lines: the Robin Galliard file gives 41 lute systems. The alternative (option c) is to let lute lines fill the width across block breaks. That also changes pasted tab, so it belongs on its own branch.
- **Manual Android check.** Confirm that "Open file…" can pick an `.mxl` from Downloads on an Android phone.

## Behaviour (what a user could notice)

| ID | Finding | Why it can wait |
|---|---|---|
| F-a | Text typed into the paste box while a file is still being read is replaced when the read finishes. This behaviour predates the branch. | Needs typing during a slow PDF read. |
| F-b | A bare HTML or SVG file with no `<?xml`/`<!DOCTYPE` opens as text in the paste box instead of "This file isn't a PDF, MusicXML or text file." | Accepted trade-off of the `<Intro>` fix: the preview shows 0 columns and Import stays disabled. Real web pages start with a DOCTYPE. |
| T2-4 | Pasted tab whose lines have uneven lengths can overlap two columns by one character when the closing `\|` isn't at the last position. | Needs hand-typed ragged tab; playback bumps the time and nothing crashes. |
| T5-2 | A file that declares UTF-16 but has no BOM decodes as mojibake. | Exporters write a BOM with UTF-16. |
| T6-4 | The "Other tab staves were not imported" notice names only the part, not the staff number. | Still identifies the part. |
| T7-1 | A chorded grace note after a skipped first grace note joins the previous kept grace note's column. | Needs a skipped grace inside a chorded grace group; the output still parses. |
| T8-1 | `dacapo="no"` counts as a repeat. | Rare; it only adds a notice. |
| T8-2 | The later-change check compares a later `<capo>` with the staff-details capo, not the effective capo. | False notice only, and only when the capo came from text and a later `staff-details` repeats it. |
| T8-3 | `capoFromText` matches some contrived phrasings it shouldn't. | Contrived wording only. |
| T9-1 | Long runs of empty bars make one block's text line very long (`luteLineWidth` ignores empty bars). | Each empty bar is about 12 characters. The textarea scrolls wider and the lute line is empty, but nothing breaks. |
| T10-3 | A zip archive with no `META-INF/container.xml` that holds only a time-wise score gets "not a file" instead of the time-wise message. | Rare archive shape. |
| T11-4 | The notices list in the import dialog has no styling of its own, so it gets the browser's default indentation. | Cosmetic; check it on the phone during the Android check. |

## Robustness of unusual input

| ID | Finding | Why it can wait |
|---|---|---|
| T4-4 | An end-of-central-directory signature inside a zip comment can confuse the zip reader. | Needs a crafted archive; the result is the damaged-file message, not a crash. |
| T5-3 | An apostrophe in a comment inside a DOCTYPE internal subset confuses the root scan. | Pathological input. |
| T5-6 | A whitespace-only file, and a DOCTYPE quirk, widen the scan to the whole file. `sniff.ts` also has a dead condition. | Degenerate input only; the result is correct, just slower. |

## Code tidiness

| ID | Finding |
|---|---|
| T2-1 | Whether a block starts or ends with a barline is decided in two places (both use the same 4-of-6 rule). |
| T2-2 | A non-null assertion `lastBreak!` in the parser; safe by construction. |
| T3-2 | The lute layout's bar step and margins are not shared with the width calculation (`columnAdvance` is). |
| T3-3 | `LuteView` uses the literal `useState(900)` instead of `LUTE_VIEW_WIDTH`. |
| T3-4 | Doc comment wording in the layout code. |
| T5-4 | A redundant `\s\|﻿` in the sniff scanner. |
| T5-5 | Literal versus escaped U+FEFF in the source. |
| T10-3 / F4 | `sniff` sits outside the `try` in `openImportFile`, and the damaged-file message is defined three times (`unzip.ts`, `xml.ts`, `openFile.ts`). Export one `DAMAGED` from `xml.ts`. |

## Test gaps

| ID | Gap |
|---|---|
| T1-1 | More tests for a `Tuning:` header that mixes notes with and without octaves. |
| T1-2 | The "header wins over labels" test sits in an odd place. |
| T2-3 | Block-join tests use identical blocks: no three-block, lyric-separated or three-line leading-bar cases. |
| T3-1 | The lute-width agreement test doesn't sit at the 900/901 boundary. |
| T4-1 | Tests don't assert the `ImportError` class, only its messages. |
| T4-2 | The "bad offsets" zip test only truncates the end-of-central-directory record. |
| T4-3 | Untested zip paths: Zip64 locator, corrupt deflate data, no `DecompressionStream`, a stored entry over 20 MB. |
| T5-4 | No test for `%PDF` beyond the first 1024 bytes, nor for an unknown encoding label. |
| T5-6 | A sniff test comment is off by one. |
| T6-2 | Onset snapping anchors at the earliest onset; covered indirectly by the writer's scale check. |
| T6-6 | No tests for compound time such as "3+2", or for `<forward>` extending a measure. |
| T7-2 | The grace-note judgement calls are untested. |
| T9-2 | Writer tests lack a whole-rest measure and a grace note after a note. |
| T9-3 | The performance test mostly times xmldom; split it. |
| T10-1 | The local samples test: its regex also matches the tuning-from-notes notice, it picks up any `.xml`, and a missing path throws. |
| T10-2 | Weak tests: skipping a `META-INF` entry without a container, a damaged zip asserting only `ok: false`, no pass-through of reader errors. |
