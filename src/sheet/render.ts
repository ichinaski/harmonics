// Helpers for drawing a parsed song (SheetPreview.svelte): display names,
// the bar grid, the sheet's scale for its busiest bar, screen reader text for
// bars and caret positions for issues. Pure TypeScript, no UI imports.

import { MAX_FIT_PERCENT, MIN_FIT_PERCENT } from './fit';
import type { Bar, BarEnd, BarItem, BarStart, Row, RowNote, Song } from './model';

/** Base font size of the sheet in CSS px at 100% (chords are CHORD_EM times larger); the whole sheet is drawn at one scale of it. */
export const SHEET_FONT_PX = 16;

/**
 * The Sheet's bars per row: 'typed' keeps the rows as typed (a row longer
 * than AS_TYPED_MAX_BARS wraps); 4, 6 or 8 reflow each run of rows into
 * rows of that many bars (sheetRows).
 */
export type SheetBarsPerRow = 'typed' | 4 | 6 | 8;

export const SHEET_BARS_PER_ROW: readonly SheetBarsPerRow[] = ['typed', 4, 6, 8];

/** As typed: the grid has as many columns as the longest row, from AS_TYPED_MIN_BARS to AS_TYPED_MAX_BARS; longer rows wrap. */
export const AS_TYPED_MIN_BARS = 4;
export const AS_TYPED_MAX_BARS = 8;

/** The number of equal bar columns on every line of the sheet. */
export function sheetColumns(song: Song, barsPerRow: SheetBarsPerRow): number {
  if (barsPerRow !== 'typed') return barsPerRow;
  const longest = Math.max(0, ...song.sections.flatMap((section) => section.rows.map((row) => row.bars.length)));
  return Math.min(AS_TYPED_MAX_BARS, Math.max(AS_TYPED_MIN_BARS, longest));
}

/** A row of the drawn sheet: a typed row, or with 4, 6 or 8 bars per row a reflowed one. Page breaks never split it. */
export interface SheetRow {
  bars: Bar[];
  /** The bars cut into lines of `columns`: one line, or more for a typed row longer than the grid. None for a row of notes only. */
  lines: Bar[][];
  notes: RowNote[];
  spaceBefore: boolean;
  /** Text line of the row's first bar (or of the row, with no bars). */
  line: number;
}

function cutIntoLines(bars: readonly Bar[], columns: number): Bar[][] {
  const lines: Bar[][] = [];
  for (let i = 0; i < bars.length; i += columns) lines.push(bars.slice(i, i + columns));
  return lines;
}

/**
 * A section's rows as drawn. As typed, each typed row is a row (wrapping
 * onto lines of `columns`). With 4, 6 or 8 bars per row, the bars of each
 * run of typed rows are reflowed into rows of that many bars; a run ends at
 * a blank line (a row with spaceBefore starts a new run) and at an own-line
 * note (which stays under the run's last row), and never crosses a section.
 */
export function sheetRows(rows: readonly Row[], barsPerRow: SheetBarsPerRow, columns: number): SheetRow[] {
  if (barsPerRow === 'typed') {
    return rows.map((row) => ({ bars: row.bars, lines: cutIntoLines(row.bars, columns), notes: row.notes, spaceBefore: row.spaceBefore, line: row.line }));
  }
  const result: SheetRow[] = [];
  let run: Row[] = [];
  const endRun = () => {
    if (run.length === 0) return;
    const bars = run.flatMap((row) => row.bars);
    const lineOf = new Map<Bar, number>(run.flatMap((row) => row.bars.map((bar) => [bar, row.line] as const)));
    const notes = run[run.length - 1]!.notes;
    if (bars.length === 0) result.push({ bars, lines: [], notes, spaceBefore: run[0]!.spaceBefore, line: run[0]!.line });
    for (let i = 0; i < bars.length; i += barsPerRow) {
      const chunk = bars.slice(i, i + barsPerRow);
      const last = i + barsPerRow >= bars.length;
      result.push({ bars: chunk, lines: [chunk], notes: last ? notes : [], spaceBefore: i === 0 && run[0]!.spaceBefore, line: lineOf.get(chunk[0]!)! });
    }
    run = [];
  };
  for (const row of rows) {
    if (row.spaceBefore || row.bars.length === 0) endRun();
    run.push(row);
    if (row.notes.length > 0 || row.bars.length === 0) endRun();
  }
  endRun();
  return result;
}

