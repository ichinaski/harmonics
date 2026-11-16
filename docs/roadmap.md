# Roadmap

Ideas left for later, collected from the original plan and from user and tester feedback. None of them is promised or designed yet; check [decisions.md](decisions.md) and the invariants in [architecture.md](architecture.md#invariants) before starting one.

## Composing guidance

Suggestions for the next chord in a progression, chord substitutions, voice leading between chords, and a circle of fifths view. Saving or sharing progressions from the Key tab, perhaps in the URL like the Sheet.

## Scales

More scales in the Scale finder, which today has the 7 modes, harmonic and melodic minor, the major and minor pentatonics and blues (for example the modes of melodic minor, whole tone and diminished).

## Input

A wider piano range than C3 to B4, MIDI keyboard input and a guitar fretboard. Audio analysis (pitch detection from a recording) is a much bigger step. A better piano sample set, such as the Splendid Grand Piano (public domain, but much larger).

## Sheet features

Lyrics under chords and chords aligned over lyrics; key, tempo, style and capo fields; transpose; segno, coda, D.S., D.C. and Fine; the two-bar repeat `%%` (its error already suggests `% %`); raised (superscript) extensions; keeping the user's own chord style (ø, −, Δ, mi, ma) instead of normalising; lining up a 2nd ending under the 1st; a running title on later pages; "did you mean" suggestions for unknown chords; undo in the editor beyond the browser's own.

## Quality

Gaps noticed while writing these docs: tie the bundle budget check into CI (today it's a manual look at `npm run build` output). Run the browser QA suite in CI, which needs Chrome on the runner. Compare page counts against Firefox and Safari as well as Chrome.
