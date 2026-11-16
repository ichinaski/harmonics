# Sheet format

The Sheet tab reads a song written as plain text and draws it as a chord sheet. This is the reference for the syntax (implemented in `src/sheet/parse.ts` and `src/sheet/chordSymbol.ts`) and for the song link (`src/sheet/url.ts`, `src/routes.ts`, `src/stores/sheet.svelte.ts`). The in-app guide at `#/sheet/syntax` (`src/views/SheetSyntax.svelte`) explains the same rules for users and should be kept in line with this file.

**Backward compatibility.** Songs live in people's bookmarks, shared links and `.txt` files, with no server copy. Everything in this file is a format that must keep working: a text that parsed before must give the same sheet, and a link that opened before must open the same song. Additions are fine as long as they don't change what existing text means. [Compatibility rules](#compatibility-rules) lists the specific link rules.

```
Title: Autumn Leaves
Artist: Joseph Kosma

[A]
|: Cm7 | F7 | Bbmaj7 | Ebmaj7 |
| Am7b5 | D7 | 1. Gm | % :|
| 2. Gm | Gm ||

[B]
| Am7b5 | D7 | Gm | % |
| Cm7 F7 | Bbmaj7 | Am7b5 D7 | Gm |
"Solos over AAB, then head out"

[Outro]
C Am F G
```

## Full text and header lines

A full song (a downloaded file, the link, Copy text) is the header lines, a blank line, then the body. Header lines are `Title: ...` and `Artist: ...`, in any case, with optional spaces around the colon; only those with a value are written. Reading a full text (`splitSheetText`) takes the header lines from the top, allowing blank lines between them, and drops the blank lines after them.

In the app the title and artist are two fields and the editor holds only the body. Finished `Title:` and `Artist:` lines (followed by a line break) typed at the top of the editor move into the fields. Pasting a text that starts with a header line replaces the whole song (with Undo). A header line after the first other line is an error ("header line "Title:" should be at the top"). Line numbers in issues are lines of the editor text.

## Lines

The parser reads the body line by line:

1. A blank line adds a little space before the next row (`spaceBefore`) if the section already has rows. In reflowed layouts it also ends a run of bars.
2. A header line (see above).
3. A section line, `[Name]`.
4. A section-like line, such as `Verse 1:`.
5. A line of quoted notes only: the notes go under the previous row of the section.
6. Otherwise a row of bars, or a text line (see Lyric lines).

Rows before the first section belong to an unnamed section.

## Sections

`[Name]` on its own line starts a section. Text after the closing bracket that is a parenthesis group, a count (`x4` or `×4`) or a quoted string is part of the label: `[Verse 1] (x2)` is "Verse 1 (x2)", `[Coda] "fade"` is "Coda fade". Anything else after the bracket is the section's first row: `[Intro] C G Am F`. `[]` gives an unnamed section with a warning. A `[...]` token inside a row is an error.

The label is drawn as a small box on its own line above the section's first row. When a page break falls inside a named section, the next page repeats it as "Name (cont.)".

**Section-like lines.** Three other forms are read as sections, each with a warning suggesting `[Name]`:

- `Name:` followed by a space or the end of the line (not `:|`). Chords after the colon are the section's first row: `Intro: C G Am F`.
- `(Name)` alone on the line.
- A bare name alone on the line, such as `CHORUS` or `Guitar Solo`.

The name is up to 3 words starting with a letter. It must contain a section word (any case, with `-` and apostrophes ignored, so `Pre-Chorus` matches): intro, verse, prechorus, chorus, postchorus, refrain, bridge, interlude, instrumental, solo, solos, break, breakdown, outro, coda, tag, hook, vamp, head. No word of it may read as a chord or other bar content, so `Key: G`, `Capo: 2` and `A:` are not sections (they are unknown chord errors).

## Rows and bars

Each text line is one row of the sheet. There are two bar modes per line:

- **With bar lines.** If the line has any bar line, a bar is what sits between two bar lines. Tokens before the first or after the last bar line also make a bar, unless they are only notes, which then attach to the first or last bar.
- **Without bar lines.** Each chord (or `%`, `N.C.`, invalid token) is one bar: `C Am F G` is four bars. An ending or time signature goes with the next bar. Quoted notes attach to the bar before them (or the first bar if none). Loose beat slashes are an error here ("beat slashes need bar lines around them"), but slashes written onto a chord (`C///`) stay in that chord's bar.

Bar lines need no spaces around them (`|C|D|`).

### Bar lines and repeats

| Token | Meaning |
|---|---|
| `\|` | Single bar line |
| `\|\|` | Double bar line. At the start of a row it is drawn on the left of the first bar. |
| `\|:` | Repeat start |
| `:\|` | Repeat end, optionally followed by a count: `:\| x3` (also `X3`, `×3`) |
| `\|.` | Final bar line |

Several bar lines with nothing between them mark one place: `:| |:` ends a repeat and starts the next. The strongest end sign wins (repeat end, then final, then double, then single). Two single bar lines with nothing between them are an empty bar (`| |`); `||` is a double bar line, not an empty bar.

The song's last bar always gets a final bar line, with or without `|.`, unless it ends a repeat.

A repeat count must be 2 or more (`x1` is an error). A count anywhere other than right after `:|` (`C G Am F x2`, `| C x2 |`) is ignored with a warning and makes no bar. A `|:` that is never closed is an error. A `:|` with no `|:` before it is a warning ("repeats from the start"), except on an ending. `|.` and `:|` at the start of a row, or `|:` at its end, are errors.

Characters that look like a bar line (`¦`, `│`, `｜`) outside quotes are read as `|`, with one warning per character and line. A dash between chords (`C - G`, also the en and em dash characters) is an error: "use | between bars".

### Endings

`1.`, `2.` and so on, before the first chord of the ending's first bar: `| 1. Gm | % :|`. `1.2.` is one ending for the first and second time (drawn "1., 2."), and `1.-3.` (or with an en dash) for the first to third (drawn "1.–3."). The number may be stuck to the chord: `1.Gm`.

The bracket starts at the bar with the number and runs over the next bars of the same row until a bar line other than a single one (usually the `:|`), the next ending, or the end of the row. An ending must close a repeat or come right after one; otherwise it's an error. Numbers must start at 1 and go up; an ending after a chord in the bar, or a second ending in one bar, is an error.

### Bar contents

| Content | Meaning |
|---|---|
| `Cm7 F7` | Several chords split the bar evenly, each drawn at its beat position. |
| `C / / G` | A standalone `/` adds one beat to the chord before it: 3 beats of C, 1 of G. `//` is `/ /`. |
| `C///` | Shorthand for `C / / /`. Works with slash chords too: `C/E/` is C/E plus one beat. |
| `/ / G7 /` | Slashes at the start of a bar continue the chord from the previous bar. Error if there is no chord before. |
| `C/E` | A slash chord, not a beat. |
| `%` | Repeats the previous bar. Must be alone in its bar, and not in the first bar of the song. `%%` is an error that suggests `% %`. |
| `N.C.` | No chord. Also `NC`, `N.C`, `NC.`, any case. |
| `\| \|` | An empty bar. A bar with only a time signature, ending or notes is also empty. |

### Time signatures

A token like `3/4` or `6/8` at the start of a bar (before the chords; an ending may come before or after it). The top number is 1 to 32 and the bottom one of 1, 2, 4, 8, 16, 32; anything else is an "unknown time signature" error. It is drawn where it's written, before a repeat-start sign. There is no default time signature and nothing is drawn without one. A time signature after a chord, or a second one in a bar, is an error.

### Notes

Text in double quotes. On its own line it goes under the previous row of the section (or starts a notes-only row if the section has no rows yet). Inside a bar, after a chord or anywhere in the bar, it's attached to that bar: `| C "rit." |`. An unclosed quote is an error and ends at the next bar line or the end of the line, so the bars after it are kept.

### Lyric lines

A line without bar lines that has 3 or more words (quoted notes don't count) and where more than half of the words can't be read as chords or other bar content is treated as text: it's shown as a note under the previous row, with a warning ("Line 3 is shown as a note because it looks like lyrics"). The individual unknown words on that line get no errors. Putting the line in quotes makes it a plain note with no warning. This makes pasted chords-over-lyrics charts come out usable.

## Chord symbols

A chord token is read in two steps (`readChordSymbol`):

1. The app's chord parser (`parseChord` in `src/theory/chords.ts`), which knows the chord table. It accepts `maj`, `M`, `Δ` or `^` for major, `m`, `min` or `-` for minor, `°`, `o` or `dim`, `ø`, `h` or `m7b5`, `+` or `aug`, `C2` as Csus2, the table's aliases (`maj6`, `7sus`, `69`, `alt` and so on), and a bass after the last `/`. `6/9` and `m6/9` are chord types first, so `C6/9/E` is C6/9 over E. Case matters (`M` is major, `m` minor), but this parser also accepts a lowercase root (`am` is Am).
2. If the table doesn't know it, the Sheet grammar, so any well-formed symbol is valid:
   - root: `A` to `G`, then optionally `#`, `♯`, `b` or `♭`;
   - quality: `maj`, `Maj`, `MAJ`, `ma`, `M`, `Δ`, `△`, `^` (major), `min`, `mi`, `m`, `-` (minor), `dim`, `°`, `o`, `aug`, `+`, `ø`, `h`; a minor marker followed by a major one needs a number (`CmMaj7`, `C-Δ9`);
   - number: `6`, `7`, `9`, `11`, `13`, `6/9` or `69`; `C7+` and `C9+` mean a raised 5th;
   - any number of alterations and additions: `b`, `♭`, `-`, `#`, `♯` or `+` with 5, 6, 9, 11 or 13; `add2`, `add4`, `add9`, `add11`, `add13`; `alt`; `sus`, `sus2`, `sus4`;
   - the same in parentheses, separated by commas, plus plain `9`, `11`, `13` and `maj7` to `maj13` inside them: `C7(#5,#9)`, `Cm9(11)`, `Cm(maj7)`;
   - optionally `/` and a bass note.

   The normalised symbol is looked up in the table again, so `Cmi7` is the table's Cm7 and `Am7-5` its Am7♭5.

Parentheses must balance (`Bb7(b9` is an error). Anything else is an "unknown chord" error (`Cmaj8`, `C/H`, words).

**Display.** Chords are drawn in app style with real ♭ and ♯. Chords the table knows use its names (`C^` shows as Cmaj7, `Bh7` as Bm7♭5, `Ao7` as A°7, `C+` as Caug, `CmMaj7` as Cm(maj7)). Others are written with the same normalising (`C7b9b13` shows as C7♭9♭13). The spelling of note names is kept as typed: `A#` stays A♯, never B♭.

## Errors and warnings

Issues never stop the parse or block printing. A token that can't be read stays in its bar as typed (an invalid item) and prints as typed. Each issue has a line, column, the token and a message, and identical messages on one line are merged into one with a count ("(3 times)").

**Errors** are things that won't print as intended: unknown chords and time signatures, misplaced endings, time signatures, `%`, header lines and bar lines, unclosed repeats and quotes, endings outside a repeat, `/` with no chord before it, dashes as bar lines, `%%`, unbalanced parentheses, a repeat count under 2, a stray `:`. On screen they're red; Print / PDF asks first while there are any.

**Warnings**, called "notes" in the app, are things read in a way the user may not have meant: lyric lines, section-like lines, an empty section name, lookalike bar lines, a stray repeat count, a `:|` without `|:`. They are amber and print as shown.

## Layout settings

**Bars per row** is `typed` (As typed, the default), 4, 6 or 8. As typed keeps each text line as a row; the grid has as many equal columns as the longest row, from 4 to 8, and a longer row wraps onto continuation lines that stay together on a page. With 4, 6 or 8 each section's consecutive rows are joined and cut into rows of that many bars. A run ends at a blank line or an own-line note (which stays under the run's last row) and never crosses a section.

**Fit to** is off (0, the default), 1 or 2 pages. The sheet is drawn at one scale for the whole song, from 60% to 140%: with Fit to off, 100% or less if the busiest bar needs it; with Fit to on, the largest scale at which it prints on that many pages on both A4 and Letter, never above the busiest bar's limit. A bar too busy to fit even at 60% stacks its chords at the half bar, and the page count line says which text line it's on.

## The song link

```
#/sheet?s=<version>.<data>&b=<bars per row>&f=<fit pages>
```

- `s` is the full text (header lines plus body), UTF-8, as base64url without padding. Version `1.` is compressed with `CompressionStream('deflate-raw')`; version `0.` is uncompressed, used when the browser has no `CompressionStream` and for the quick write when the page is left.
- `b` is `4`, `6` or `8`, written only when Bars per row isn't As typed.
- `f` is `1` or `2`, written only when Fit to is on.
- An empty song is a bare `#/sheet`.

Writing: the address bar is updated about 500 ms after the last edit with `history.replaceState` (no history entries), and only while the editor is shown. On `pagehide` and `visibilitychange` (hidden), a pending update is written at once in the `0.` form. Copy link builds the link from the current song and layout at the click, not from the address bar.

Reading, on load and on `hashchange` (`SheetStore.loadFromHash`):

- A link with `s` loads that song, with `b` and `f` from the link, or the defaults when they're missing. They are not saved as the remembered layout.
- A damaged or unknown-version `s` shows an error and keeps the current song. A `1.` link in a browser without `DecompressionStream` shows an error too.
- A bare `#/sheet` never loads a song by itself. If this visit already has a song in memory (the tab link), it's kept and put back in the address bar. On a new visit the sheet starts empty with the remembered layout, and if a last song is stored, the empty state offers "Continue last song: <title>". Continuing loads it with its own layout from `harmonics.sheet.lastSongLayout`.
- If typing started while a link was being decoded, the typing wins.

### Last song and the quick-reload record

The last edited non-empty song is kept in localStorage (`harmonics.sheet.lastSong`), so it can be continued on a later visit. It's one song, not a library. Emptying the song or pressing New doesn't remove it; only saving another non-empty song replaces it. A song opened from a link isn't saved until it's edited.

Chrome reloads the address the page had before `pagehide` and ignores a `replaceState` made then, so the last keystrokes before a quick reload may not be in the reloaded link. To cover that, the song is saved together with the `s` value of the link a reload would open (`harmonics.sheet.lastSongLink`). When a link's `s` equals that record, the newer local copy is loaded instead of the link's data. Emptying the song clears the record.

### Compatibility rules

These must keep working:

- `s` values with version `0.` and `1.`, encoded as above. A new encoding needs a new version number; the decoder must keep reading the old ones.
- Links without `b` or `f` open As typed with Fit to off. Older links' `b=4`, `6` or `8` (which used to wrap at that many bars) open with rows reflowed to that many.
- Links with `z=s|m|l` (a text size control that was removed) open normally; `z` is ignored and not written again. The address bar keeps it until the next edit.
- `b=typed` and `f=0` are accepted when reading, though never written.
- The query is kept only on `#/sheet`; any other route drops it. `#/voicings` and `#/diatonic` still redirect.
- `.txt` files and pasted texts with `Title:` and `Artist:` header lines.
- The syntax itself: every rule above.