/** What a bar item shows: the chord in app style (B♭maj7, keeping the typed spelling), N.C., or the token as typed. Beat slashes that continue the previous chord show nothing but their slashes. */
export function barItemText(item: BarItem): string {
  if (item.kind === 'chord') return item.name;
  if (item.kind === 'noChord') return 'N.C.';
  if (item.kind === 'continue') return '';
  return item.text;
}

/** True when a bar line on the left of the bar is drawn: on a line's first bar, or a repeat start anywhere. */
export function showsBarStart(bar: Bar, indexInLine: number): boolean {
  return indexInLine === 0 || bar.start === 'repeatStart';
}

/** True when the time signature is drawn before the bar's repeat-start sign (`3/4 |:`), not after it. */
export function timeBeforeRepeatStart(bar: Bar): boolean {
  return bar.timeSignature !== null && bar.start === 'repeatStart';
}

// ---------------------------------------------------------------------------
// Bar widths and the sheet's scale

/** Advance widths of Inter SemiBold (the sheet's chord font) in em, by character class; others count as WIDE_EM. */
const NARROW_EM = 0.3;
const WIDE_EM = 0.66;
const CHAR_EM: Readonly<Record<string, number>> = {
  i: 0.26, j: 0.26, l: 0.26, I: 0.3, t: 0.35, f: 0.37, r: 0.42, '1': 0.42,
  m: 0.9, M: 0.92, W: 0.95, w: 0.85, '%': 1,
  '♭': 0.43, '♯': 0.48, '°': 0.46, '-': 0.47, '^': 0.48, '(': 0.37, ')': 0.37, '/': 0.38,
  ',': NARROW_EM, '.': NARROW_EM, ' ': 0.25,
  a: 0.57, b: 0.62, c: 0.55, d: 0.62, e: 0.59, g: 0.63, h: 0.61, k: 0.57, n: 0.61, o: 0.61, p: 0.62, q: 0.62, s: 0.55, u: 0.61, v: 0.56, x: 0.56, y: 0.56, z: 0.53,
  A: 0.74, B: 0.66, C: 0.74, D: 0.72, E: 0.61, F: 0.59, G: 0.75, H: 0.75, N: 0.75, O: 0.78, X: 0.7,
};

/** Estimated width of a text in em of the chord font. */
export function textWidthEm(text: string): number {
  let width = 0;
  for (const ch of text) width += CHAR_EM[ch] ?? WIDE_EM;
  return width;
}

/**
 * Bar layout in em, matching SheetBar's styles: the gap and slash width of
 * beat slashes, a chord slot's right padding (all in chord em), and the
 * room the bar lines, repeat signs and time signature take (in sheet em).
 */
const BEAT_EM = 0.3 + 0.38;
const SLOT_PADDING_EM = 0.35;
const STAFF_PADDING_EM = 0.5;
const REPEAT_START_PADDING_EM = 1.5;
const REPEAT_END_PADDING_EM = 1.3;
const TIME_SIGNATURE_EM = 1.1;
const TIME_BEFORE_REPEAT_EM = 2.85;

function itemsWidth(items: readonly BarItem[]): number {
  let width = 0;
  for (const item of items) {
    const slashes = item.kind === 'continue' ? item.beats : item.beats - 1;
    width += textWidthEm(barItemText(item)) + slashes * BEAT_EM + SLOT_PADDING_EM;
  }
  return width;
}

/** Room a bar's chords need side by side, in em of the chord font: each chord's name and beat slashes (2 for a bar without chords). */
export function barChordsWidth(bar: Bar): number {
  return bar.content.kind === 'items' ? itemsWidth(bar.content.items) : 2;
}

/** Chords are this many times the sheet's text size, in every bar. */
export const CHORD_EM = 1.3;

/** Margin for the estimated widths (textWidthEm), so a chord never reaches the bar line. */
const ROOM_SAFETY = 0.94;

/** The beats a list of items takes. */
export function itemsBeats(items: readonly BarItem[]): number {
  return items.reduce((sum, item) => sum + item.beats, 0);
}

/** A crowded bar's items on two lines, split at the half bar: the items that start in the first half, then the rest (4 chords: 2 + 2). */
export function splitAtHalfBar(items: readonly BarItem[]): BarItem[][] {
  const half = itemsBeats(items) / 2;
  let beat = 0;
  let first = 0;
  while (first < items.length && beat < half) beat += items[first++]!.beats;
  first = Math.min(items.length - 1, Math.max(1, first));
  return [items.slice(0, first), items.slice(first)];
}

