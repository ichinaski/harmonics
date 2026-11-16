// The printed length of a sheet: page breaks, the page count and the scale
// that fits a sheet on 1 or 2 pages ("Fit to"). Pure TypeScript; the
// measuring itself (an offscreen copy of the sheet at print width) is
// SheetPageMeasure.svelte, which passes its measurements in.

/** "Fit to": off (0), 1 page or 2 pages. */
export type SheetFitPages = 0 | 1 | 2;

export const SHEET_FIT_PAGES: readonly SheetFitPages[] = [0, 1, 2];

/** Print margin on every side, in mm; the @page rule in app.css uses the same. */
export const PRINT_MARGIN_MM = 14;

const PX_PER_MM = 96 / 25.4;

/**
 * The printable width in CSS px inside the print margins, of the narrower
 * paper (A4, 210 mm; Letter is 215.9 mm). The sheet is measured at this
 * width, so a layout that fits A4 fits Letter too.
 */
export const PRINT_WIDTH_PX = (Math.min(210, 215.9) - 2 * PRINT_MARGIN_MM) * PX_PER_MM;

export type PaperSize = 'a4' | 'letter';

/** The printable height of each paper size inside the print margins, in CSS px (A4 297 mm, Letter 279.4 mm). */
export const PAGE_HEIGHT_PX: Readonly<Record<PaperSize, number>> = {
  a4: (297 - 2 * PRINT_MARGIN_MM) * PX_PER_MM,
  letter: (279.4 - 2 * PRINT_MARGIN_MM) * PX_PER_MM,
};

const PAPER_NAMES: Readonly<Record<PaperSize, string>> = { a4: 'A4', letter: 'Letter' };

/** Languages of the places that print on Letter; everywhere else uses A4. */
const LETTER_LANGUAGES = ['en-us', 'en-ca', 'es-mx', 'fil', 'en-ph'];

/** The paper size the browser most likely prints on, guessed from its language (navigator.language). */
export function likelyPaperSize(language: string): PaperSize {
  const tag = language.toLowerCase();
  return LETTER_LANGUAGES.some((code) => tag === code || tag.startsWith(`${code}-`)) ? 'letter' : 'a4';
}

/** The smallest and largest scales of the sheet, in percent of its natural size (SHEET_FONT_PX, sheet/render.ts). */
export const MIN_FIT_PERCENT = 60;
export const MAX_FIT_PERCENT = 140;

/**
 * Print media queries tell the paper sizes apart by the page box height
 * (A4 297 mm = 1123 px, Letter 279.4 mm = 1056 px): app.css and
 * SheetPreview use `@media print and (min-height: 1090px)` for A4.
 */
export const A4_MIN_PAGE_HEIGHT_PX = 1090;

/** A block that a page break never splits (the header, a row), in px from the top of the sheet. */
export interface SheetBlock {
  top: number;
  bottom: number;
  /** Keep on the same page as the next block (the title stays with the first row). */
  keepWithNext?: boolean;
  /** The first block of a section: pages preferably break before it. */
  startsSection?: boolean;
  /** In a named section: a page that starts inside the section repeats its label ("Verse (cont.)"). */
  labelled?: boolean;
}

/** Where a page starts: the index of its first block, and whether it repeats its section's label. */
export interface PageBreak {
  block: number;
  continued: boolean;
}

export interface Pagination {
  pages: number;
  /** The pages after the first (a block taller than a page also adds pages, but no break). */
  breaks: PageBreak[];
}

/**
 * Breaks the blocks into pages, as the print stylesheet then applies them:
 * only between blocks, the title with the first row, and the space before
 * the block that starts a page dropped. When the next block doesn't fit,
 * the page breaks before that block's section instead, if the section
 * started on this page and the page is at least half full by then; a page
 * that starts inside a named section repeats its label, which takes
 * `continuedLabelHeight` px. A block taller than a page is split. An empty
 * sheet is 1 page.
 */
