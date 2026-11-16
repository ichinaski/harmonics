# Decisions

The main design decisions behind Harmonics and why they were made. Each entry describes what is true in the code today.

## Static app, no backend

Harmonics is plain static files on GitHub Pages: no accounts, no server, no database. It costs nothing to host, can't leak user data and keeps working as long as Pages does. Routes are hashes (`#/key`) so Pages needs no rewrite rules.

The tools keep their inputs in memory only (`stores/session.svelte.ts`), so switching tabs keeps your work but a reload starts fresh. The Sheet is the exception, because a song is real work: it lives in the URL.

## The song lives in the URL

A Sheet song is compressed into the hash (`#/sheet?s=1.<data>`), so a bookmark is a saved song, sharing is copying the link, and a reload never loses work. The `1.` and `0.` prefixes version the encoding so it can change without breaking links. localStorage adds one "last song" as a safety net, not a library. The format and its compatibility rules are in [sheet-format.md](sheet-format.md).

## Print through the browser, no PDF library

Print / PDF calls `window.print()`, and "Save as PDF" comes from the browser's print dialog. A PDF library would add a lot of weight and a second layout engine that could disagree with the preview. Instead the preview is the print layout scaled down, and print CSS (`@page` rules in `styles/app.css`) applies 14 mm margins, the page breaks the app computed and a "1 / 3" footer on multi-page sheets. Empty `@page` margin boxes drop Chrome's own header and footer (Chrome 131 and later); Firefox and Safari print theirs unless turned off in the dialog. The document title is set to the song's title and artist while printing, so the PDF gets a sensible file name.

Page breaks are computed by the app, not left to the browser, so the page count shown before printing is right and sections break cleanly. The measurement is checked against Chrome's PDFs by the `page-counts` QA check.

## Sampled instruments with smplr and self-hosted FluidR3 samples

The synth needs no download, but chords sound much better on a real piano or guitar. The piano, electric guitar, acoustic guitar and bass are FluidR3_GM samples (CC BY 3.0) played with smplr's `Sampler`. smplr's default kit is MusyngKite (CC BY-SA), so FluidR3 is chosen explicitly. The samples are served from `public/samples/<folder>/` instead of a third-party CDN, so the app doesn't depend on another site staying up.

Only one sample every minor third is kept (C, E♭, G♭ and A of each octave plus the top C, 17 files per instrument); smplr pitch-shifts the notes in between by at most a semitone, which is inaudible for short chords. The files are the 64 kb/s mp3s from gleitz/midi-js-soundfonts, unmodified. Piano, guitars and bass cover C2 to C6 (the bass C1 to C5, since it plays an octave lower), about 300 to 420 KB per instrument and 1.3 MB in total, under the 1 MB per instrument budget that `scripts/fetch-samples.ts` enforces. The sets are defined once in `src/audio/sampleSets.ts`, shared by the app and the fetch script.

`Sampler` with one mp3 per note was chosen over smplr's `Soundfont` loader. `Soundfont` loads one MIDI.js file per instrument (base64 data URLs), which would mean regenerating JS files, decoding base64 on the main thread and one big request that can't be partly cached. Measured for the piano: the full MIDI.js file is 1.8 MB gzipped, every semitone C2 to C6 as mp3 is 1.17 MB, and every minor third is 425 KB in 17 requests, which is fine over HTTP/2 and cached file by file.

A few details matter. `sampler.ts` fetches and decodes the mp3s itself, because smplr only logs a warning for a missing file and a failed load must reject so the synth can take over. smplr 1.2.0 copies `detune`, `decayTime` and `lpfCutoffHz` into its defaults even when undefined, which gives a `NaN` detune on the first note, so they are always passed explicitly. `Sampler` adds no gain of its own (`Soundfont` adds 5x), so each instrument has a measured gain (`SAMPLER_GAIN`) that matches the synth's loudness. smplr itself is a lazy chunk (about 25 KB gzipped). An instrument downloads the first time it's selected with audio unlocked; until then, and if it fails, the synth plays.

