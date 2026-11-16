// The song model of the Sheet tab: what the parser (parse.ts) builds from the
// text and the renderer draws. Pure TypeScript, no UI imports.
//
// Song → sections → rows (one per text line) → bars. Bar lines are stored on
// the bars: each bar has the line on its left (`start`) and on its right
// (`end`). Between two bars of a row the previous bar's `end` and the next
// bar's `start` describe the same place: a renderer draws every `end`, and a
// `start` only on the first bar of a row or when it is a repeat start.

import type { Chord } from '../theory';

/** Where a token sits in the parsed text: 1-based line and column, length in UTF-16 units. */
export interface SourceSpan {
  line: number;
  column: number;
  length: number;
}

/** Bar line on the left of a bar. `double` only at the start of a row (`|| C |`). */
export type BarStart = 'single' | 'double' | 'repeatStart';

/** Bar line on the right of a bar. The song's last bar is always `final`, unless it ends a repeat. */
export type BarEnd = 'single' | 'double' | 'final' | 'repeatEnd';

/**
 * A chord symbol (sheet/chordSymbol.ts): one the app's chord table knows, or
 * any other well-formed symbol (C7♭9♭13), which has no `chord`.
 */
export interface ChordItem {
  kind: 'chord';
  /** The chord symbol as typed. */
  text: string;
  /** Null for a well-formed symbol the chord table doesn't have. */
  chord: Chord | null;
  /** The display name, in app style: 'B♭maj7', 'C7♭9♭13'. */
  name: string;
  /** 1 plus the beat slashes after it (`C / /` is 3). With no slashes, chords split the bar evenly. */
  beats: number;
  span: SourceSpan;
}

/** `N.C.` or `NC`: no chord. */
export interface NoChordItem {
  kind: 'noChord';
  text: string;
  beats: number;
  span: SourceSpan;
}

/** Beat slashes at the start of a bar (`| / / G |`): the previous chord goes on. */
export interface ContinueItem {
  kind: 'continue';
  text: string;
  /** One per slash. */
  beats: number;
  span: SourceSpan;
}

/** A token that couldn't be read (an unknown chord, a misplaced `3/4`). It's printed as typed, and has an issue. */
export interface InvalidItem {
  kind: 'invalid';
  text: string;
  beats: number;
  span: SourceSpan;
}

export type BarItem = ChordItem | NoChordItem | ContinueItem | InvalidItem;

export type BarContent =
  /** Chords (and N.C. or unreadable tokens), at least one, in order. */
  | { kind: 'items'; items: BarItem[] }
  /** `%`: the previous bar again. */
  | { kind: 'repeatPrevious'; span: SourceSpan }
  /** `| |`, or a bar with only a time signature, ending or notes. */
  | { kind: 'empty' };

export interface TimeSignature {
  /** As typed: '3/4'. */
  text: string;
  /** Beats per bar (the top number). */
  upper: number;
  /** Beat unit (the bottom number): 2, 4, 8... */
  lower: number;
}

/**
 * Part of an ending bracket (`1.`, `2.`, `1.2.`, `1.-3.`). An ending starts at
 * the bar with the number and runs over the next bars of the same row until a
 * bar line other than a single one (usually the `:|`) or the next ending. Each
 * bar of the bracket has a mark: the label shows on the `isStart` bar, and the
 * bracket closes on the `isEnd` bar.
 */
export interface EndingMark {
  /** The times the ending is played: [1], [1, 2] for `1.2.`, [1, 2, 3] for `1.-3.`. */
  numbers: number[];
  /** As drawn: '1.', '1., 2.', '1.–3.'. */
  label: string;
  isStart: boolean;
  isEnd: boolean;
}

export interface Bar {
  start: BarStart;
  end: BarEnd;
  /** `:| x3`: times the repeat is played, or null when not given (twice). Only with `end: 'repeatEnd'`. */
  repeatTimes: number | null;
  /** Written at the start of this bar, or null. There's no default time signature. */
  timeSignature: TimeSignature | null;
  ending: EndingMark | null;
  content: BarContent;
  /** Quoted notes attached to this bar (`| C "rit." |`), without the quotes. */
  notes: string[];
  /** The bar's first token. */
  span: SourceSpan;
}

/** A note on its own line under a row. */
export interface RowNote {
  /** Without the quotes. */
  text: string;
  /** A line of lyrics or text (no quotes) that the parser shows as a note, with a warning. */
  fromTextLine: boolean;
}

export interface Row {
  /** Empty for a row of notes only (a note line with no row before it in the section). */
  bars: Bar[];
  /** Notes on their own lines under this row. */
  notes: RowNote[];
  /** A blank line came before this row: leave a little space. */
  spaceBefore: boolean;
  /** Line of the row in the parsed text. */
  line: number;
}

export interface Section {
  /** `[Verse]` → 'Verse'; null for rows before the first section header. */
  name: string | null;
  rows: Row[];
  /** Line of the `[Name]` header, or null for the unnamed first section. */
  line: number | null;
}

export interface Song {
  /** From a `Title:` header line; '' when there's none. The app's fields take precedence. */
  title: string;
  artist: string;
  sections: Section[];
}

export type SheetIssueSeverity = 'error' | 'warning';

/** A problem with one token. Issues never stop the song from rendering. */
export interface SheetIssue {
  severity: SheetIssueSeverity;
  line: number;
  column: number;
  /** The token as typed: 'Cmaj8'. */
  token: string;
  /** Plain message, without the line: 'unknown chord "Cmaj8"'. */
  message: string;
  /** The message is about the whole line, so it reads 'Line 3 is shown as a note…' rather than 'Line 3: …'. */
  wholeLine: boolean;
  /** Identical messages on one line are merged into one issue (at the first token): how many there were. */
  count: number;
}

export interface SheetParseResult {
  song: Song;
  /** Sorted by line, then column. */
  issues: SheetIssue[];
}

/** 'Line 4: unknown chord "Cmaj8"', 'Line 3 is shown as a note because it looks like lyrics', '… (3 times)'. */
export function formatSheetIssue(issue: SheetIssue): string {
  const text = issue.wholeLine ? `Line ${issue.line} ${issue.message}` : `Line ${issue.line}: ${issue.message}`;
  return issue.count > 1 ? `${text} (${issue.count} times)` : text;
}
