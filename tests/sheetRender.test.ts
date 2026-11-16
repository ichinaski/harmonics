import { describe, expect, it } from 'vitest';
import { EXAMPLE_SONG } from '../src/sheet/example';
import type { Bar } from '../src/sheet/model';
import { parseSheet } from '../src/sheet/parse';
import { PRINT_WIDTH_PX } from '../src/sheet/fit';
import {
  barChordLines,
  barChordsWidth,
  barFixedWidth,
  barHasInvalid,
  barItemText,
  barNeedEm,
  barsScaleLimit,
  CHORD_EM,
  columnWidthEm,
  describeBar,
  SHEET_FONT_PX,
  sheetColumns,
  sheetRows,
  showsBarStart,
  splitAtHalfBar,
  textOffset,
  textWidthEm,
  timeBeforeRepeatStart,
} from '../src/sheet/render';

/** The bars of a one-row song. */
function bars(text: string): Bar[] {
  return parseSheet(text).song.sections[0]!.rows[0]!.bars;
}

/** describeBar for every bar of a one-row song, numbered from 1. */
function described(text: string): string[] {
  return bars(text).map((bar, i) => describeBar(bar, i + 1, i));
}

describe('barItemText', () => {
  it('shows chords in app style, keeping the typed spelling', () => {
    expect(bars('| Bbmaj7 | A#m7 | C^ | Bh7 | Co7 | C/E |').map((b) => (b.content.kind === 'items' ? barItemText(b.content.items[0]!) : ''))).toEqual([
      'B♭maj7',
      'A♯m7',
      'Cmaj7',
      'Bm7♭5',
      'C°7',
      'C/E',
    ]);
  });

  it('shows chords the table doesn’t know with the same normalising', () => {
    const [bar] = bars('| Cmi7b5b9 |');
    expect(bar!.content.kind === 'items' && barItemText(bar!.content.items[0]!)).toBe('Cm7♭5♭9');
  });

  it('shows N.C. for NC and unknown tokens as typed', () => {
    const [nc, bad] = bars('| NC | Cmaj8 |');
    expect(nc!.content.kind === 'items' && barItemText(nc!.content.items[0]!)).toBe('N.C.');
    expect(bad!.content.kind === 'items' && barItemText(bad!.content.items[0]!)).toBe('Cmaj8');
  });
});

/** The bar counts of each drawn row's lines, for every section of a song. */
function drawnRows(text: string, barsPerRow: 'typed' | 4 | 6 | 8): number[][][] {
  const song = parseSheet(text).song;
  const columns = sheetColumns(song, barsPerRow);
  return song.sections.map((section) => sheetRows(section.rows, barsPerRow, columns).map((row) => row.lines.map((line) => line.length)));
}

describe('sheetColumns', () => {
  it('as typed, has as many columns as the longest row, from 4 to 8', () => {
    expect(sheetColumns(parseSheet('C F\n| C | F | G |').song, 'typed')).toBe(4);
    expect(sheetColumns(parseSheet('| C | F | G | C | F | G |\nC').song, 'typed')).toBe(6);
    expect(sheetColumns(parseSheet('C '.repeat(13)).song, 'typed')).toBe(8);
  });

  it('is the chosen number of bars per row otherwise', () => {
    expect(([4, 6, 8] as const).map((n) => sheetColumns(parseSheet('C '.repeat(13)).song, n))).toEqual([4, 6, 8]);
  });
});

describe('sheetRows', () => {
  it('as typed, keeps the rows and wraps rows longer than 8 bars', () => {
    expect(drawnRows('C F\n| C | F | G | C |\n| C | D | E | F | G | A |\n' + 'C '.repeat(16) + '\n"note"', 'typed')).toEqual([[[2], [4], [6], [8, 8]]]);
    expect(drawnRows('C F\nC F G C', 'typed')).toEqual([[[2], [4]]]);
  });

  it('reflows a section’s rows into rows of 4, 6 or 8 bars', () => {
    const song = '| C | F | G | C |\n| C | D | E | F |\n| G | A | B | C |';
    expect(drawnRows(song, 4)).toEqual([[[4], [4], [4]]]);
    expect(drawnRows(song, 6)).toEqual([[[6], [6]]]);
    expect(drawnRows(song, 8)).toEqual([[[8], [4]]]);
    // Typing 8 bars per line and choosing 4 splits them; choosing 8 joins 4-bar lines.
    expect(drawnRows('C '.repeat(8) + '\n' + 'C '.repeat(8), 4)).toEqual([[[4], [4], [4], [4]]]);
  });

  it('never reflows across a section, a blank line or an own-line note', () => {
    const song = '[A]\nC D\nE F\n\nG A\n"note"\nB C\n[B]\nD E';
    expect(drawnRows(song, 8)).toEqual([[[4], [2], [2]], [[2]]]);
    const rows = sheetRows(parseSheet(song).song.sections[0]!.rows, 8, 8);
    expect(rows.map((row) => [row.spaceBefore, row.notes.map((n) => n.text), row.line])).toEqual([
      [false, [], 2],
      [true, ['note'], 5],
      [false, [], 7],
    ]);
  });

  it('keeps a row of notes only', () => {
    expect(drawnRows('"intro note"\nC D', 4)).toEqual([[[], [2]]]);
  });
});