/** The width a bar needs with its chords on these lines, in sheet em: its fixed parts plus the widest line of chords at CHORD_EM. */
function chordLinesNeedEm(bar: Bar, lines: readonly (readonly BarItem[])[]): number {
  const chords = lines.length === 0 ? barChordsWidth(bar) : Math.max(...lines.map(itemsWidth));
  return barFixedWidth(bar) + (chords * CHORD_EM) / ROOM_SAFETY;
}

/** Ending labels are 0.8 em, after the bracket's 0.15 em inset and 0.25 em padding; the repeat count ("x3") is 0.85 em, with 0.15 em padding each side. */
const ENDING_LABEL_EM = 0.8;
const ENDING_INSET_EM = 0.4;
const TIMES_EM = 0.85;
const TIMES_PADDING_EM = 0.3;
/** Attached notes are 0.8 em with 0.5 em padding each side; they wrap between words. */
const NOTE_EM = 0.8;
const NOTE_PADDING_EM = 1;

/**
 * The width a bar needs at 100%, in sheet em, with everything side by side:
 * its chords and beat slashes, bar lines, repeat signs and time signature,
 * the ending label and repeat count above it, and the longest word of its
 * notes. Widths grow with the text size, so a bar fits a column `columnEm`
 * wide at any scale where this is no more than `columnEm`.
 */
export function barNeedEm(bar: Bar): number {
  const items = bar.content.kind === 'items' ? [bar.content.items] : [];
  let need = chordLinesNeedEm(bar, items);
  const label = bar.ending?.isStart ? ENDING_INSET_EM + ENDING_LABEL_EM * textWidthEm(bar.ending.label) : 0;
  const times = bar.repeatTimes ? TIMES_PADDING_EM + TIMES_EM * textWidthEm(`x${bar.repeatTimes}`) : 0;
  if (label || times) need = Math.max(need, (label + times) / ROOM_SAFETY);
  const words = bar.notes.flatMap((note) => note.split(/\s+/));
  if (words.length > 0) need = Math.max(need, (NOTE_PADDING_EM + NOTE_EM * Math.max(...words.map(textWidthEm))) / ROOM_SAFETY);
  return need;
}

/** A line of a bar's chords; `wraps` when it's a single chord too wide for the bar, which then breaks rather than crossing the bar line. */
export interface BarChordLine {
  items: BarItem[];
  wraps: boolean;
}

/**
 * The lines of a bar's chords in a column `columnEm` wide (in sheet em): one
 * line when they fit side by side, which they do at the sheet's scale
 * (barsScaleLimit) unless the bar can't fit even at the smallest scale.
 * Only then, as a last resort, they stack: split at the half bar, and each
 * half that still doesn't fit split again, so names stay whole. A single
 * chord too wide even on its own line wraps.
 */
export function barChordLines(bar: Bar, columnEm: number): BarChordLine[] {
  if (bar.content.kind !== 'items') return [];
  const fits = (items: readonly BarItem[]) => chordLinesNeedEm(bar, [items]) <= columnEm;
  const place = (items: BarItem[]): BarChordLine[] => {
    if (fits(items)) return [{ items, wraps: false }];
    if (items.length < 2) return [{ items, wraps: true }];
    return splitAtHalfBar(items).flatMap(place);
  };
  return place(bar.content.items);
}

/** The width of one bar column in sheet em: the line width (`widthPx` at a text size of `fontPx`) shared by `columns` bars. */
export function columnWidthEm(widthPx: number, fontPx: number, columns: number): number {
  return widthPx / fontPx / columns;
}

/** The scale the sheet's busiest bar allows, and the text lines of the bars too busy to fit even at the smallest scale (they stack). */
export interface BarsScaleLimit {
  /** In whole percent, from MIN_FIT_PERCENT to MAX_FIT_PERCENT, divided by 100. */
  scale: number;
  /** Text lines of the bars that don't fit side by side at MIN_FIT_PERCENT, in order, each once. */
  crowdedLines: number[];
}

/**
 * The largest scale at which every bar of the sheet fits its column with
 * its chords side by side (barNeedEm), at a line width of `widthPx`, in
 * whole percent from MIN_FIT_PERCENT to MAX_FIT_PERCENT. The sheet is drawn
 * at one scale: the smaller of this and Fit to's (or 100%).
 */
