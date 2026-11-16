# Architecture

Harmonics is a single page app with no backend. `src/main.ts` mounts `App.svelte`, which renders the header, the tab views and the footer. Logic lives in plain TypeScript modules (`src/theory/`, `src/sheet/`, `src/audio/`) that Svelte components call. State that outlives a component lives in rune-based stores in `src/stores/`.

## Module map

**`src/theory/`** is the music theory engine. `index.ts` is its public API; views import from `../theory`.

| File | What it holds |
|---|---|
| `notes.ts` | `Note` (letter plus accidental), pitch classes, pitch class sets (12-bit masks), parsing and formatting, default spelling |
| `intervals.ts` | Interval names by degree (`b3`, `#11`), spelling a note at an interval from a root |
| `chords.ts` | The chord type table (`CHORD_TYPES`, common and extended tiers), building, naming and parsing chords, readable spelling |
| `scales.ts` | Modes and other scales, key tonic spelling, key signatures, spelling a pitch class in a key |
| `chordFinder.ts` | Notes to scored chord matches (Find chord), alternative names |
| `keyFinder.ts` | Progression to ranked keys, roman numerals, per-chord explanations |
| `diatonic.ts` | Degree chords of a key, functions, characteristic chords, secondary dominants, borrowed chords (Harmonize) |
| `scaleFinder.ts` | Melody notes to matching scales, grouped by parent scale |
| `voicings.ts` | The voicing with the bass at the bottom, inversion names, Chord notes details |

**`src/sheet/`** is the Sheet pipeline, also plain TypeScript: text goes through `parse.ts` into the `Song` model of `model.ts`, then `render.ts` and `fit.ts` work out the layout, and Svelte components draw it.

| File | What it holds |
|---|---|
| `text.ts` | Header lines (`Title:`, `Artist:`), splitting and composing the full text, download file names |
| `chordSymbol.ts` | The Sheet's chord grammar, wider than the chord table |
| `parse.ts` | `parseSheet(text)`: song plus issues (errors and warnings) |
| `model.ts` | Song, section, row, bar and issue types, `formatSheetIssue` |
| `render.ts` | Bars per row and reflow (`sheetRows`), the bar grid, width estimates, the busiest bar's scale limit (`barsScaleLimit`), stacking as a last resort, screen reader text |
| `fit.ts` | Print width and page heights, `paginate`, `findFitScale` (Fit to), the page count text |
| `url.ts` | Encoding the song for the link (`1.` deflate-raw, `0.` plain) |
| `example.ts` | The Load example song |

The drawing happens in `components/SheetPreview.svelte` (the sheet), `SheetBar.svelte` (one bar) and `SheetPageMeasure.svelte` (an invisible copy at print width that measures pages and the scale).

**`src/audio/`**: `engine.ts` (instrument choice, playback, scheduling, iOS handling), `synth.ts` (Web Audio synth), `sampler.ts` (smplr wrapper), `sampleSets.ts` (which samples exist, shared with `scripts/fetch-samples.ts`) and `playbackNotes.ts` (scale and scale arpeggio notes; chords are voiced by `theory/voicings.ts`).

**`src/stores/`**:

- `session.svelte.ts`: in-memory state per tool (selected notes, filters, progression, Harmonize key, Chords side, Sheet pane and zoom), plus `addToProgression` and `openInHarmonize`.
- `settings.svelte.ts`: piano key sounds and instrument, kept in localStorage and mirrored into the audio engine.
- `sheet.svelte.ts`: the Sheet's song, layout, link, last song and Undo. It is imported only by the lazy Sheet chunk.
- `sheetLink.svelte.ts`: the Sheet tab's link (`#/sheet?s=...`), kept in the main bundle so the header can show it before the Sheet chunk loads.

**`src/components/`** holds shared UI: `Piano`, `PitchClassPicker`, `NoteInput` (piano or note names), `ChordPicker` (root, quality, bass rows and a text box), `ChordCard` (every chord in the app, `full` or `compact`), `ChordChip`, `ScaleCard`, `PlayButtons`, `KeySelect`, `SoundControls` (instrument selector), `KeySoundsToggle`, `AddToProgression`, the About footer and dialog, and the sheet components above.

**`src/views/`** has one component per page: `Chords.svelte` (switches between `ChordFinder.svelte` and `ChordNotes.svelte`), `KeyFinder.svelte`, `Harmonize.svelte`, `ScaleFinder.svelte`, `Sheet.svelte` (editor) and `SheetSyntax.svelte` (syntax guide).

**`src/routes.ts`** maps hashes to routes. **`src/App.svelte`** is the header with tabs and the instrument selector, the router, the lazy loading of the Sheet pages and the footer.

## Data flow per tab

**Find chord.** `NoteInput` gives MIDI notes; the view turns them into pitch classes and calls `findChords` with the bass (pinned, or the lowest note in piano mode), root and family filters, the Extended toggle, the key and the match mode. With fewer than 2 notes but a root and family set it shows `chordsForRootAndFamily` instead. Each match becomes a `ChordCard`. Inputs are written back to `session.chordFinder`.