export function paginate(blocks: readonly SheetBlock[], pageHeight: number, continuedLabelHeight = 0): Pagination {
  let pages = 1;
  const breaks: PageBreak[] = [];
  let pageStart = 0;
  let pageTop = blocks[0]?.top ?? 0;
  let used = 0;
  let sectionStart = 0;
  for (let i = 0; i < blocks.length; i++) {
    // The block and the ones it keeps with go on a page together.
    let last = i;
    while (blocks[last]!.keepWithNext && last + 1 < blocks.length) last++;
    for (let j = i; j <= last; j++) if (blocks[j]!.startsSection) sectionStart = j;
    const bottom = blocks[last]!.bottom;
    if (i > pageStart && bottom - pageTop + used > pageHeight) {
      let next = i;
      const keptBefore = blocks[sectionStart - 1]?.keepWithNext ?? false;
      if (sectionStart > pageStart && sectionStart < i && !keptBefore && blocks[sectionStart]!.top - pageTop + used >= pageHeight / 2) next = sectionStart;
      const continued = !blocks[next]!.startsSection && (blocks[next]!.labelled ?? false);
      breaks.push({ block: next, continued });
      pages++;
      pageStart = next;
      pageTop = blocks[next]!.top;
      used = continued ? continuedLabelHeight : 0;
      if (next < i) {
        // Place the section's blocks again, from the top of the new page.
        i = next - 1;
        continue;
      }
    }
    while (bottom - pageTop + used > pageHeight) {
      pages++;
      pageTop += pageHeight - used;
      used = 0;
    }
    i = last;
  }
  return { pages, breaks };
}

/** The number of pages the blocks print on (paginate). */
export function countPages(blocks: readonly SheetBlock[], pageHeight: number, continuedLabelHeight = 0): number {
  return paginate(blocks, pageHeight, continuedLabelHeight).pages;
}

/** The pages a sheet prints on, on each paper size. */
export type PageCounts = Readonly<Record<PaperSize, number>>;

export interface SheetLength {
  /** The pages the sheet prints on at `scale`. */
  pages: PageCounts;
  /** The scale the sheet is drawn at (1 = natural size), from MIN_FIT_PERCENT to MAX_FIT_PERCENT. */
  scale: number;
  /** Fit to: the sheet fits the chosen pages, on both paper sizes, at `scale`; without Fit to, always true. */
  fits: boolean;
}

/**
 * The rows that start a page on each paper size, by row number in the sheet
 * (SheetPreview numbers its rows from 0), each mapped to whether that page
 * repeats the section's label ("Verse (cont.)").
 */
export type PageStarts = Readonly<Record<PaperSize, ReadonlyMap<number, boolean>>>;

/** The longer of the two counts: what fits both paper sizes. */
function morePages(pages: PageCounts): number {
  return Math.max(pages.a4, pages.letter);
}

/**
 * The scale the sheet is drawn at: with Fit to, the largest whole percent
 * from MIN_FIT_PERCENT to `largestPercent` (the busiest bar's limit,
 * barsScaleLimit in sheet/render.ts) at which the sheet prints on at most
 * `targetPages` on both paper sizes, so Fit to also grows a short sheet;
 * without Fit to (`targetPages` 0), 100% or `largestPercent` if that's
 * smaller. `pagesAt` lays the sheet out at a scale and counts its pages. A
 * binary search, so a sheet takes about 8 layouts. When even the smallest
 * scale doesn't fit, the result is that scale with `fits: false`.
 */
