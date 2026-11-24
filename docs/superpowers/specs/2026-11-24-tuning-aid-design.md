# Tuning aid and pitch standard: design

## Intent

The player tunes a real lute by ear from the app. Each open course of the selected lute tuning can be tapped, and the app plays that course's note. Lutenists tune to different pitch standards, so each instrument side has its own reference pitch (A = 440, 415, 392 or any other value). Every sound on that side uses that standard, which also lets the player compare how a piece sounds at different standards. The aid is mainly for the lute. The guitar side gets the same aid and its own standard.

## Goals

- **Tune… panel:** a **Tune…** button on each side opens a panel with one large button per open course or string.
  - Tapping a button plays that course's main note, which rings for about 5 seconds.
  - The button stays lit while its note rings.
  - Each button shows the course number, the pitch name and the frequency at the side's standard, for example "6 G2 · 98.0 Hz". The frequency has one decimal place.
- **Lute panel layout:**
  - The courses are in two groups: fretted courses first, then diapasons.
  - Each group has its label on a line above its buttons, which leaves the full width for the buttons.
  - Within each group, courses run from 1 upwards. This is the opposite order to the tuning line, which lists low to high.
  - The panel opens inline below the settings bar, the same way **Edit tuning…** does, and pushes the content below it down. It has a Close button. On a phone a 13-course lute's panel is taller than the screen, and the page scrolls.
- **Guitar panel layout:** one group of strings, 1 to 6. The guitar has no diapasons.
- **Pitch accuracy:** every note, whether from the tuning aid, tab playback or a chord box, lands within 2 cents of its exact frequency at the side's standard.
- **Pitch setting:** each side's settings bar gets a **Pitch** control next to **Edit tuning…**.
  - It is a drop-down with "A = 440", "A = 415", "A = 392" and "Other…".
  - "Other…" shows a number box in Hz.
- **Scope of the standard:** the lute standard applies to every lute sound (tuning aid, lute tab playback, lute chord boxes). The guitar standard applies to every guitar sound.
- **Storage:** each standard is remembered on the device, for all pieces. It is not saved in a piece.

## Non-goals

- Octave strings: only each course's main note is played.
- **Low notes on phone speakers:** phone speakers barely reproduce the lowest diapasons (about 55–87 Hz). Users who can't hear them use headphones. No octave-up partial or other boost is added (user decision).
- Listening to the instrument through the microphone (a tuner that "hears" the string).
- A continuous drone, or a different sound from the existing plucked string.

## Anti-goals

- A tuning note that dies away before the player can tune against it.
- Sound that ignores the chosen standard anywhere on that side. A lute at 415 must never hear 440 from the lute side.

## Approaches considered

1. **Tune… panel of large buttons (chosen).** It opens like **Edit tuning…** does.
   - Its buttons are large enough to hit on a phone while holding the instrument.
   - It adds a button and a panel to each side.
2. **Tappable tuning line.** The existing "Lute tuning: 6 G2 · 5 C3 · …" text becomes the buttons.
   - It adds nothing to the screen.
   - It was rejected because the targets are small text, which is fiddly on a phone.

The pitch control sits in the settings bar, not in the panel, because it changes all sound on that side.

## Decided by the user

- Notes ring for about 5 seconds.
- Main note only.
- The pitch choices are 440, 415, 392 and a box for any other value.
- The guitar has its own standard.
- The standard applies to all playback on its side.
- The layout is option 1, with "Fretted" and "Diapasons" above their groups.
- Each button shows the frequency in Hz.
- The low diapasons get no help on phone speakers; headphones are the answer.

## My calls (correct any of these)

- **Saved per device:** each standard is remembered per device under its own local-storage key, separate from pieces. Backups of pieces don't include it.
- **Storage keys:** `g2l:pitch:lute` and `g2l:pitch:guitar`, following the existing `g2l:` key convention.
- **Without local storage:** if local storage is unavailable (private mode), the standard lasts only for the session, the same way pieces already do.
- **Other… box:**
  - It accepts 380–480 Hz with up to one decimal place, which covers the historical standards in use.
  - Anything outside that range, or not a number, is rejected and the previous value is kept.
  - When the stored value isn't 440, 415 or 392, the drop-down shows "Other…" with the value in the box.
- **Same sound:**
  - The tuning note uses the same plucked-string sound as playback, tuned to the standard.
  - It rings audibly for about 5 seconds on every course. The sound fades much faster on high notes than on low ones, so each note's fade is set from its pitch so that every course reaches the same quiet level at about 5 seconds.
  - Tab and chord notes keep their current length and fade.
- **Exact pitch:**
  - The plucked-string sound can only make certain frequencies, and its own half-sample delay adds to the error.
  - Measured, the error reaches 15 cents flat (for example A4 at A = 392 on a 44.1 kHz device). It is within 2 cents on the low courses.
  - Each sound is played very slightly faster or slower to land on the exact frequency, allowing for that half-sample delay. This also corrects existing playback.
- **One player:**
  - The app keeps its single player.
  - Every play call passes in the pitch standard of the side it comes from.
  - Stored sounds are kept per note and standard, because the guitar's A2 at 440 and the lute's A2 at 415 are different sounds.
  - Stored sounds aren't cleared when the standard changes, so notes already scheduled keep their pitch.
- **Tapping:**
  - Tapping a course stops whatever is sounding, including tab playback, and plays that course alone.
  - Tapping the ringing course again replays it.
  - Only one tuning note sounds at a time.
- **When a lit button goes out:**
  - when its note ends, as reported by the player when the sound finishes, not by a separate timer;
  - when another course is tapped;
  - when Play or a chord box starts other sound;
  - when the panel closes or the view changes. Closing the panel or changing the view also stops the note.
- **Screen awake:** while the panel is open, the screen is kept awake, where the browser supports it. Tuning takes minutes, and a phone that locks stops the sound.
- **Changing the standard during playback:** the new standard applies from the next Play. The notes already scheduled don't retune.
- **Guitar capo:** the guitar tuning aid plays the open strings without the capo, because you tune before putting the capo on.
- **Pitch spelling:** the panel spells pitches the same way the tuning line does (e.g. "E♭2").

## Left to the builder

- The exact fade target for the 5-second ring, within "clearly audible to about 5 seconds".
- Panel styling, within the existing look.
- Test IDs.

## Testing

- **Unit tests:**
  - frequency from MIDI and reference pitch;
  - pitch-standard reading, writing and validation, including bad stored values;
  - the panel groups and labels for 6-, 8- and 13-course lutes and for guitar;
  - the player using the side's standard;
  - a lute at 415: tab and chord playback on the lute side is at 415, never at 440;
  - the pitch actually produced, measured from the rendered sound, is within 2 cents at several notes, standards and sample rates (44.1 and 48 kHz);
  - every course's tuning note is still audible at about 5 seconds;
  - the lit button goes out when the note ends, on another tap, on Play and on close.
- **Browser test:**
  - open **Tune…**, tap a course and see its button lit;
  - choose "Other…", enter a value and see it remembered after a reload.