**Chord notes.** `ChordPicker` sets `session.chordNotes`; the view shows `chordNoteDetails(chord)` (notes bottom to top with intervals, the inversion tag, alternative names) in one full `ChordCard`. Invalid input clears the card.

**Key.** `ChordPicker` appends chords to the progression (also filled by Add to progression from the Chords tab). `findKeys(progression, { modes })` ranks every key; each result shows numerals and, under Details, compact cards with explanations. Play progression calls `playProgression` and highlights the playing chip.

**Harmonize.** `KeySelect` picks a tonic and mode, stored in `session.harmonizeKey` (also set by Open in Harmonize from Scales). `diatonicChords(key)` gives degree triads and 7ths, functions, secondary dominants and borrowed chords.

**Scales.** Selected notes go to `findScaleGroups` (no tonic) or `findScales` (with a tonic). Mode results link to Harmonize with `openInHarmonize`.

**Sheet.** The editor writes to the sheet store (`setTitle`, `setArtist`, `setBody`). The store's `sheet` is `parseSheet(body)` with the title and artist from the fields. `SheetPageMeasure` lays out a hidden copy at print width about 300 ms after the song stops changing (at once for layout changes and before printing), counts pages on A4 and Letter with `paginate`, and picks the scale with `findFitScale` and `barsScaleLimit`. `SheetPreview` draws the song at that scale with the page breaks, and the browser prints it. The store also updates the link and localStorage (see State).

## Routing

Routes are hashes, so GitHub Pages needs no server configuration: `#/chords`, `#/chords/notes`, `#/key`, `#/harmonize`, `#/scales`, `#/sheet` and `#/sheet/syntax`. `resolveRoute` strips the leading `#/`, a trailing slash and the query. The first version's `#/voicings` and `#/diatonic` redirect to `#/chords/notes` and `#/harmonize`; empty and unknown hashes go to `#/chords`. `App.svelte` replaces a non-canonical hash with `history.replaceState`.

Only the Sheet editor keeps a query (`#/sheet?s=...&b=...&f=...`); `canonicalHash` drops it on every other route. The Chords tab link goes back to the side shown last, and the Sheet tab link is `sheetLink.hash`, so it brings the current song back even from the syntax guide.

## State

Each tool's inputs live in the in-memory `session` store, so a tab keeps its state when you switch away and back, and cross-tab links just set a value and change the hash. Nothing in `session` is persisted, and only the Sheet puts state in the URL.

localStorage holds:

| Key | Value |
|---|---|
| `harmonics.settings` | JSON `{ keySounds, instrument }`. Unknown values fall back to the defaults; the first version's `sound` field is ignored. |
| `harmonics.sheet.lastSong` | The last edited non-empty song, as full text with header lines. |
| `harmonics.sheet.lastSongLink` | The `s` value of the link a reload would open for that song (the quick-reload record). |
| `harmonics.sheet.lastSongLayout` | The last song's own layout, `<bars per row>,<fit pages>`, for example `typed,0` or `6,1`. |
| `harmonics.sheet.barsPerRow` | The remembered Bars per row: `typed`, `4`, `6` or `8`. |
| `harmonics.sheet.fitPages` | The remembered Fit to: `0`, `1` or `2`. |

Storage failures (private mode, quota) are caught and ignored; the song is still in the URL. A text size key from older versions may still be in browsers; it is no longer read.

The Sheet's link, start state and the quick-reload record are described in [sheet-format.md](sheet-format.md#the-song-link).

## Lazy loading and the bundle budget

`App.svelte` loads `views/Sheet.svelte` and `views/SheetSyntax.svelte` with dynamic `import()`, so the sheet parser, store and renderer are separate chunks. smplr is imported dynamically in `sampler.ts` and downloads with the first sampled instrument. Samples are fetched per instrument, only when it's selected.

The budget: the main bundle (the entry JS and CSS plus the two Inter woff2 files) stays under 150 KB gzipped, and never includes samples. Nothing enforces it automatically; check the gzip sizes `npm run build` prints. At the time of writing the entry JS is about 54 KB gzipped, the CSS about 9 KB and the fonts about 47 KB.

## Audio engine

`engine.ts` creates the `AudioContext` lazily in `unlockAudio`, which every play call runs, so the first user gesture unlocks audio. The graph is instruments, then a master gain, then a `DynamicsCompressor` used as a limiter. Instruments implement `InstrumentBackend` (`start`, `stopAll`).

The **synth** (`synth.ts`) is a triangle plus a quieter sine an octave up per voice, through an ADSR envelope, with up to 32 voices. It needs no download, is the default instrument and stands in while a sampled instrument loads or after it fails.

