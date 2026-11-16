import { describe, expect, it } from 'vitest';
import { countPages, crowdedBarsText, findFitScale, likelyPaperSize, MAX_FIT_PERCENT, MIN_FIT_PERCENT, PAGE_HEIGHT_PX, paginate, PRINT_WIDTH_PX, sheetLengthText, type SheetBlock } from '../src/sheet/fit';

/** Blocks of `height` px with `gap` px between them. */
function blocks(count: number, height: number, gap = 0): SheetBlock[] {
  return Array.from({ length: count }, (_, i) => ({ top: i * (height + gap), bottom: i * (height + gap) + height }));
}

describe('print area', () => {
  it('is A4’s width and each paper’s height inside 14 mm margins', () => {
    expect(PRINT_WIDTH_PX).toBeCloseTo((182 * 96) / 25.4);
    expect(PAGE_HEIGHT_PX.a4).toBeCloseTo((269 * 96) / 25.4);
    expect(PAGE_HEIGHT_PX.letter).toBeCloseTo((251.4 * 96) / 25.4);
  });
});

describe('likelyPaperSize', () => {
  it('guesses Letter for the US, Canada, Mexico and the Philippines, A4 elsewhere', () => {
    expect(['en-US', 'en-CA', 'es-MX', 'fil', 'fil-PH', 'en-PH', 'en-us'].map(likelyPaperSize)).toEqual(Array(7).fill('letter'));
    expect(['en-GB', 'es-ES', 'fr-CA', 'de', 'en', ''].map(likelyPaperSize)).toEqual(Array(6).fill('a4'));
  });
});

describe('countPages', () => {
  it('counts one page for an empty or short sheet', () => {
    expect(countPages([], 100)).toBe(1);
    expect(countPages(blocks(3, 30), 100)).toBe(1);
    expect(countPages(blocks(1, 100), 100)).toBe(1);
  });

  it('breaks pages only between blocks', () => {
    // 40 px blocks: two fit a 100 px page, the third moves to the next page.
    expect(countPages(blocks(3, 40), 100)).toBe(2);
    expect(countPages(blocks(5, 40), 100)).toBe(3);
  });

  it('drops the space before a block that starts a page', () => {
    // With 20 px gaps, a page holds 40 + 20 + 40; the gap before the next page's first block doesn't count.
    expect(countPages(blocks(4, 40, 20), 100)).toBe(2);
    expect(countPages(blocks(4, 40, 21), 100)).toBe(4);
  });

  it('keeps the title with the first row', () => {
    const sheet: SheetBlock[] = [{ top: 0, bottom: 30, keepWithNext: true }, ...blocks(2, 60).map((b) => ({ top: b.top + 30, bottom: b.bottom + 30 }))];
    expect(countPages(sheet, 100)).toBe(2);
    const late: SheetBlock[] = [{ top: 0, bottom: 50 }, { top: 50, bottom: 70, keepWithNext: true }, { top: 70, bottom: 120 }];
    expect(countPages(late, 100)).toBe(2);
  });

  it('splits a block taller than a page', () => {
    expect(countPages([{ top: 0, bottom: 250 }], 100)).toBe(3);
    expect(countPages([{ top: 0, bottom: 50 }, { top: 50, bottom: 300 }], 100)).toBe(4);
  });
});

