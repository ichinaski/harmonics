<!--
  A chord sheet, drawn from a parsed song: what the Sheet tab previews and
  prints, and the rendered examples of the syntax guide. Black on white (a
  white "paper" card, also in the dark theme). Title and artist on top,
  section names as small boxes on a line of their own above their sections'
  first rows, left-aligned with the bars, and each row a grid of equal-width
  bars across the full width (sheetColumns: as typed, or 4, 6 or 8
  reflowed). Everything is sized in em of SHEET_FONT_PX times `scale`, one
  scale for the whole sheet (Fit to and the busiest bar, SheetPageMeasure),
  so every chord has the same size; only a bar too busy even at the
  smallest scale stacks its chords (barChordLines, sheet/render.ts).

  The preview is the print layout: it's laid out at `widthPx` (the printed
  page's width) and scaled down as a whole to fit its container (`fitWidth`),
  so line breaks, stacking and sizes are the same as in the PDF. With
  `pageStarts` (SheetPageMeasure) the page breaks are applied in print, per
  paper size, with the section label repeated ("Verse (cont.)") on a page
  that starts inside a section; on screen, dashed lines labelled "Page 2"
  show the breaks of `screenPaper`. `printLayout` draws the bare print
  layout (no paper, no scaling), for measuring.

  On screen only, problems are marked so they can't be missed: tokens that
  couldn't be read (SheetBar) and lines of text shown as notes get a tag.
  Valid syntax looks exactly as it prints.
-->
<script lang="ts">
  import { PRINT_MARGIN_MM, PRINT_WIDTH_PX, type PageStarts, type PaperSize } from '../sheet/fit';
  import type { Bar, Song } from '../sheet/model';
  import {
    columnWidthEm,
    SHEET_FONT_PX,
    sheetColumns,
    sheetRows,
    timeBeforeRepeatStart,
    type SheetBarsPerRow,
    type SheetRow,
  } from '../sheet/render';
  import SheetBar from './SheetBar.svelte';

  interface Props {
    song: Song;
    barsPerRow?: SheetBarsPerRow;
    /** The sheet's scale of SHEET_FONT_PX (SheetPageMeasure, or barsScaleLimit for the syntax guide). */
    scale?: number;
    /** The width the sheet is laid out at, in CSS px: the printed page's, by default. */
    widthPx?: number;
    /** The paper's margin around the sheet on screen, in CSS px (none in print). */
    marginPx?: number;
    /** On screen, scale the paper down to the container's width; otherwise it's drawn at its print size (and the container scrolls). */
    fitWidth?: boolean;
    /** The bare print layout on screen (no paper, no scaling), for measuring. */
    printLayout?: boolean;
    /** Where the printed pages start, from SheetPageMeasure. */
    pageStarts?: PageStarts | null;
    /** The paper size whose page breaks the screen shows. */
    screenPaper?: PaperSize;
    /** Heading level of the title; section names are one level below. */
    titleLevel?: 2 | 3;
    /** Show the screen-only problem marks; the Sheet tab turns them off while typing. */
    marks?: boolean;
  }

  let {
    song,
    barsPerRow = 'typed',
    scale = 1,
    widthPx = PRINT_WIDTH_PX,
    marginPx = (PRINT_MARGIN_MM * 96) / 25.4,
    fitWidth = true,
    printLayout = false,
    pageStarts = null,
    screenPaper = 'a4',
    titleLevel = 2,
    marks = true,
  }: Props = $props();

  const hasAbove = (bars: readonly Bar[]) => bars.some((b) => b.ending || b.repeatTimes);

  const columns = $derived(sheetColumns(song, barsPerRow));
  const columnEm = $derived(columnWidthEm(widthPx, SHEET_FONT_PX * scale, columns));

  /** Sections and their rows, each row numbered in the sheet (for page breaks) and each bar in the song. */
  const sections = $derived.by(() => {
    let number = 0;
    let rowNumber = 0;
    return song.sections.map((section) => {
      const rows: SheetRow[] = sheetRows(section.rows, barsPerRow, columns);
      // A section with no rows still shows its name.
      if (rows.length === 0 && section.name) rows.push({ bars: [], lines: [], notes: [], spaceBefore: false, line: section.line ?? 0 });
      return {
        section,
        rows: rows.map((row) => ({
          row,
          index: rowNumber++,
          lines: row.lines.map((bars) => ({ bars, numbers: bars.map(() => ++number) })),
        })),
      };
    });
  });

  interface RowStart {
    a4: boolean;
    letter: boolean;
    screen: boolean;
    /** The page repeats the section label, per paper size. */
    continued: { a4: boolean; letter: boolean; screen: boolean };
    /** The screen page's number, when the screen paper's page starts here. */
    page: number | null;
  }

  const screenPages = $derived(new Map(Array.from(pageStarts?.[screenPaper].keys() ?? [], (row, i) => [row, i + 2] as const)));

  function rowStart(index: number): RowStart | null {
    if (!pageStarts) return null;
    const a4 = pageStarts.a4.get(index);
    const letter = pageStarts.letter.get(index);
    const screen = pageStarts[screenPaper].get(index);
    if (a4 === undefined && letter === undefined) return null;
    return {
      a4: a4 !== undefined,
      letter: letter !== undefined,
      screen: screen !== undefined,
      continued: { a4: a4 === true, letter: letter === true, screen: screen === true },
      page: screenPages.get(index) ?? null,
    };
  }

  const numbered = $derived({ a4: (pageStarts?.a4.size ?? 0) > 0, letter: (pageStarts?.letter.size ?? 0) > 0 });

  let frame = $state<HTMLDivElement>();
  let paper = $state<HTMLElement>();
  let frameWidth = $state(0);
  let paperHeight = $state(0);

  // The frame's width sets the scale, and the paper's height (unscaled) the frame's height.
  $effect(() => {
    if (!frame || !paper || printLayout) return;
    const observer = new ResizeObserver(() => {
      frameWidth = frame!.clientWidth;
      paperHeight = paper!.offsetHeight;
    });
    observer.observe(frame);
    observer.observe(paper);
    return () => observer.disconnect();
  });
  const paperWidth = $derived(widthPx + 2 * marginPx);
  /** The paper's scale on screen. */
  const zoom = $derived(fitWidth && frameWidth > 0 ? Math.min(1, frameWidth / paperWidth) : 1);