describe('chord sizes', () => {
  it('estimates text widths in em of Inter SemiBold', () => {
    expect(textWidthEm('C')).toBeCloseTo(0.74);
    expect(textWidthEm('Cm7')).toBeCloseTo(0.74 + 0.9 + 0.66);
    expect(textWidthEm('B♭')).toBeCloseTo(0.66 + 0.43);
  });

  it('needs room for every chord and its beat slashes side by side', () => {
    const [one, two, beats, cont] = bars('| C | Cm7 F7 | C / / G | / / G |');
    expect(barChordsWidth(one!)).toBeCloseTo(textWidthEm('C') + 0.35);
    expect(barChordsWidth(two!)).toBeCloseTo(textWidthEm('Cm7') + 0.35 + textWidthEm('F7') + 0.35);
    expect(barChordsWidth(beats!)).toBeCloseTo(textWidthEm('C') + 2 * 0.68 + 0.35 + textWidthEm('G') + 0.35);
    expect(barChordsWidth(cont!)).toBeCloseTo(2 * 0.68 + 0.35 + textWidthEm('G') + 0.35);
    expect(barChordsWidth(bars('| C | % | |')[1]!)).toBe(2);
  });

  it('splits a crowded bar at the half bar, each chord with its beats', () => {
    const items = (text: string) => {
      const content = bars(text)[0]!.content;
      return content.kind === 'items' ? content.items : [];
    };
    const lines = (text: string) => splitAtHalfBar(items(text)).map((line) => line.map((item) => (item.kind === 'continue' ? '/' : item.text)));
    expect(lines('| C D Em7 F |')).toEqual([['C', 'D'], ['Em7', 'F']]);
    expect(lines('| C D E |')).toEqual([['C', 'D'], ['E']]);
    expect(lines('| C / / G |')).toEqual([['C'], ['G']]);
    expect(lines('| C G / / |')).toEqual([['C'], ['G']]);
    expect(lines('| / / G A |')).toEqual([['/'], ['G', 'A']]);
  });

  it('keeps a bar’s chords side by side when they fit; only a bar that can’t fit stacks, never shrinking a bar on its own', () => {
    const [roomy, two, four] = bars('| C | Cmaj7 Dm7 | Cmaj7 Dm7 Em7 Fmaj7 |');
    const shape = (lines: ReturnType<typeof barChordLines>) => lines.map((line) => (line.wraps ? `${line.items.length}w` : line.items.length));
    expect(barChordLines(roomy!, 10)).toEqual([{ items: [expect.objectContaining({ text: 'C' })], wraps: false }]);
    expect(shape(barChordLines(two!, barNeedEm(two!)))).toEqual([2]);
    expect(shape(barChordLines(two!, barNeedEm(two!) - 0.01))).toEqual([1, 1]);
    expect(shape(barChordLines(four!, barNeedEm(four!)))).toEqual([4]);
    // Split at the half bar, and a half that still doesn't fit split again, so names stay whole.
    expect(shape(barChordLines(four!, 10))).toEqual([2, 2]);
    expect(shape(barChordLines(four!, 7))).toEqual([1, 1, 1, 1]);
    // A single name too wide for the bar wraps rather than being cut.
    const [long] = bars('| Cmaj7(#11,b13)/G |');
    expect(shape(barChordLines(long!, 3))).toEqual(['1w']);
    expect(barChordLines(bars('| % |')[0]!, 3)).toEqual([]);
  });

  it('works out the width a bar needs: chords at full size with the safety margin, plus its fixed parts, endings and notes', () => {
    const [two, repeat] = bars('| Cm7 F7 |: Am Am/G :|');
    expect(barNeedEm(two!)).toBeCloseTo(barFixedWidth(two!) + (barChordsWidth(two!) * CHORD_EM) / 0.94);
    expect(barNeedEm(repeat!)).toBeCloseTo(barFixedWidth(repeat!) + (barChordsWidth(repeat!) * CHORD_EM) / 0.94);
    // A long note word and a long ending label need room too.
    const [plain, noted] = bars('| C | C "accelerando" |');
    expect(barNeedEm(noted!)).toBeGreaterThan(barNeedEm(plain!));
    const [, ending] = bars('|: C | 1.-3. C :| 4. D |');
    expect(barNeedEm(ending!)).toBeGreaterThan(barNeedEm(plain!));
  });

  it('works out a bar column’s width in em', () => {
    expect(columnWidthEm(688, 16, 4)).toBeCloseTo(43 / 4);
  });
  it('counts the room taken by repeat signs and time signatures', () => {
    const [plain, repeat, time, both] = bars('| C |: C :| 3/4 C |: 3/4 D :|');
    expect(barFixedWidth(plain!)).toBeCloseTo(1);
    expect(barFixedWidth(repeat!)).toBeCloseTo(1 + 1 + 0.8);
    expect(timeBeforeRepeatStart(time!)).toBe(false);
    expect(barFixedWidth(time!)).toBeCloseTo(1 + 1.1);
    expect(timeBeforeRepeatStart(both!)).toBe(true);
    expect(barFixedWidth(both!)).toBeCloseTo(1 + 2.35 + 0.8);
  });
});