describe('paginate', () => {
  /** Sections of `rows` rows each (40 px rows, no gaps), the first rows starting a section; all named. */
  function sections(...rows: number[]): SheetBlock[] {
    const result: SheetBlock[] = [];
    for (const count of rows) {
      for (let r = 0; r < count; r++) {
        const top = result.length * 40;
        result.push({ top, bottom: top + 40, startsSection: r === 0, labelled: true });
      }
    }
    return result;
  }

  it('breaks before a section when the page is at least half full', () => {
    // 100 px pages: [2 rows] then a 2-row section that doesn't fit after them goes to the next page whole.
    expect(paginate(sections(2, 2), 100)).toEqual({ pages: 2, breaks: [{ block: 2, continued: false }] });
  });

  it('splits a section, repeating its label, when breaking before it would leave the page under half full', () => {
    // A 1-row section fills 40 of 100 px: the 3-row section after it splits, and the page that starts inside it repeats the label.
    expect(paginate(sections(1, 3), 100)).toEqual({ pages: 2, breaks: [{ block: 2, continued: true }] });
    // The repeated label takes room on its page.
    expect(paginate(sections(1, 4), 100).breaks.map((b) => b.block)).toEqual([2, 4]);
    expect(paginate(sections(1, 4), 100, 30).breaks.map((b) => b.block)).toEqual([2, 3, 4]);
  });

  it('repeats no label for an unnamed section', () => {
    const blocks = sections(1, 3).map((b) => ({ ...b, labelled: false }));
    expect(paginate(blocks, 100).breaks).toEqual([{ block: 2, continued: false }]);
  });

  it('never separates the title from the first row', () => {
    const blocks: SheetBlock[] = [{ top: 0, bottom: 30, keepWithNext: true }, ...sections(1, 2).map((b) => ({ ...b, top: b.top + 30, bottom: b.bottom + 30 }))];
    // Title + first section = 70 px; the next section doesn't fit and moves whole (the page is over half full).
    expect(paginate(blocks, 100).breaks).toEqual([{ block: 2, continued: false }]);
  });
});

describe('findFitScale', () => {
  /** A sheet `height` px tall at full size, on 100 px pages (A4) and 90 px pages (Letter), counting the layouts. */
  function sheetOf(height: number) {
    const scales: number[] = [];
    const pages = (h: number, page: number) => Math.max(1, Math.ceil(h / page - 1e-9));
    return {
      scales,
      pagesAt: (scale: number) => {
        scales.push(scale);
        return { a4: pages(height * scale, 100), letter: pages(height * scale, 90) };
      },
    };
  }

  it('only counts the pages with Fit to off', () => {
    const sheet = sheetOf(250);
    expect(findFitScale(sheet.pagesAt, 0)).toEqual({ pages: { a4: 3, letter: 3 }, scale: 1, fits: true });
    expect(sheet.scales).toEqual([1]);
  });

  it('grows a sheet that fits, up to the largest size', () => {
    // 75 × 1.2 = 90 fills one Letter page.
    expect(findFitScale(sheetOf(75).pagesAt, 1)).toEqual({ pages: { a4: 1, letter: 1 }, scale: 1.2, fits: true });
    expect(findFitScale(sheetOf(40).pagesAt, 1)).toEqual({ pages: { a4: 1, letter: 1 }, scale: MAX_FIT_PERCENT / 100, fits: true });
    expect(findFitScale(sheetOf(150).pagesAt, 2)).toEqual({ pages: { a4: 2, letter: 2 }, scale: 1.2, fits: true });
  });

  it('finds the largest whole percent that fits both, in a few layouts', () => {
    const sheet = sheetOf(125);
    // 125 × 0.72 = 90 fits one Letter page; 0.73 doesn't (though it fits A4).
    expect(findFitScale(sheet.pagesAt, 1)).toEqual({ pages: { a4: 1, letter: 1 }, scale: 0.72, fits: true });
    expect(sheet.scales.length).toBeLessThanOrEqual(8);
    expect(findFitScale(sheetOf(270).pagesAt, 2)).toEqual({ pages: { a4: 2, letter: 2 }, scale: 0.66, fits: true });
  });

  it('never goes above the busiest bar’s limit, with Fit to on or off', () => {
    // A short sheet would grow to 140%, but a busy bar allows only 118%.
    expect(findFitScale(sheetOf(40).pagesAt, 1, 118)).toEqual({ pages: { a4: 1, letter: 1 }, scale: 1.18, fits: true });
    // A long one fits at 72%, under the limit, so the limit changes nothing.
    expect(findFitScale(sheetOf(125).pagesAt, 1, 118).scale).toBe(0.72);
    // Without Fit to: 100%, or the limit when it's smaller.
    expect(findFitScale(sheetOf(40).pagesAt, 0, 118).scale).toBe(1);
    const busy = sheetOf(250);
    expect(findFitScale(busy.pagesAt, 0, 85)).toEqual({ pages: { a4: 3, letter: 3 }, scale: 0.85, fits: true });
    expect(busy.scales).toEqual([0.85]);
    // A limit at the smallest size takes one layout.
    const smallest = sheetOf(40);
    expect(findFitScale(smallest.pagesAt, 1, MIN_FIT_PERCENT)).toEqual({ pages: { a4: 1, letter: 1 }, scale: 0.6, fits: true });
    expect(smallest.scales).toEqual([0.6]);
  });

  it('stops at the smallest size when the sheet can’t fit', () => {
    const sheet = sheetOf(200);
    expect(findFitScale(sheet.pagesAt, 1)).toEqual({ pages: { a4: 2, letter: 2 }, scale: MIN_FIT_PERCENT / 100, fits: false });
    expect(sheet.scales).toEqual([0.6]);
  });
});