</script>

{#snippet label(name: string)}
  <svelte:element this={`h${titleLevel + 1}`} class="section-label">{name}</svelte:element>
{/snippet}

<!-- "Verse (cont.)" at the top of a page that starts inside a section: shown on the paper sizes whose page starts there. -->
{#snippet continuedLabel(name: string, start: RowStart)}
  {#if start.continued.a4 || start.continued.letter}
    <div
      class="label-above continued"
      class:continued-a4={start.continued.a4}
      class:continued-letter={start.continued.letter}
      class:continued-screen={start.continued.screen}
    >
      <svelte:element this={`h${titleLevel + 1}`} class="section-label">{name}<span class="continued-text"> (cont.)</span></svelte:element>
    </div>
  {/if}
{/snippet}

{#snippet pageLine(start: RowStart | null)}
  {#if start?.page}
    <div class="page-line" aria-hidden="true"><span>Page {start.page}</span></div>
  {/if}
{/snippet}

<div
  class="sheet-frame"
  class:print-layout={printLayout}
  class:scrolls={!fitWidth}
  bind:this={frame}
  style:height={printLayout || !paperHeight ? null : `${paperHeight * zoom}px`}
>
  <article
    class="sheet-paper"
    bind:this={paper}
    style:--sheet-size={SHEET_FONT_PX * scale}
    style:--bars-per-row={columns}
    style:--paper-margin="{printLayout ? 0 : marginPx}px"
    style:width="{widthPx}px"
    style:transform={printLayout || zoom === 1 ? null : `scale(${zoom})`}
    style:visibility={printLayout || !fitWidth || frameWidth > 0 ? null : 'hidden'}
    class:hide-marks={!marks}
    class:numbered-a4={numbered.a4}
    class:numbered-letter={numbered.letter}
  >
    {#if song.title || song.artist}
      <header class="sheet-head">
        {#if song.title}
          <svelte:element this={`h${titleLevel}`} class="sheet-title">{song.title}</svelte:element>
        {/if}
        {#if song.artist}
          <p class="sheet-artist">{song.artist}</p>
        {/if}
      </header>
    {/if}

    {#each sections as { section, rows }, s (s)}
      {@const sectionStart = rows[0] ? rowStart(rows[0].index) : null}
      <section
        class="sheet-section"
        class:break-a4={sectionStart?.a4}
        class:break-letter={sectionStart?.letter}
        class:break-screen={sectionStart?.screen}
      >
        {@render pageLine(sectionStart)}
        {#each rows as { row, index, lines }, r (r)}
          {@const start = r === 0 ? sectionStart : rowStart(index)}
          <!-- The section label is part of its first row, so a page break never separates them. -->
          <div
            class="sheet-row"
            class:space-before={row.spaceBefore}
            class:break-a4={r > 0 && start?.a4}
            class:break-letter={r > 0 && start?.letter}
            class:break-screen={r > 0 && start?.screen}
            class:top-a4={start?.a4}
            class:top-letter={start?.letter}
            class:top-screen={start?.screen}
            data-row={index}
            data-starts-section={r === 0 ? '' : undefined}
            data-labelled={section.name ? '' : undefined}
          >
            {#if r > 0}{@render pageLine(start)}{/if}
            {#if r === 0 && section.name}
              <div class="label-above">{@render label(section.name)}</div>
            {:else if r > 0 && section.name && start}
              {@render continuedLabel(section.name, start)}
            {/if}
            {#each lines as { bars, numbers }, l (l)}
              <div class="bars" class:has-above={hasAbove(bars)} role="list">
                {#each bars as bar, i (i)}
                  <SheetBar
                    {bar}
                    {columnEm}
                    number={numbers[i]!}
                    indexInLine={i}
                    hideEnd={bars[i + 1]?.start === 'repeatStart' && !timeBeforeRepeatStart(bars[i + 1]!)}
                  />
                {/each}
              </div>
            {/each}
            {#each row.notes as note, n (n)}
              <p class="row-note">
                {note.text}{#if note.fromTextLine}<span class="problem-tag text-line-tag">shown as note</span>{/if}
              </p>
            {/each}
          </div>
        {/each}
      </section>
    {/each}
  </article>
</div>

<style>
  .sheet-frame {
    min-width: 0;
  }

  .sheet-frame.scrolls {
    overflow-x: auto;
  }

  .sheet-paper {
    box-sizing: content-box;
    margin: 0 auto;
    padding: var(--paper-margin);
    color-scheme: light;
    border-radius: var(--radius-sm);
    background: #fff;
    color: #000;
    box-shadow: var(--shadow);
    font-family: var(--font-sans);
    font-size: calc(var(--sheet-size) * 1px);
    line-height: 1.35;
    transform-origin: top left;
    /* Never wider than the page. */
    overflow-x: clip;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }

  .sheet-head {
    margin-bottom: 1.4em;
    text-align: center;
    break-after: avoid;
  }

  .sheet-title {
    font-size: 1.9em;
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -0.01em;
    overflow-wrap: anywhere;
  }

  .sheet-artist {
    margin-top: 0.3em;
    font-size: 1em;
    overflow-wrap: anywhere;
  }

  /* Pages break where SheetPageMeasure says (below); rows never split. */
  .sheet-section {
    position: relative;
  }

  .sheet-section + .sheet-section {
    margin-top: 1.3em;
  }

  /* A section's name, on its own line above its first row, left-aligned with the bars. */
  .label-above {
    margin-bottom: 0.35em;
  }

  .section-label {
    display: inline-block;
    max-width: 100%;
    padding: 0.12em 0.4em;
    border: max(1px, 0.09em) solid currentColor;
    border-radius: 0.25em;
    font-size: 0.78em;
    font-weight: 700;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }

  .sheet-row {
    position: relative;
    break-inside: avoid;
  }

  .sheet-row + .sheet-row,
  .bars + .bars {
    margin-top: 0.7em;
  }

  .sheet-row.space-before {
    margin-top: 1.5em;
  }

  .bars.has-above {
    padding-top: 1.5em;
  }

  /* Equal-width bars; minmax(0, 1fr) keeps them inside the page. SheetBar sizes its chords for this column width. */
  .bars {
    display: grid;
    grid-template-columns: repeat(var(--bars-per-row), minmax(0, 1fr));
  }

  .row-note {
    margin-top: 0.3em;
    font-size: 0.9em;
    font-style: italic;
    overflow-wrap: anywhere;
  }

  /* Screen-only problem tags (also in SheetBar); colours from tokens.css, for the always-white paper. */
  .problem-tag {
    display: inline-block;
    margin-left: 0.5em;
    padding: 0 0.4em;
    border-radius: 0.6em;
    font-size: 0.72em;
    font-style: normal;
    font-weight: 600;
    line-height: 1.5;
    vertical-align: 0.1em;
  }

  .text-line-tag {
    background: var(--sheet-warning-mark);
    color: var(--sheet-warning-mark-text);
  }

  .hide-marks .problem-tag {
    display: none;
  }

  /* Page breaks. A repeated label shows only on the paper sizes whose page starts there. */
  .continued,
  .page-line {
    display: none;
  }

  /* On screen: a dashed line across the paper, in room made above the page's first row. */
  @media screen {
    .sheet-row.top-screen {
      margin-top: 0;
    }

    .sheet-section.break-screen,
    .sheet-row.break-screen {
      margin-top: 3em;
    }

    .page-line {
      position: absolute;
      top: -1.9em;
      left: calc(-1 * var(--paper-margin));
      right: calc(-1 * var(--paper-margin));
      display: block;
      border-top: 1px dashed #8a8f98;
      color: #5b616b;
      font-size: 0.7em;
      font-weight: 600;
      line-height: 1;
      text-align: right;
      pointer-events: none;
    }

    .page-line span {
      position: relative;
      top: -0.6em;
      margin-right: 1em;
      padding: 0 0.5em;
      background: #fff;
    }

    .continued.continued-screen {
      display: block;
    }

    .print-layout .sheet-paper {
      border-radius: 0;
      box-shadow: none;
    }
  }

  /* Keep the page heights in step with sheet/fit.ts (A4_MIN_PAGE_HEIGHT_PX). */
  @media print and (min-height: 1090px) {
    .sheet-section.break-a4,
    .sheet-row.break-a4 {
      break-before: page;
      margin-top: 0;
    }

    .sheet-row.top-a4 {
      margin-top: 0;
    }

    .continued.continued-a4 {
      display: block;
    }
  }

  @media print and (max-height: 1089.98px) {
    .sheet-section.break-letter,
    .sheet-row.break-letter {
      break-before: page;
      margin-top: 0;
    }

    .sheet-row.top-letter {
      margin-top: 0;
    }

    .continued.continued-letter {
      display: block;
    }
  }

  @media print {
    /* A scroll container wouldn't break across pages. */
    .sheet-frame,
    .sheet-frame.scrolls {
      height: auto !important;
      overflow: visible;
    }

    .sheet-paper {
      padding: 0;
      border-radius: 0;
      box-shadow: none;
      transform: none !important;
      /* Hidden on screen until the pane is measured (a hidden pane on phones is never measured). */
      visibility: visible !important;
    }

    .problem-tag {
      display: none;
    }
  }
</style>