## No global sound switch

There is no mute toggle. Play and Arpeggio buttons always play, since pressing one means you want to hear it. Only tapping piano keys can be silenced, with a speaker toggle on the piano (one setting for every piano), because tapping keys is also how you select notes. Card bodies do nothing when tapped, so scrolling a list never makes a sound.

## Chord finder: groups and scoring

Results come in three groups: exact (the chord has exactly the selected notes), exact with one common omission (the 5th of 7th chords and up, the 9th of 13ths, the root of rootless voicings when 4 or more notes include the 3rd and 7th), and contains (the chord has every selected note plus others). The limits on omissions stop 3 notes from matching dozens of rootless chords. 13th chords are defined without the 11th, as in practice. When a bass is set and isn't a chord tone, the other notes are also matched and named as a slash chord (F/G), with a penalty.

The score (`CHORD_SCORE_WEIGHTS`, 0 to 100) starts from the group (exact 40, omitted 30, contains 15), so groups stay in order, and is mostly about how many selected notes are core tones of the chord (the 3rd counts most, then the root, the 5th, the suspended note). That puts C ahead of C6, Cmaj7 and Am7 for C E G. Smaller terms reward the share of the chord you selected, the bass (root, then another chord tone, a penalty outside the chord) and fitting the key, and penalise missing extensions and complexity. Results are sorted strictly by score. The weights are tuned against fixed cases in `tests/chordFinder.test.ts`; change the weights only together with those cases.

Chords with the same notes (C6 and Am7, the four names of a dim7) collapse into one card with alternative names. The bass decides the main name, then the lowest selected note (B D F A♭ with B lowest is B°7), then the simpler name. Names whose bass isn't one of their own chord tones are left out (G7/F is not also listed as G/F).

## Key finder: fit plus tonic emphasis