export function findFitScale(pagesAt: (scale: number) => PageCounts, targetPages: SheetFitPages, largestPercent = MAX_FIT_PERCENT): SheetLength {
  const largest = Math.max(MIN_FIT_PERCENT, Math.min(MAX_FIT_PERCENT, largestPercent));
  if (targetPages === 0) {
    const natural = Math.min(100, largest) / 100;
    return { pages: pagesAt(natural), scale: natural, fits: true };
  }
  let fitting = MIN_FIT_PERCENT;
  let fittingPages = pagesAt(fitting / 100);
  if (morePages(fittingPages) > targetPages) return { pages: fittingPages, scale: fitting / 100, fits: false };
  let tooBig = largest;
  if (tooBig === fitting) return { pages: fittingPages, scale: fitting / 100, fits: true };
  const largestPages = pagesAt(tooBig / 100);
  if (morePages(largestPages) <= targetPages) return { pages: largestPages, scale: tooBig / 100, fits: true };
  while (tooBig - fitting > 1) {
    const mid = Math.floor((fitting + tooBig) / 2);
    const pages = pagesAt(mid / 100);
    if (morePages(pages) <= targetPages) {
      fitting = mid;
      fittingPages = pages;
    } else {
      tooBig = mid;
    }
  }
  return { pages: fittingPages, scale: fitting / 100, fits: true };
}

function pagesText(pages: number): string {
  return pages === 1 ? '1 page' : `${pages} pages`;
}

export interface SheetLengthText {
  /** The preview header's text: 'Prints on 1 page', 'About 3 pages at 85%', 'About 2 pages (A4)', 'Fits on 1 page at 82%', or 'Can’t fit on 1 page; needs 3 pages at the smallest size'. */
  text: string;
  /** Both counts, when the paper sizes differ (Fit to off): 'A4: 2 pages · Letter: 3 pages'. */
  detail: string | null;
  /** The bars too busy to fit even at the smallest size, which stack: 'The bar on line 12 is too busy for one line, so it’s stacked.' */
  crowded: string | null;
}

function percentText(scale: number): string {
  return `${Math.round(scale * 100)}%`;
}

/** 'line 12', 'lines 12 and 14', 'lines 3, 12 and 14'. */
function linesText(lines: readonly number[]): string {
  if (lines.length === 1) return `line ${lines[0]}`;
  return `lines ${lines.slice(0, -1).join(', ')} and ${lines[lines.length - 1]}`;
}

/** The note about bars that stack because they can't fit even at the smallest size (barsScaleLimit's crowdedLines). */
export function crowdedBarsText(lines: readonly number[]): string | null {
  if (lines.length === 0) return null;
  const bars = lines.length === 1 ? 'The bar on' : 'Bars on';
  const are = lines.length === 1 ? 'is' : 'are';
  const them = lines.length === 1 ? 'it’s' : 'they’re';
  return `${bars} ${linesText(lines)} ${are} too busy for one line even at ${MIN_FIT_PERCENT}%, so ${them} stacked.`;
}

/**
 * The printed length, for the preview's header, with the scale whenever it
 * isn't 100%. With Fit to off it counts the pages on the likely paper size,
 * naming it when the other size prints a different number; with Fit to, one
 * number that holds for both. `crowdedLines` are the text lines of bars that
 * stack (barsScaleLimit).
 */
export function sheetLengthText(length: SheetLength, targetPages: SheetFitPages, paper: PaperSize, crowdedLines: readonly number[] = []): SheetLengthText {
  const crowded = crowdedBarsText(crowdedLines);
  if (targetPages === 0) {
    const pages = length.pages[paper];
    const at = length.scale === 1 ? '' : ` at ${percentText(length.scale)}`;
    const text = (pages === 1 ? 'Prints on 1 page' : `About ${pagesText(pages)}`) + at;
    if (length.pages.a4 === length.pages.letter) return { text, detail: null, crowded };
    return { text: `${text} (${PAPER_NAMES[paper]})`, detail: `A4: ${pagesText(length.pages.a4)} · Letter: ${pagesText(length.pages.letter)}`, crowded };
  }
  if (length.fits) return { text: `Fits on ${pagesText(morePages(length.pages))} at ${percentText(length.scale)}`, detail: null, crowded };
  return { text: `Can’t fit on ${pagesText(targetPages)}; needs ${pagesText(morePages(length.pages))} at the smallest size`, detail: null, crowded };
}
