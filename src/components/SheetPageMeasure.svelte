<!--
  Measures the printed length of the Sheet: an invisible copy of the sheet
  in its print layout, at the print width (sheet/fit.ts). It breaks the
  pages on A4 and on Letter from where the rows actually fall (paginate)
  and finds the one scale the whole sheet is drawn at: with Fit to on, the
  largest that fits both (a binary search, about 8 layouts of this copy
  only), never above what the busiest bar allows (barsScaleLimit); with
  Fit to off, 100% or that limit if it's smaller. The page starts it
  finds are what the preview shows and the printout applies. It runs a
  moment after the song or the layout stops changing, so typing never
  waits for it (and at once for `measureNow`, before printing), and it's
  contained, so laying it out never touches the rest of the page. Not
  printed.
-->
<script lang="ts">
  import { flushSync, untrack } from 'svelte';
  import type { Song } from '../sheet/model';
  import {
    findFitScale,
    PAGE_HEIGHT_PX,
    paginate,
    PRINT_WIDTH_PX,
    type PageCounts,
    type PageStarts,
    type Pagination,
    type PaperSize,
    type SheetBlock,
    type SheetFitPages,
    type SheetLength,
  } from '../sheet/fit';
  import { barsScaleLimit, type SheetBarsPerRow } from '../sheet/render';
  import SheetPreview from './SheetPreview.svelte';

  interface Props {
    song: Song;
    barsPerRow: SheetBarsPerRow;
    fitPages: SheetFitPages;
    /** The result: the pages, and the scale to draw the sheet at. Null until first measured. */
    length?: SheetLength | null;
    /** Where the pages start on each paper size, at that scale. */
    pageStarts?: PageStarts | null;
  }

  let { song, barsPerRow, fitPages, length = $bindable(null), pageStarts = $bindable(null) }: Props = $props();

  /** Wait after the last edit of the song before measuring; layout changes are measured at once. */
  const MEASURE_DELAY_MS = 300;

  interface Layout {
    song: Song;
    barsPerRow: SheetBarsPerRow;
    fitPages: SheetFitPages;
  }

  let box = $state<HTMLDivElement>();
  /** What the copy shows: the last measured layout, so it doesn't follow every keystroke. */
  let measured = $state.raw<Layout | null>(null);
  let scale = $state(1);
  let run = 0;

  $effect(() => {
    const layout: Layout = { song, barsPerRow, fitPages };
    const last = untrack(() => measured);
    const delay = last && last.song !== song ? MEASURE_DELAY_MS : 0;
    const timer = setTimeout(() => void measureWhenFontsReady(layout), delay);
    return () => clearTimeout(timer);
  });

  /** The header and rows of the copy, which page breaks never split, in px from its top, with the row numbers of the rows. */
  function blocks(): { blocks: SheetBlock[]; rows: (number | null)[] } {
    const paper = box?.querySelector('.sheet-paper');
    if (!paper) return { blocks: [], rows: [] };
    const origin = paper.getBoundingClientRect().top;
    const rows: (number | null)[] = [];
    const sheetBlocks = Array.from(paper.querySelectorAll<HTMLElement>('.sheet-head, .sheet-row'), (el) => {
      const rect = el.getBoundingClientRect();
      const row = el.dataset.row;
      rows.push(row === undefined ? null : Number(row));
      return {
        top: rect.top - origin,
        bottom: rect.bottom - origin,
        keepWithNext: el.classList.contains('sheet-head'),
        startsSection: el.dataset.startsSection !== undefined,
        labelled: el.dataset.labelled !== undefined,
      };
    });
    return { blocks: sheetBlocks, rows };
  }

  /** The height a repeated label above a row takes ("Verse (cont.)"): a label above a section's first row, with its margin. */
  function continuedLabelHeight(): number {
    const label = box?.querySelector<HTMLElement>('.sheet-row .label-above');
    if (!label) return 0;
    return label.getBoundingClientRect().height + parseFloat(getComputedStyle(label).marginBottom);
  }

  let last: { scale: number; pagination: Record<PaperSize, Pagination>; rows: (number | null)[] } | null = null;

  function pagesAt(next: number): PageCounts {
    scale = next;
    flushSync();
    const measuredBlocks = blocks();
    const labelHeight = continuedLabelHeight();
    const pagination = {
      a4: paginate(measuredBlocks.blocks, PAGE_HEIGHT_PX.a4, labelHeight),
      letter: paginate(measuredBlocks.blocks, PAGE_HEIGHT_PX.letter, labelHeight),
    };
    last = { scale: next, pagination, rows: measuredBlocks.rows };
    return { a4: pagination.a4.pages, letter: pagination.letter.pages };
  }

  function startsOf(pagination: Pagination, rows: readonly (number | null)[]): Map<number, boolean> {
    const starts = new Map<number, boolean>();
    for (const { block, continued } of pagination.breaks) {
      const row = rows[block];
      if (row !== null && row !== undefined) starts.set(row, continued);
    }
    return starts;
  }

  function measure(layout: Layout): void {
    measured = layout;
    const limit = barsScaleLimit(layout.song, layout.barsPerRow, PRINT_WIDTH_PX);
    const result = findFitScale(pagesAt, layout.fitPages, Math.round(limit.scale * 100));
    if (last?.scale !== result.scale) pagesAt(result.scale);
    length = result;
    pageStarts = last ? { a4: startsOf(last.pagination.a4, last.rows), letter: startsOf(last.pagination.letter, last.rows) } : null;
  }

  async function measureWhenFontsReady(layout: Layout): Promise<void> {
    const id = ++run;
    // Measuring before the sheet's font is in would count the fallback font's lines.
    await document.fonts?.ready;
    if (id !== run) return;
    measure(layout);
  }

  /** Measures the current song and layout now (before printing, so the page breaks are never behind the last keystroke). */
  export function measureNow(): void {
    run++;
    measure({ song, barsPerRow, fitPages });
    flushSync();
  }
</script>

<div bind:this={box} class="sheet-measure" style:width="{PRINT_WIDTH_PX}px" aria-hidden="true" inert>
  {#if measured}
    <SheetPreview song={measured.song} barsPerRow={measured.barsPerRow} {scale} marks={false} printLayout />
  {/if}
</div>

<style>
  /* Out of sight and out of the page's layout: fixed (no scrollbars) and fully contained. */
  .sheet-measure {
    position: fixed;
    top: 0;
    left: -20000px;
    height: 0;
    visibility: hidden;
    pointer-events: none;
    contain: strict;
  }

  @media print {
    .sheet-measure {
      display: none;
    }
  }
</style>