describe('sheetLengthText', () => {
  const both = (pages: number) => ({ a4: pages, letter: pages });

  it('says how long the printed sheet is', () => {
    expect(sheetLengthText({ pages: both(1), scale: 1, fits: true }, 0, 'a4')).toEqual({ text: 'Prints on 1 page', detail: null, crowded: null });
    expect(sheetLengthText({ pages: both(3), scale: 1, fits: true }, 0, 'letter')).toEqual({ text: 'About 3 pages', detail: null, crowded: null });
    expect(sheetLengthText({ pages: both(1), scale: 0.82, fits: true }, 1, 'a4').text).toBe('Fits on 1 page at 82%');
    expect(sheetLengthText({ pages: both(1), scale: 1.25, fits: true }, 1, 'a4').text).toBe('Fits on 1 page at 125%');
    expect(sheetLengthText({ pages: { a4: 1, letter: 2 }, scale: 0.9, fits: true }, 2, 'a4').text).toBe('Fits on 2 pages at 90%');
  });

  it('names the paper size when A4 and Letter print a different number of pages', () => {
    const length = { pages: { a4: 2, letter: 3 }, scale: 1, fits: true };
    expect(sheetLengthText(length, 0, 'a4')).toEqual({ text: 'About 2 pages (A4)', detail: 'A4: 2 pages · Letter: 3 pages', crowded: null });
    expect(sheetLengthText(length, 0, 'letter')).toEqual({ text: 'About 3 pages (Letter)', detail: 'A4: 2 pages · Letter: 3 pages', crowded: null });
    expect(sheetLengthText({ pages: { a4: 1, letter: 2 }, scale: 1, fits: true }, 0, 'a4').text).toBe('Prints on 1 page (A4)');
  });

  it('shows the scale whenever it isn’t 100%', () => {
    expect(sheetLengthText({ pages: both(1), scale: 0.85, fits: true }, 0, 'a4').text).toBe('Prints on 1 page at 85%');
    expect(sheetLengthText({ pages: { a4: 2, letter: 3 }, scale: 0.7, fits: true }, 0, 'a4').text).toBe('About 2 pages at 70% (A4)');
    expect(sheetLengthText({ pages: both(1), scale: 1, fits: true }, 1, 'a4').text).toBe('Fits on 1 page at 100%');
  });

  it('names the lines of bars too busy to fit even at the smallest size', () => {
    expect(sheetLengthText({ pages: both(1), scale: 0.6, fits: true }, 0, 'a4', [12]).crowded).toBe(
      'The bar on line 12 is too busy for one line even at 60%, so it’s stacked.',
    );
    expect(crowdedBarsText([3, 12, 14])).toBe('Bars on lines 3, 12 and 14 are too busy for one line even at 60%, so they’re stacked.');
    expect(crowdedBarsText([3, 12])).toBe('Bars on lines 3 and 12 are too busy for one line even at 60%, so they’re stacked.');
    expect(crowdedBarsText([])).toBeNull();
  });

  it('says how many pages the sheet needs when it can’t fit', () => {
    expect(sheetLengthText({ pages: { a4: 2, letter: 3 }, scale: 0.6, fits: false }, 1, 'a4').text).toBe('Can’t fit on 1 page; needs 3 pages at the smallest size');
    expect(sheetLengthText({ pages: both(4), scale: 0.6, fits: false }, 2, 'a4').text).toBe('Can’t fit on 2 pages; needs 4 pages at the smallest size');
  });
});