describe('barsScaleLimit', () => {
  const limit = (text: string, barsPerRow: 'typed' | 4 | 6 | 8 = 'typed') => barsScaleLimit(parseSheet(text).song, barsPerRow, PRINT_WIDTH_PX);

  it('lets a sheet of one-chord bars grow to the largest size', () => {
    expect(limit('| C | F | G | C |')).toEqual({ scale: 1.4, crowdedLines: [] });
  });

  it('is the largest whole percent at which the busiest bar fits its column', () => {
    const text = '[Verse]\n|: Am Am/G | F :|x4\n|: Am G | F :|x3 |D | F |';
    const song = parseSheet(text).song;
    const busiest = song.sections[0]!.rows[0]!.bars[0]!;
    const columnPx = PRINT_WIDTH_PX / sheetColumns(song, 'typed');
    const expected = Math.floor((columnPx / (SHEET_FONT_PX * barNeedEm(busiest))) * 100) / 100;
    expect(expected).toBeGreaterThan(1);
    expect(expected).toBeLessThan(1.4);
    expect(limit(text)).toEqual({ scale: expected, crowdedLines: [] });
    // Every bar fits side by side at that scale.
    const columnEm = columnWidthEm(PRINT_WIDTH_PX, SHEET_FONT_PX * expected, sheetColumns(song, 'typed'));
    for (const bar of song.sections[0]!.rows.flatMap((row) => row.bars)) expect(barChordLines(bar, columnEm).length).toBeLessThanOrEqual(1);
  });

  it('gets smaller with more bars per row', () => {
    const text = '| Cmaj7 Dm7 | Em7 A7 | Dm7 G7 | Cmaj7 |';
    expect(limit(text, 8).scale).toBeLessThan(limit(text, 4).scale);
  });

  it('stops at the smallest size and names the lines of the bars that still don’t fit (they stack)', () => {
    const text = '| C |\n| Cmaj7 Dm7 Em7 Fmaj7 G7 Am7 Bm7b5 Cmaj7 | C |';
    expect(limit(text, 8)).toEqual({ scale: 0.6, crowdedLines: [2] });
  });
});

describe('barHasInvalid', () => {
  it('is true for bars with a token that could not be read', () => {
    expect(bars('| C | Cmaj8 | C7b9b13 |').map(barHasInvalid)).toEqual([false, true, false]);
  });
});

describe('showsBarStart', () => {
  it('draws the start line on a row’s first bar and on repeat starts only', () => {
    const row = bars('| C |: F | G :|');
    expect(row.map((bar, i) => showsBarStart(bar, i))).toEqual([true, true, false]);
  });
});

describe('describeBar', () => {
  it('reads chords in a bar', () => {
    expect(described('| Cm7 F7 | Bbmaj7 |')).toEqual(['Bar 1: Cm7, F7', 'Bar 2: B♭maj7, final bar line']);
  });

  it('names repeats, the count, endings and bar lines', () => {
    expect(described('|: C | 1. G :| x3 | 2. F || Am |.')).toEqual([
      'Bar 1: repeat start, C',
      'Bar 2: ending 1, G, repeat end, play 3 times',
      'Bar 3: ending 2, F, double bar line',
      'Bar 4: Am, final bar line',
    ]);
  });

  it('reads beats when slashes are used, %, N.C., empty bars, time signatures and notes', () => {
    expect(described('| 3/4 C / / G | % | N.C. | | D "rit." |')).toEqual([
      'Bar 1: 3/4 time, C, 3 beats, G, 1 beat',
      'Bar 2: repeat the previous bar',
      'Bar 3: no chord',
      'Bar 4: empty',
      'Bar 5: D, note: rit., final bar line',
    ]);
  });

  it('reads multi-number endings, slashes that continue a chord, and a time signature before a repeat', () => {
    expect(described('| C |: 3/4 1.2. D :| 1.-3. E / |')).toEqual([
      'Bar 1: C',
      'Bar 2: 3/4 time, repeat start, ending 1, 2, D, repeat end',
      'Bar 3: ending 1 to 3, E, 2 beats, final bar line',
    ]);
    expect(described('| C | / / G |')[1]).toBe('Bar 2: previous chord, 2 beats, G, 1 beat, final bar line');
  });
});

describe('textOffset', () => {
  const text = '[A]\n| C | Cmaj8 |\n';

  it('finds a line and column', () => {
    expect(textOffset(text, 2, 7)).toBe(text.indexOf('Cmaj8'));
    expect(textOffset(text, 1, 1)).toBe(0);
  });

  it('clamps past the end of a line or the text', () => {
    expect(textOffset(text, 1, 99)).toBe(3);
    expect(textOffset(text, 9, 1)).toBe(text.length);
  });
});

describe('EXAMPLE_SONG', () => {
  it('parses with no issues', () => {
    expect(parseSheet(EXAMPLE_SONG.body).issues).toEqual([]);
  });
});