Each candidate key (12 tonics, major and minor, plus the other modes with the Modes toggle) gets a fit score: each chord scores 1 if its root, 3rd, 5th and 7th are in the scale (tensions like ♭9 don't count against it), 0.5 as a secondary dominant (0.75 when it resolves to its target), 0.25 if borrowed from a parallel mode, else 0. Minor keys also accept the harmonic minor V, V7, vii° and vii°7.

Fit alone can't tell C major from A minor or D Dorian, since they share notes, so 35% of the score is tonic emphasis: how often the tonic chord appears, whether it opens or closes the progression, and cadences that land on it (V, IV or ♭VII to I). A chord over the tonic in the bass counts half as a tonic (a pedal, so `Cmaj7 D/C` reads as C Lydian). Church modes get a small penalty because they are rarer. A slash chord whose bass isn't a chord tone is also read as the chord on its bass when that is an exact chord (F/G as G9sus4), and whichever reading fits the key better is used, so F/G before C is a V. All keys are ranked, never filtered out. The weights (`KEY_SCORE_WEIGHTS`) are tuned against `tests/keyFinder.test.ts`.

## Roman numerals relative to the major scale

Numerals are measured against the major scale of the tonic in every mode: C Dorian is i, ii, ♭III, IV, v, vi°, ♭VII. So a chord always has the same numeral whatever the mode, and borrowed chords from different modes compare directly. Function labels (tonic, subdominant, dominant) are shown only for major and minor, where they're standard; the other modes highlight their characteristic chord instead (Dorian IV, Phrygian ♭II, Lydian II, Mixolydian ♭VII, Locrian ♭V).

## Spelling

Notes are stored spelled, and chord tones are spelled by interval from the root, so a major 3rd above D♭ is F and above C♯ is E♯. Without context, black-key roots use C♯, E♭, F♯, A♭, B♭, the usual choices in pop and jazz charts. Key tonics use the spelling whose signature has the fewest accidentals for that mode (G♯ minor, not A♭ minor; D♭ major, not C♯ major), never a theoretical key, with ties going to sharps for major-type modes and flats for minor-type ones. When a key is set, chord roots follow it.

User testing showed that correct-but-unusual spellings read as bugs, so names are kept readable: chord names and basses never use double accidentals and avoid E♯, B♯, F♭ and C♭ unless the key's scale has them, and tensions that would need a double accidental are respelled (E7alt lists G, not F𝄪). Chord tones up to the 7th keep their letters (C°7 lists B𝄫), since that is what the chord is. On the Sheet, the user's own spelling is kept as typed.

## Harmonize: secondary dominants and borrowed chords

Secondary dominants are the V7 of each major or minor degree chord; diminished chords don't get one, since they aren't stable targets. The tonic's own V7 is included only when the mode lacks it: from harmonic minor in Aeolian, Dorian and Phrygian, and from the major scale in Lydian and Mixolydian. Locrian's diminished tonic gets none.

Borrowed chords come from the parallel modes. By default only the most common sources show, to keep the page short: Aeolian and Mixolydian for major-type modes, Ionian and Dorian for minor-type ones (a mode never borrows from itself, so the next closest takes its place). The other modes are behind "More sources". These cards carry a small "secondary" or "borrowed" tag instead of being dimmed.

## One chord card everywhere

Every chord in the app is a `ChordCard` with the same layout, in a full size (Find chord, Chord notes) and a compact one (Harmonize, Key details). Play and Arpeggio buttons shrink to icons in narrow cards using container queries, keeping their full accessible names. Inversions come only from the bass note (set in Find chord, the picker's Bass row or typed as `C/E`), with a read-only tag naming them; the first version's extra voicing types (drop 2, shell, rootless and so on) were removed as noise.

## Undo instead of confirm

New, Load example, Open file and pasting a full song act at once and show an Undo toast for about 6 seconds (paused while hovered or focused). Confirmation dialogs interrupt every time to protect against a rare mistake, and people learn to click through them; Undo costs nothing when you meant it. Undo restores the song, its layout, its link and the stored last song. Editing the song dismisses the toast, so Undo can never throw away typing. The one question left is printing a sheet with errors, because a printout can't be undone.

## The app picks the sheet's text size

There is no text size control. Testers found mixed sizes ugly (busy bars shrank on their own) and a size control that did nothing with Fit to on. Now the whole sheet uses one scale chosen by the app: the largest at which every bar's chords fit side by side, combined with Fit to's scale when it's on, between 60% and 140%. Stacking chords is a last resort for a bar that can't fit even at 60%. Old links with the removed `z=` size parameter still open.

## Bars per row reflows

Bars per row is As typed (the default), 4, 6 or 8. As typed keeps the user's lines, which is what most people write. The fixed counts reflow each section's bars into rows of that many, because the first version (which only wrapped long rows) didn't help a song typed in 2-bar lines fit a page. Reflow stops at blank lines, own-line notes and sections, so the user can still force a new row.

## What the user tests changed

Three rounds of testing by simulated users (a cover-band guitarist, a jazz pianist and a music teacher) and the owner shaped the Sheet. The main changes: any well-formed chord symbol is valid, not just the chord table's; words are not chords, and lines like `Verse 1:` become sections with a hint; lyric lines become notes with a warning, so pasted charts work; `C///`, multi-number endings and lookalike bar characters are understood. Errors (red, print asks first) are separated from warnings (amber, called notes). The page count moved to the preview header and is checked against real PDFs; the app computes page breaks and repeats "(cont.)" labels; section labels sit above their rows. The song is never lost: synchronous URL writes on leaving the page, the last song in localStorage and the quick-reload record. A new visit starts with an empty sheet and offers to continue the last song instead of loading it.

On the other tabs, an earlier user test brought strict score sorting, readable spelling, the lowest selected note as the default bass in piano mode, inversion tags and numerals on Find chord results, Add to progression, and reading slash chords by their bass in the key finder.
