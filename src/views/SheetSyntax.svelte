<!--
  The Sheet syntax guide (#/sheet/syntax), opened in a new tab from the
  Sheet toolbar so it can sit next to the editor. Each rule has a short
  example, its rendered result (the same SheetPreview the Sheet tab prints)
  and a Copy button.
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import SheetPreview from '../components/SheetPreview.svelte';
  import { formatSheetIssue } from '../sheet/model';
  import { parseSheet } from '../sheet/parse';
  import { barsScaleLimit } from '../sheet/render';
  import { sheetLink } from '../stores/sheetLink.svelte';

  /** The examples are laid out narrower than a printed page, so they stay readable when scaled to their box. */
  const EXAMPLE_WIDTH_PX = 520;

  interface Rule {
    id: string;
    title: string;
    /** Plain text; `backticks` mark syntax. */
    text: string;
    example?: string;
  }

  const RULES: readonly Rule[] = [
    {
      id: 'bars',
      title: 'Rows and bars',
      text: 'Each line is one row of the sheet. Put a bar line `|` between bars. All bars have the same width, so rows line up; a row longer than 8 bars carries on onto the next line (or choose 4, 6 or 8 bars per row, see Fitting the sheet).',
      example: '| C | Am | F | G |\n| Dm7 | G7 | C | C | F | G | C | C |',
    },
    {
      id: 'quick-rows',
      title: 'Rows without bar lines',
      text: 'On a line with no bar lines, each chord is one bar.',
      example: 'C Am F G',
    },
    {
      id: 'header',
      title: 'Title and artist',
      text: 'On the Sheet tab they’re the two fields above the editor. In a text file they’re the first lines, `Title:` and `Artist:`; Open file and pasting a whole song read them back.',
      example: 'Title: Blue Bossa\nArtist: Kenny Dorham\n\n| Cm7 | Fm7 | Dm7b5 | G7 |',
    },
    {
      id: 'sections',
      title: 'Sections',
      text: '`[Name]` on its own line starts a section; the name shows in a small box on its own line above the section, lined up with the bars. A blank line adds a little space between rows. Lines like `Verse 1:`, `(Chorus)` or `CHORUS` are read as sections too, with a note to write `[Verse 1]`.',
      example: '[Verse]\n| C | Am | F | G |\n\n| C | Am | F | G |\n[Chorus]\n| F | G | C | C |\n[Guitar solo]\n| Am | G | F | E7 |',
    },
    {
      id: 'bar-lines',
      title: 'Double and final bar lines',
      text: '`||` is a double bar line and `|.` a final one. The song’s last bar always gets a final bar line.',
      example: '| C | F || G | C |.',
    },
    {
      id: 'repeats',
      title: 'Repeats',
      text: '`|:` and `:|` are repeat signs. Add a count after `:|` to play it more than twice: `:| x3`.',
      example: '|: C | F | G | C :| x3',
    },
    {
      id: 'endings',
      title: 'Endings',
      text: 'Write `1.`, `2.` and so on before the first chord of each ending; `1.2.` is an ending for the first two times and `1.-3.` for the first three. The bracket runs to the next repeat sign or double bar line.',
      example: '|: C | F | 1. G | G7 :|\n| 2. G | C |.\n|: Am | 1.2. E7 :| 3. Am |.',
    },
    {
      id: 'beats',
      title: 'Several chords in a bar',
      text: 'Chords in one bar split it evenly, each on its beat. Every chord on a sheet has the same size: when a bar is crowded, the whole sheet gets smaller (down to 60%) so its chords fit side by side. Only a bar too busy even then stacks its chords onto two lines split at the half bar (four chords become 2 + 2), and the page count above the preview says which line. Chord names are never cut. A `/` on its own adds a beat to the chord before it: `C / / G` is three beats of C and one of G, and `C///` is short for `C / / /`. Slashes at the start of a bar carry on the chord from the bar before. `C/E` is still a slash chord.',
      example: '| Cm7 F7 | C / / G | C/// | / / G7 / |\n| C/E F |',
    },
    {
      id: 'contents',
      title: 'Repeat a bar, no chord, empty bar',
      text: '`%` repeats the previous bar, `N.C.` (or `NC`) means no chord, and `| |` is an empty bar.',
      example: '| C | % | N.C. | | G7 |',
    },
    {
      id: 'time',
      title: 'Time signatures',
      text: 'A time signature like `3/4` or `6/8` at the start of a bar shows where it’s written. Nothing is shown by default.',
      example: '| 4/4 C | F | 3/4 G | C |',
    },
    {
      id: 'notes',
      title: 'Notes',
      text: 'Text in double quotes. On its own line it goes under the row above; after a chord it’s attached to that bar. A line of words that aren’t chords, like lyrics, is shown as a note too, and listed as a note under the editor; put it in quotes and it isn’t listed.',
      example: '| C | F "rit." | G | C |\n"Last time: hold the C"\nC G Am F\nLet it be, let it be',
    },
    {
      id: 'chords',
      title: 'Chord symbols',
      text: 'Any chord symbol: a root, a quality (`m`, `mi`, `-`, `maj`, `ma`, `Δ`, `dim`, `aug`, `+`, `ø`, `sus`...), a number (`6`, `7`, `9`, `11`, `13`, `6/9`), alterations and additions (`b9`, `#11`, `-5`, `add9`, `alt`, also in parentheses: `7(#5,#9)`) and a bass (`/E`). Your spelling of note names is kept (`Bb` shows as B♭, `A#` as A♯, C♯ never becomes D♭); the rest is written the usual way (`Cmi7` shows as Cm7). Shortcuts: `^` for a major 7th (`C^`, `C^9`), `h` or `h7` for half-diminished, `o` or `o7` for diminished.',
      example: '| C^ | Bh7 E7b9 | Ao7 | Dm9 G13#11 |\n| Cmi7 | F7(#5,#9) | Bbmaj9#11 | Am7-5 |',
    },
    {
      id: 'mistakes',
      title: 'Mistakes',
      text: 'Anything that can’t be read is an error: it’s listed under the editor with its line, marked in red in the preview (on screen only) and printed as typed, so the sheet always prints; Print / PDF asks first while there are errors. Things read in a way you may not have meant, like a lyric line or `Verse 1:`, are amber notes that print as shown. Pick one to jump to it in the editor. Bars go between `|` signs, not dashes (`C - G`), and a count like `x2` goes right after `:|`.',
      example: '| C | Cmaj8 | G |',
    },
  ];

  const parsed = RULES.map((rule) => (rule.example ? parseSheet(rule.example) : null));
  /** Each example at 100%, or smaller if its busiest bar needs it, as on the Sheet tab. */
  const scales = parsed.map((result) => (result ? Math.min(1, barsScaleLimit(result.song, 'typed', EXAMPLE_WIDTH_PX).scale) : 1));

  const COPIED_MS = 2500;
  let copied = $state<{ id: string; ok: boolean } | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  onDestroy(() => clearTimeout(timer));

  async function copy(rule: Rule): Promise<void> {
    let ok = true;
    try {
      await navigator.clipboard.writeText(rule.example ?? '');
    } catch {
      ok = false;
    }
    copied = { id: rule.id, ok };
    clearTimeout(timer);
    timer = setTimeout(() => (copied = null), COPIED_MS);
  }

  /** `code` spans of a rule's text: odd parts are syntax. */
  function textParts(text: string): string[] {
    return text.split('`');
  }
</script>

<article class="view guide" aria-labelledby="guide-title">
  <header class="guide-head">
    <a class="back" href={sheetLink.hash}>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M10 3.5 5.5 8l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
      Back to the Sheet
    </a>
    <h1 id="guide-title" class="view-title">Sheet syntax guide</h1>
    <p class="muted">
      Type a song’s chords as plain text and the Sheet tab turns it into a chord sheet to print or save as PDF. Here’s everything it understands; copy any example
      into the editor to try it. New clears the editor for a fresh song, and Continue last song brings back the last one you edited in this browser.
    </p>
  </header>

  {#each RULES as rule, i (rule.id)}
    {@const result = parsed[i]}
    <section class="card rule" aria-labelledby="rule-{rule.id}">
      <h2 id="rule-{rule.id}" class="rule-title">{rule.title}</h2>
      <p class="rule-text">
        {#each textParts(rule.text) as part, p (p)}{#if p % 2 === 1}<code>{part}</code>{:else}{part}{/if}{/each}
      </p>
      {#if rule.example && result}
        <div class="example">
          <div class="example-source">
            <pre><code>{rule.example}</code></pre>
            <div class="copy-row">
              <button type="button" class="link-button" onclick={() => copy(rule)}>
                Copy<span class="visually-hidden"> the {rule.title.toLowerCase()} example</span>
              </button>
              <span class="copied" role="status">
                {#if copied?.id === rule.id}{copied.ok ? 'Copied' : 'Couldn’t copy'}{/if}
              </span>
            </div>
          </div>
          <div class="example-result" role="group" aria-label="Result">
            <SheetPreview song={result.song} scale={scales[i]} widthPx={EXAMPLE_WIDTH_PX} marginPx={24} titleLevel={3} />
            {#if result.issues.length > 0}
              <ul class="example-issues">
                {#each result.issues as issue, k (k)}<li>{formatSheetIssue(issue)}</li>{/each}
              </ul>
            {/if}
          </div>
        </div>
      {/if}
    </section>
  {/each}

  <section class="card rule" aria-labelledby="rule-fitting">
    <h2 id="rule-fitting" class="rule-title">Fitting the sheet</h2>
    <p class="rule-text">
      The app picks one size for the whole sheet, so every chord, bar and label is the same size: 100%, or smaller (down to 60%) when a bar is too busy for its
      chords to fit side by side. The Layout controls in the Sheet toolbar set how the sheet prints. <strong>Bars per row</strong> is
      <strong>As typed</strong> (your lines, with lines longer than 8 bars wrapping) or 4, 6 or 8, which joins and splits your lines into rows of that many bars
      within each section; a blank line or a note on its own line still starts a new row. <strong>Fit to</strong> 1 or 2 pages scales the text and spacing
      (from 60% to 140%) to the largest size that fits on that many A4 or Letter pages and still lets the busiest bar fit, so a short song also grows to fill the page. The preview
      is the printed page, with dashed lines where the pages break; pages break between sections where they can, a section that has to split repeats its name
      (“Verse (cont.)”), and a sheet that prints on more than one page gets page numbers (“1 / 3”). Above the preview you see how long the printout is (“Prints on 1 page”, “Fits on 1 page
      at 82%”), with the size whenever it isn’t 100%. Both settings are saved in the link.
    </p>
  </section>

  <section class="card rule" aria-labelledby="rule-saving">
    <h2 id="rule-saving" class="rule-title">Saving, sharing and printing</h2>
    <p class="rule-text">
      The song and its layout are kept in the page address as you type, so a bookmark or a reload keeps it, and Copy link shares it. The browser also
      remembers the last song you edited, so the plain Sheet tab link brings it back. Download text saves a <code>.txt</code> file that Open file reads back. Print / PDF, or Save as PDF in the browser’s print dialog, gives just the sheet; if your browser adds its own headers and footers, turn
      them off there.
    </p>
  </section>

  <p><a class="back" href={sheetLink.hash}>Back to the Sheet</a></p>
</article>

<style>
  .guide-head {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .back {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    align-self: flex-start;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    text-decoration: none;
  }

  .back:hover {
    text-decoration: underline;
  }

  .rule {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5);
  }

  .rule-title {
    font-size: var(--font-size-lg);
  }

  .rule-text {
    color: var(--text-muted);
    font-size: var(--font-size-sm);
    line-height: 1.55;
  }

  code {
    padding: 0 4px;
    border-radius: var(--radius-sm);
    background: var(--bg);
    color: var(--text);
    font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
    font-size: 0.9em;
  }

  .example {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
  }

  pre {
    margin: 0;
    padding: var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--surface-muted);
    box-shadow: inset 0 0 0 1px var(--divider);
    overflow-x: auto;
    line-height: 1.6;
  }

  pre code {
    padding: 0;
    background: none;
    font-size: 0.875rem;
  }

  .copy-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: var(--space-1) 0 0 calc(-1 * var(--space-2));
  }

  .copied {
    color: var(--text-muted);
    font-size: 0.8125rem;
  }

  /* The paper scales to this box's width (see SheetPreview). */
  .example-result {
    min-width: 0;
  }

  .example-issues {
    margin: var(--space-2) 0 0;
    padding-left: var(--space-4);
    color: var(--text-muted);
    font-size: 0.8125rem;
  }

  @media (min-width: 720px) {
    .example {
      grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
      align-items: start;
    }
  }
</style>
