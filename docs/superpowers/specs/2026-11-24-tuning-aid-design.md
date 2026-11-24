# Tuning aid and pitch standard: design

## Intent

The player tunes a real lute by ear from the app. Each open course of the selected lute tuning can be tapped, and the app plays that course's note. Lutenists tune to different pitch standards, so each instrument side has its own reference pitch (A = 440, 415, 392 or any other value). Every sound on that side uses that standard, which also lets the player compare how a piece sounds at different standards. The aid is mainly for the lute. The guitar side gets the same aid and its own standard.

## Goals

- **Tune… panel:** a **Tune…** button on each side opens a panel with one large button per open course or string.
  - Tapping a button plays that course's main note, which rings for about 5 seconds.
  - The button stays lit while its note rings.
- **Lute panel layout:**
  - The courses are in two groups, the fretted courses and the diapasons.
  - Each group has its label on a line above its buttons, which leaves the full width for the buttons.
  - Within each group, courses run from 1 upwards.
- **Guitar panel layout:** one group of strings, 1 to 6. The guitar has no diapasons.
- **Pitch setting:** each side's settings bar gets a **Pitch** control next to **Edit tuning…**.
  - It is a drop-down with "A = 440", "A = 415", "A = 392" and "Other…".
  - "Other…" shows a number box in Hz.
- **Scope of the standard:** the lute standard applies to every lute sound (tuning aid, lute tab playback, lute chord boxes). The guitar standard applies to every guitar sound.
- **Storage:** each standard is remembered on the device, for all pieces. It is not saved in a piece.

## Non-goals

- Octave strings: only each course's main note is played.
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

## My calls (correct any of these)

- **Saved per device:** each standard is remembered per device under its own local-storage key, separate from pieces. Backups of pieces don't include it.
- **Other… box:** it accepts 380–480 Hz, which covers the historical standards in use. Anything outside that range, or not a number, is rejected and the previous value is kept.
- **Same sound:** the tuning note uses the same plucked-string sound as playback. It is tuned to the standard and made to ring audibly for about 5 seconds (a longer, slower-decaying pluck than tab notes). Tab and chord notes keep their current length.
- **Tapping:**
  - Tapping a course stops whatever is sounding, including tab playback, and plays that course alone.
  - Tapping the ringing course again replays it.
  - Only one tuning note sounds at a time.
- **Changing the standard during playback:** the new standard applies from the next Play. The notes already scheduled don't retune.
- **Guitar capo:** the guitar tuning aid plays the open strings without the capo, because you tune before putting the capo on.
- **Pitch spelling:** the panel spells pitches the same way the tuning line does (e.g. "E♭2").

## Left to the builder

- How the standard reaches the player: a reference-pitch argument on each play call, or a detune on each sound. Either way, cached sounds must not mix standards.
- Panel styling, within the existing look.
- Test IDs.

## Testing

- **Unit tests:**
  - frequency from MIDI and reference pitch;
  - pitch-standard reading, writing and validation, including bad stored values;
  - the panel groups and labels for 6-, 8- and 13-course lutes and for guitar;
  - the player using the side's standard.
- **Browser test:**
  - open **Tune…**, tap a course and see its button lit;
  - choose "Other…", enter a value and see it remembered after a reload.