The **sampled instruments** (piano, electric guitar, acoustic guitar, bass) load the first time they're needed with audio unlocked. `sampler.ts` fetches and decodes the mp3s itself, so any failure rejects the load, and passes them to smplr's `Sampler` with a per-instrument gain (`SAMPLER_GAIN`) that matches the synth's loudness. Sample URLs are built from `import.meta.env.BASE_URL`. A failed instrument isn't refetched on every play; selecting it again (or Retry) loads it again. The selector shows a spinner while loading. Guitars strum chords (15 ms between notes), the others play block chords, and the bass plays an octave lower (`transpose: -12`).

**iOS.** Web Audio is muted by the ringer switch on iPhone unless the page plays as media. The engine sets `navigator.audioSession.type = 'playback'` where it exists, and otherwise plays a tiny silent WAV through an `<audio>` element on the first unlock. It resumes the context when it's `suspended` or `interrupted` (Safari, after a call) and the page is visible. `playProgression` unlocks audio during the click, since its chords play from timers.

**Key sounds.** Play and Arpeggio buttons always play. Tapping a piano key plays only when `settings.keySounds` is on (the speaker toggle on the piano, shared by every piano). The Harmonize scale piano is play-only, so its keys always play.

## Invariants

These are the rules a change must not break. Most have tests; the ones that need a browser are covered by `npm run qa`.

1. **Theory and sheet code have no UI imports.** `src/theory/` imports only itself; `src/sheet/` imports only itself and `src/theory/`. No Svelte, DOM or store imports, so both can be tested in Node.
2. **Notes are spelled by interval.** Notes are letter plus accidental, never bare pitch numbers. Chord tones are spelled from the root by interval (a major 3rd above C♯ is E♯) and 7-note scales use each letter once.
3. **No double accidentals in names.** Chord names and bass notes never use double accidentals, and avoid E♯, B♯, F♭ and C♭ unless the key's scale has that note (`readableNote`, `chordRootSpelling`, `spellChordBass`). Tensions that would need a double accidental, or a sharp or flat on a white key, are respelled in note lists (E7alt shows G for the ♯9). Chord tones up to the 7th keep their letters (C°7 lists B𝄫). Key tonics never produce theoretical keys. `tests/spellingSweep.test.ts` checks this across the vocabulary.
4. **Roman numerals are relative to the major scale** in every mode, so a chord always has the same numeral (C Dorian: i, ii, ♭III, IV, v, vi°, ♭VII).
5. **Scores go down the list.** Chord and key results are sorted strictly by score.
6. **The preview is the print layout scaled.** The sheet is laid out at the printable width of A4 (`PRINT_WIDTH_PX`, 182 mm) and only scaled as a whole on screen, so line breaks, sizes and stacking match the PDF. On-screen marks (invalid tokens, page break lines, tags) are never printed.
7. **One text size per sheet, chosen by the app.** Every chord and label on a sheet uses one scale: the smaller of Fit to's scale (or 100%) and the busiest bar's limit, between 60% and 140%. Chords are never shrunk per bar or truncated; only a bar that can't fit even at 60% stacks.
8. **The page count must match the printed PDF.** The count, the page breaks and Fit to come from the measuring copy with the same rules the print CSS applies (14 mm margins in `@page` and `PRINT_MARGIN_MM`, rows never split, A4 told from Letter by `A4_MIN_PAGE_HEIGHT_PX`). If you change print CSS, spacing or `paginate`, run `npm run qa` (the `page-counts` check compares with Chrome's PDFs).
9. **Old sheet links must keep opening.** Version `0.` and `1.` song data, links with `z=`, links without `b` or `f`, and the old `#/voicings` and `#/diatonic` routes. See the compatibility rules in [sheet-format.md](sheet-format.md#compatibility-rules).
10. **Sheet syntax stays backward compatible.** A text that parsed before must parse to the same song; new syntax must not change the meaning of old text.
11. **The song is never lost.** The address bar follows the song (debounced 500 ms, `replaceState`), a pending update is written synchronously on `pagehide` and `visibilitychange`, and New, Load example, Open file and a pasted song can be undone.
12. **Asset URLs are base-path safe.** In TypeScript, build URLs from `import.meta.env.BASE_URL`, never `/samples/...`. In CSS, root-absolute `url('/fonts/...')` is fine because Vite prefixes it with the base. The app runs under `/harmonics/` in production and `/` in dev.
13. **The main bundle stays under 150 KB gzipped** (JS, CSS, fonts), with the Sheet pages and smplr in lazy chunks and no samples.
14. **Audio needs a gesture and always has a fallback.** Nothing creates the `AudioContext` at import time; the synth plays whenever a sampled instrument isn't ready.
15. **Card bodies are inert.** Chord and scale cards only play from their buttons, so scrolling never makes a sound. Progression chips are the one exception: they play on tap.
16. **Color is never the only signal.** Quality colors always come with the quality name, and the theme tokens in `styles/tokens.css` meet WCAG AA in light and dark (`tests/tokens.test.ts`).