export function barsScaleLimit(song: Song, barsPerRow: SheetBarsPerRow, widthPx: number): BarsScaleLimit {
  const columnPx = widthPx / sheetColumns(song, barsPerRow);
  let percent = MAX_FIT_PERCENT;
  const crowded = new Set<number>();
  for (const section of song.sections) {
    for (const row of section.rows) {
      for (const bar of row.bars) {
        const percentFor = (needEm: number) => Math.floor((columnPx / (SHEET_FONT_PX * needEm)) * 100 + 1e-9);
        const items = bar.content.kind === 'items' ? [bar.content.items] : [];
        if (percentFor(chordLinesNeedEm(bar, items)) < MIN_FIT_PERCENT) crowded.add(bar.span.line);
        percent = Math.max(MIN_FIT_PERCENT, Math.min(percent, percentFor(barNeedEm(bar))));
      }
    }
  }
  return { scale: percent / 100, crowdedLines: [...crowded].sort((a, b) => a - b) };
}

/** Room in a bar that doesn't hold chords, in sheet em: padding, repeat signs and the time signature. */
export function barFixedWidth(bar: Bar): number {
  let width = STAFF_PADDING_EM * 2;
  if (timeBeforeRepeatStart(bar)) width += TIME_BEFORE_REPEAT_EM - STAFF_PADDING_EM;
  else {
    if (bar.start === 'repeatStart') width += REPEAT_START_PADDING_EM - STAFF_PADDING_EM;
    if (bar.timeSignature) width += TIME_SIGNATURE_EM;
  }
  if (bar.end === 'repeatEnd') width += REPEAT_END_PADDING_EM - STAFF_PADDING_EM;
  return width;
}

/** True when a bar has a token that couldn't be read (marked on screen, not in print). */
export function barHasInvalid(bar: Bar): boolean {
  return bar.content.kind === 'items' && bar.content.items.some((item) => item.kind === 'invalid');
}

// ---------------------------------------------------------------------------
// Screen reader text

const START_TEXT: Record<BarStart, string | null> = { single: null, double: 'double bar line', repeatStart: 'repeat start' };
const END_TEXT: Record<BarEnd, string | null> = { single: null, double: 'double bar line', final: 'final bar line', repeatEnd: 'repeat end' };

function beatsText(beats: number): string {
  return beats === 1 ? '1 beat' : `${beats} beats`;
}

/** 'ending 1', 'ending 1, 2', 'ending 1 to 3'. */
function endingText(numbers: readonly number[], label: string): string {
  if (label.includes('–')) return `ending ${numbers[0]} to ${numbers[numbers.length - 1]}`;
  return `ending ${numbers.join(', ')}`;
}

/**
 * Screen reader text of a bar: 'Bar 3: Cm7, F7'. Also names the bar lines,
 * repeats, ending, time signature, beats (when slashes are used) and notes:
 * 'Bar 1: repeat start, Cm7', 'Bar 5: C, 3 beats, G, 1 beat'.
 */
export function describeBar(bar: Bar, number: number, indexInLine: number): string {
  const parts: string[] = [];
  const start = showsBarStart(bar, indexInLine) ? START_TEXT[bar.start] : null;
  if (bar.timeSignature && timeBeforeRepeatStart(bar)) parts.push(`${bar.timeSignature.text} time`);
  if (start) parts.push(start);
  if (bar.ending?.isStart) parts.push(endingText(bar.ending.numbers, bar.ending.label));
  if (bar.timeSignature && !timeBeforeRepeatStart(bar)) parts.push(`${bar.timeSignature.text} time`);
  const content = bar.content;
  if (content.kind === 'empty') parts.push('empty');
  else if (content.kind === 'repeatPrevious') parts.push('repeat the previous bar');
  else {
    const withBeats = content.items.some((item) => item.beats > 1 || item.kind === 'continue');
    for (const item of content.items) {
      const text = item.kind === 'noChord' ? 'no chord' : item.kind === 'continue' ? 'previous chord' : barItemText(item);
      parts.push(withBeats ? `${text}, ${beatsText(item.beats)}` : text);
    }
  }
  for (const note of bar.notes) parts.push(`note: ${note}`);
  const end = END_TEXT[bar.end];
  if (end) parts.push(bar.end === 'repeatEnd' && bar.repeatTimes ? `${end}, play ${bar.repeatTimes} times` : end);
  return `Bar ${number}: ${parts.join(', ')}`;
}

/** Offset in `text` of a 1-based line and column, clamped to the text; for moving the editor caret to an issue. */
export function textOffset(text: string, line: number, column: number): number {
  const lines = text.split('\n');
  let offset = 0;
  for (let i = 0; i < line - 1 && i < lines.length; i++) offset += lines[i]!.length + 1;
  const lineText = lines[line - 1] ?? '';
  return Math.min(text.length, offset + Math.min(Math.max(0, column - 1), lineText.length));
}
