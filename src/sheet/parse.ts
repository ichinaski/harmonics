// Parser for the Sheet syntax (docs/sheet-format.md): text → Song plus issues.
// Pure TypeScript, no UI imports. Issues never stop the parse: a token that
// can't be read stays in its bar as typed (an InvalidItem) and gets an issue.

import { readChordSymbol } from './chordSymbol';
import type {
  Bar,
  BarContent,
  BarEnd,
  BarItem,
  BarStart,
  Row,
  RowNote,
  Section,
  SheetIssue,
  SheetIssueSeverity,
  SheetParseResult,
  Song,
  SourceSpan,
  TimeSignature,
} from './model';
import { readHeaderLine } from './text';

// ---------------------------------------------------------------------------
// Tokens of a row line

type BarLineText = '|' | '||' | '|:' | ':|' | '|.';

interface BarLineToken {
  kind: 'barLine';
  text: BarLineText;
  /** `:| x3` → 3. */
  repeatTimes: number | null;
  span: SourceSpan;
}

interface NoteToken {
  kind: 'note';
  text: string;
  span: SourceSpan;
}

interface WordToken {
  kind: 'word';
  text: string;
  span: SourceSpan;
}

type LineToken = BarLineToken | NoteToken | WordToken;

/** Bar content tokens, classified. `invalid` tokens already have their issue. */
type ContentToken =
  | { kind: 'ending'; numbers: number[]; label: string; text: string; span: SourceSpan }
  | { kind: 'time'; timeSignature: TimeSignature; text: string; span: SourceSpan }
  | { kind: 'simile'; text: string; span: SourceSpan }
  /** `attached`: written onto a chord (`C///`), so it stays in that chord's bar on a line with no bar lines. */
  | { kind: 'beat'; text: string; attached: boolean; span: SourceSpan }
  | { kind: 'item'; item: BarItem }
  | { kind: 'note'; text: string; span: SourceSpan };

const REPEAT_TIMES_RE = /^[x×](\d+)$/i;
/** `1.`, `1.2.` (a list) or `1.-3.` (a range). */
const ENDING_RE = /^(?:\d+\.[-–]\d+\.|(?:\d+\.)+)$/;
const ENDING_PREFIX_RE = /^(\d+\.[-–]\d+\.|(?:\d+\.)+)(.+)$/;
const ENDING_RANGE_RE = /^(\d+)\.[-–](\d+)\.$/;
/** A chord with beat slashes written onto it: `C///`, `C/E/`. */
const ATTACHED_BEATS_RE = /^(.*[^/])(\/+)$/;
const TIME_SIGNATURE_RE = /^(\d+)\/(\d+)$/;
const NO_CHORD_RE = /^N\.?C\.?$/i;
const SECTION_LINE_RE = /^\[([^\]]*)\]\s*(.*)$/;
/** Text after a section name that belongs to the label: `[Verse 1] (x2)`, `[Solo] x4`, `[Coda] "fade"`. */
const SECTION_SUFFIX_RE = /^(\(.*\)|[x×]\d+|"[^"]*")$/;
/** `C - G - Am - F`: dashes written as bar lines. */
const DASHES_RE = /^[-–—]+$/;

function countOf(text: string, char: string): number {
  return text.split(char).length - 1;
}
const TIME_SIGNATURE_UNITS: ReadonlySet<number> = new Set([1, 2, 4, 8, 16, 32]);

class IssueList {
  readonly issues: SheetIssue[] = [];

  add(severity: SheetIssueSeverity, span: SourceSpan, token: string, message: string, wholeLine = false): void {
    this.issues.push({ severity, line: span.line, column: span.column, token, message, wholeLine, count: 1 });
  }

  error(span: SourceSpan, token: string, message: string): void {
    this.add('error', span, token, message);
  }

  warning(span: SourceSpan, token: string, message: string): void {
    this.add('warning', span, token, message);
  }

  /** A warning about the whole line: 'Line 3 is shown as a note…'. */
  lineWarning(span: SourceSpan, token: string, message: string): void {
    this.add('warning', span, token, message, true);
  }

  addAll(other: IssueList): void {
    this.issues.push(...other.issues);
  }

  /** By line and column, with identical messages on one line merged into the first (`count`). */
  sorted(): SheetIssue[] {
    const merged = new Map<string, SheetIssue>();
    for (const issue of [...this.issues].sort((a, b) => a.line - b.line || a.column - b.column)) {
      const key = `${issue.line}\u0000${issue.severity}\u0000${issue.message}`;
      const first = merged.get(key);
      if (first) first.count++;
      else merged.set(key, { ...issue });
    }
    return [...merged.values()];
  }
}

function span(line: number, index: number, length: number): SourceSpan {
  return { line, column: index + 1, length };
}

/**
 * Splits a line into bar lines, quoted notes and words. Bar lines need no
 * spaces around them (`|C|D|`). A repeat count right after `:|` belongs to it.
 */
function tokenizeLine(typed: string, line: number, issues: IssueList): LineToken[] {
  const text = withPlainBarLines(typed, line, issues);
  const tokens: LineToken[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '"') {
      const close = text.indexOf('"', i + 1);
      if (close < 0) {
        // An unclosed note ends at the next bar line, so the bars after it are kept.
        const barLine = text.indexOf('|', i + 1);
        const end = barLine < 0 ? text.length : text[barLine - 1] === ':' ? barLine - 1 : barLine;
        const note = text.slice(i + 1, end).trim();
        const token = text.slice(i, end).trimEnd();
        issues.error(span(line, i, token.length), token, `note has no closing quote: "${note}`);
        tokens.push({ kind: 'note', text: note, span: span(line, i, token.length) });
        i = end;
        continue;
      }
      tokens.push({ kind: 'note', text: text.slice(i + 1, close).trim(), span: span(line, i, close + 1 - i) });
      i = close + 1;
      continue;
    }
    if (ch === '|' || (ch === ':' && text[i + 1] === '|')) {
      const two = text.slice(i, i + 2);
      const bar: BarLineText = ch === ':' ? ':|' : two === '||' || two === '|:' || two === '|.' ? two : '|';
      tokens.push({ kind: 'barLine', text: bar, repeatTimes: null, span: span(line, i, bar.length) });
      i += bar.length;
      continue;
    }
    let end = i;
    while (end < text.length && !/\s/.test(text[end]!) && text[end] !== '"' && text[end] !== '|' && !(text[end] === ':' && text[end + 1] === '|')) {
      end++;
    }
    tokens.push({ kind: 'word', text: text.slice(i, end), span: span(line, i, end - i) });
    i = end;
  }

  // `:| x3`: the count belongs to the repeat sign.
  const merged: LineToken[] = [];
  for (const token of tokens) {
    const prev = merged[merged.length - 1];
    const times = token.kind === 'word' ? REPEAT_TIMES_RE.exec(token.text) : null;
    if (times && prev?.kind === 'barLine' && prev.text === ':|' && prev.repeatTimes === null) {
      const count = Number(times[1]);
      if (count >= 2) prev.repeatTimes = count;
      else issues.error(token.span, token.text, `repeat count "${token.text}" should be x2 or more`);
      continue;
    }
    merged.push(token);
  }
  return merged;
}

/** Characters that look like `|` (from fonts, websites and box drawing); read as `|`, with a warning. */
const LOOKALIKE_BARS: ReadonlySet<string> = new Set(['¦', '│', '｜']);

/** The line with lookalike bar lines outside quotes made `|` (one warning per character and line). Same length, so columns stay right. */
function withPlainBarLines(text: string, line: number, issues: IssueList): string {
  let out = '';
  let quoted = false;
  const warned = new Set<string>();
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') quoted = !quoted;
    if (quoted || !LOOKALIKE_BARS.has(ch)) {
      out += ch;
      continue;
    }
    if (!warned.has(ch)) {
      warned.add(ch);
      issues.warning(span(line, i, 1), ch, `"${ch}" is read as the bar line "|"`);
    }
    out += '|';
  }
  return out;
}

function invalid(text: string, tokenSpan: SourceSpan): ContentToken {
  return { kind: 'item', item: { kind: 'invalid', text, beats: 1, span: tokenSpan } };
}

/** An ending's numbers and label, or an error message. */
function readEnding(text: string): { numbers: number[]; label: string } | { error: string } {
  const range = ENDING_RANGE_RE.exec(text);
  if (range) {
    const from = Number(range[1]);
    const to = Number(range[2]);
    if (from < 1) return { error: `ending "${text}" should be numbered from 1` };
    if (to <= from) return { error: `ending "${text}" should go from a lower number to a higher one` };
    return { numbers: Array.from({ length: to - from + 1 }, (_, k) => from + k), label: `${from}.–${to}.` };
  }
  const numbers = text.split('.').filter(Boolean).map(Number);
  if (numbers.some((n) => n < 1)) return { error: `ending "${text}" should be numbered from 1` };
  if (numbers.some((n, k) => k > 0 && n <= numbers[k - 1]!)) return { error: `ending "${text}" should list its numbers in order` };
  return { numbers, label: numbers.map((n) => `${n}.`).join(', ') };
}

/** Classifies a word: ending, time signature, %, beat slashes, N.C., chord, or an invalid token (with its issue). */
function classifyWord(word: WordToken, issues: IssueList): ContentToken[] {
  const { text, span: s } = word;
  const attached = ATTACHED_BEATS_RE.exec(text);
  if (attached && !TIME_SIGNATURE_RE.test(text)) {
    // `C///`: shorthand for `C / / /`.
    const chordText = attached[1]!;
    const chordTokens = classifyWord({ kind: 'word', text: chordText, span: { ...s, length: chordText.length } }, issues);
    const beats = [...attached[2]!].map(
      (_, k): ContentToken => ({ kind: 'beat', text: '/', attached: true, span: { line: s.line, column: s.column + chordText.length + k, length: 1 } }),
    );
    return [...chordTokens, ...beats];
  }
  const prefixed = ENDING_RE.test(text) ? null : ENDING_PREFIX_RE.exec(text);
  if (prefixed) {
    // `1.Gm`: an ending stuck to its first chord.
    const numberText = prefixed[1]!;
    const rest: WordToken = {
      kind: 'word',
      text: prefixed[2]!,
      span: { line: s.line, column: s.column + numberText.length, length: s.length - numberText.length },
    };
    return [
      ...classifyWord({ kind: 'word', text: numberText, span: { ...s, length: numberText.length } }, issues),
      ...classifyWord(rest, issues),
    ];
  }

  if (ENDING_RE.test(text)) {
    const ending = readEnding(text);
    if ('numbers' in ending) return [{ kind: 'ending', numbers: ending.numbers, label: ending.label, text, span: s }];
    issues.error(s, text, ending.error);
    return [invalid(text, s)];
  }

  const time = TIME_SIGNATURE_RE.exec(text);
  if (time) {
    const upper = Number(time[1]);
    const lower = Number(time[2]);
    if (upper >= 1 && upper <= 32 && TIME_SIGNATURE_UNITS.has(lower)) {
      return [{ kind: 'time', timeSignature: { text, upper, lower }, text, span: s }];
    }
    issues.error(s, text, `unknown time signature "${text}"`);
    return [invalid(text, s)];
  }

  if (text === '%') return [{ kind: 'simile', text, span: s }];
  if (/^\/+$/.test(text)) {
    // `//` is `/ /`.
    return [...text].map((_, k): ContentToken => ({ kind: 'beat', text: '/', attached: false, span: { line: s.line, column: s.column + k, length: 1 } }));
  }
  if (NO_CHORD_RE.test(text)) return [{ kind: 'item', item: { kind: 'noChord', text, beats: 1, span: s } }];

  if (REPEAT_TIMES_RE.test(text)) {
    // `C G Am F x2`: not a bar; the repeat needs its sign.
    issues.warning(s, text, `"${text}" is ignored: a repeat count goes right after ":|"`);
    return [];
  }
  if (DASHES_RE.test(text)) {
    issues.error(s, text, `"${text}" isn't a bar line; use | between bars`);
  } else if (/^%%+$/.test(text)) {
    issues.error(s, text, `the two-bar repeat "${text}" isn't supported yet; write % % (a % in each bar)`);
  } else if (/^[A-G]/.test(text) && countOf(text, '(') > countOf(text, ')')) {
    issues.error(s, text, `chord "${text}" has no closing ")"`);
  } else if (text.startsWith('[')) {
    issues.error(s, text, `section "${text}" should be on its own line`);
  } else if (text === ':') {
    issues.error(s, text, 'stray ":" (repeat signs are "|:" and ":|")');
  } else {
    const symbol = readChordSymbol(text);
    if (symbol) return [{ kind: 'item', item: { kind: 'chord', text, chord: symbol.chord, name: symbol.name, beats: 1, span: s } }];
    issues.error(s, text, `unknown chord "${text}"`);
  }
  return [invalid(text, s)];
}

function classifyTokens(tokens: readonly (NoteToken | WordToken)[], issues: IssueList): ContentToken[] {
  return tokens.flatMap((t): ContentToken[] => (t.kind === 'note' ? [t] : classifyWord(t, issues)));
}

// ---------------------------------------------------------------------------
// Bars

/** A bar while its row is built: the bar plus what the song-level checks need. */
interface BarDraft {
  bar: Bar;
  ending: { numbers: number[]; label: string; text: string; span: SourceSpan } | null;
  /** The `|:` before the bar, for the unclosed repeat error. */
  startToken: BarLineToken | null;
  /** The `:|` after the bar. */
  endToken: BarLineToken | null;
}

function newDraft(firstSpan: SourceSpan): BarDraft {
  return {
    bar: {
      start: 'single',
      end: 'single',
      repeatTimes: null,
      timeSignature: null,
      ending: null,
      content: { kind: 'empty' },
      notes: [],
      span: firstSpan,
    },
    ending: null,
    startToken: null,
    endToken: null,
  };
}

/** The content of a bar from its items: a lone `%` is a repeat of the previous bar; a `%` among chords is an error. */
function barContent(items: BarItem[], similes: ReadonlySet<BarItem>, issues: IssueList): BarContent {
  if (items.length === 0) return { kind: 'empty' };
  const only = items[0]!;
  if (items.length === 1 && similes.has(only) && only.beats === 1) return { kind: 'repeatPrevious', span: only.span };
  for (const item of items) {
    if (similes.has(item)) issues.error(item.span, item.text, '"%" should be alone in its bar');
  }
  return { kind: 'items', items };
}

/** A bar from the tokens between two bar lines: ending and time signature first, then chords; notes anywhere. */
function barFromTokens(tokens: readonly ContentToken[], firstSpan: SourceSpan, issues: IssueList): BarDraft {
  const draft = newDraft(firstSpan);
  const items: BarItem[] = [];
  const similes = new Set<BarItem>();
  for (const token of tokens) {
    switch (token.kind) {
      case 'note':
        if (token.text) draft.bar.notes.push(token.text);
        break;
      case 'ending':
        if (items.length > 0) {
          issues.error(token.span, token.text, `ending "${token.text}" should come before the first chord of the bar`);
          items.push({ kind: 'invalid', text: token.text, beats: 1, span: token.span });
        } else if (draft.ending !== null) {
          issues.error(token.span, token.text, `bar has a second ending "${token.text}"`);
        } else {
          draft.ending = { numbers: token.numbers, label: token.label, text: token.text, span: token.span };
        }
        break;
      case 'time':
        if (items.length > 0) {
          issues.error(token.span, token.text, `time signature "${token.text}" should be at the start of the bar`);
          items.push({ kind: 'invalid', text: token.text, beats: 1, span: token.span });
        } else if (draft.bar.timeSignature !== null) {
          issues.error(token.span, token.text, `bar has a second time signature "${token.text}"`);
        } else {
          draft.bar.timeSignature = token.timeSignature;
        }
        break;
      case 'beat': {
        // Slashes at the start of a bar continue the previous chord.
        const last = items[items.length - 1];
        if (last) last.beats++;
        else items.push({ kind: 'continue', text: token.text, beats: 1, span: token.span });
        break;
      }
      case 'simile': {
        const item: BarItem = { kind: 'invalid', text: token.text, beats: 1, span: token.span };
        similes.add(item);
        items.push(item);
        break;
      }
      case 'item':
        items.push(token.item);
        break;
    }
  }
  draft.bar.content = barContent(items, similes, issues);
  return draft;
}

function tokenSpan(token: ContentToken): SourceSpan {
  return token.kind === 'item' ? token.item.span : token.span;
}

/** A line with no bar lines: each chord (or %, N.C.) is one bar. Endings and time signatures go with the next bar. */
function barsWithoutBarLines(tokens: readonly ContentToken[], issues: IssueList): { drafts: BarDraft[]; notes: string[] } {
  // Beat slashes written onto a chord (`C///`) stay in that chord's bar.
  const groups: ContentToken[][] = [];
  for (const token of tokens) {
    const group = groups[groups.length - 1];
    if (token.kind === 'beat' && token.attached && group) group.push(token);
    else groups.push([token]);
  }
  const drafts: BarDraft[] = [];
  let prefix: ContentToken[] = [];
  let pendingNotes: string[] = [];
  for (const group of groups) {
    const token = group[0]!;
    if (token.kind === 'ending' || token.kind === 'time') {
      prefix.push(token);
    } else if (token.kind === 'note') {
      const current = drafts[drafts.length - 1];
      if (!token.text) continue;
      if (current) current.bar.notes.push(token.text);
      else pendingNotes.push(token.text);
    } else {
      let content: ContentToken[] = group;
      if (token.kind === 'beat') {
        issues.error(token.span, token.text, 'beat slashes need bar lines around them: "| C / G |"');
        content = [invalid(token.text, token.span)];
      }
      const all = [...prefix, ...content];
      const draft = barFromTokens(all, tokenSpan(all[0]!), issues);
      draft.bar.notes.push(...pendingNotes);
      drafts.push(draft);
      prefix = [];
      pendingNotes = [];
    }
  }
  for (const token of prefix) {
    if (token.kind !== 'ending' && token.kind !== 'time') continue;
    const what = token.kind === 'ending' ? 'ending' : 'time signature';
    issues.error(token.span, token.text, `${what} "${token.text}" has no chord after it`);
  }
  return { drafts, notes: pendingNotes };
}

const END_STRENGTH: Record<BarEnd, number> = { single: 0, double: 1, final: 2, repeatEnd: 3 };

const BAR_LINE_END: Record<Exclude<BarLineText, '|:'>, BarEnd> = { '|': 'single', '||': 'double', '|.': 'final', ':|': 'repeatEnd' };

/**
 * Applies the bar lines between two bars (or at a row's ends) to them. Several
 * bar lines with nothing between them make one place (`:| |:`): the strongest
 * end sign closes the previous bar, and a `|:` opens the next one.
 */
function applyBarLines(
  run: readonly BarLineToken[],
  before: BarDraft | null,
  after: BarDraft | null,
  issues: IssueList,
): void {
  let end: BarEnd = 'single';
  let endToken: BarLineToken | null = null;
  let start: BarStart = 'single';
  let startToken: BarLineToken | null = null;
  for (const token of run) {
    if (token.text === '|:') {
      if (!after) issues.error(token.span, token.text, '"|:" should come before a bar');
      start = 'repeatStart';
      startToken ??= token;
      continue;
    }
    if (!before && token.text !== '|') {
      if (token.text === '||') {
        if (start === 'single') start = 'double';
      } else {
        issues.error(token.span, token.text, `"${token.text}" should come after a bar`);
      }
      continue;
    }
    const kind = BAR_LINE_END[token.text];
    if (END_STRENGTH[kind] >= END_STRENGTH[end]) {
      end = kind;
      endToken = token;
    }
  }
  if (before) {
    before.bar.end = end;
    if (end === 'repeatEnd') {
      before.bar.repeatTimes = endToken!.repeatTimes;
      before.endToken = endToken;
    }
  }
  if (after) {
    after.bar.start = start;
    after.startToken = startToken;
  }
}

/** Bars of a line with bar lines. Notes outside the bar lines go with the nearest bar. */
function barsWithBarLines(tokens: readonly LineToken[], issues: IssueList): { drafts: BarDraft[]; notes: string[] } {
  // Segments between bar lines: segments[i] sits between barLines[i - 1] and barLines[i].
  const segments: (NoteToken | WordToken)[][] = [[]];
  const barLines: BarLineToken[] = [];
  for (const token of tokens) {
    if (token.kind === 'barLine') {
      barLines.push(token);
      segments.push([]);
    } else {
      segments[segments.length - 1]!.push(token);
    }
  }

  const last = segments.length - 1;
  const bars: { draft: BarDraft; segment: number }[] = [];
  let leadingNotes: string[] = [];
  let trailingNotes: string[] = [];
  segments.forEach((segment, i) => {
    // Ignored tokens (a stray `x2`) leave nothing behind.
    const classified = classifyTokens(segment, issues);
    const notesOnly = classified.every((t) => t.kind === 'note');
    const outside = i === 0 || i === last;
    if (outside && notesOnly) {
      const notes = classified.map((t) => (t.kind === 'note' ? t.text : '')).filter(Boolean);
      if (i === 0) leadingNotes = notes;
      else trailingNotes = notes;
      return;
    }
    if (segment.length > 0 && classified.length === 0) return;
    // Two plain bar lines with nothing between them are an empty bar (`| |`); other bar lines with nothing between them are one place (`:| |:`).
    if (segment.length === 0 && !(barLines[i - 1]!.text === '|' && barLines[i]!.text === '|')) return;
    const firstSpan = segment[0]?.span ?? barLines[i - 1]!.span;
    bars.push({ draft: barFromTokens(classified, firstSpan, issues), segment: i });
  });

  // Bar lines between consecutive bars, and before the first and after the last.
  let prevSegment = 0;
  let prev: BarDraft | null = null;
  for (const { draft, segment } of bars) {
    applyBarLines(barLines.slice(prevSegment, segment), prev, draft, issues);
    prev = draft;
    prevSegment = segment;
  }
  applyBarLines(barLines.slice(prevSegment), prev, null, issues);

  const drafts = bars.map((b) => b.draft);
  const rowNotes: string[] = [];
  if (drafts.length > 0) {
    drafts[0]!.bar.notes.unshift(...leadingNotes);
    drafts[drafts.length - 1]!.bar.notes.push(...trailingNotes);
  } else {
    rowNotes.push(...leadingNotes, ...trailingNotes);
  }
  return { drafts, notes: rowNotes };
}

// ---------------------------------------------------------------------------
// Song-level rules: endings, repeats, %, the final bar line

interface PlacedDraft {
  draft: BarDraft;
  row: Row;
}

/** Ending brackets: from the bar with the number over the next bars of its row, until a bar line other than a single one or the next ending. */
function markEndings(placed: readonly PlacedDraft[], issues: IssueList): void {
  for (let g = 0; g < placed.length; g++) {
    const { draft, row } = placed[g]!;
    const ending = draft.ending;
    if (ending === null) continue;
    let last = g;
    while (true) {
      const cur = placed[last]!;
      const next = placed[last + 1];
      if (!next || next.row !== row || cur.draft.bar.end !== 'single' || next.draft.bar.start !== 'single' || next.draft.ending !== null) break;
      last++;
    }
    for (let k = g; k <= last; k++) {
      placed[k]!.draft.bar.ending = { numbers: ending.numbers, label: ending.label, isStart: k === g, isEnd: k === last };
    }
    const closesRepeat = placed[last]!.draft.bar.end === 'repeatEnd';
    const followsRepeat = g > 0 && placed[g - 1]!.draft.bar.end === 'repeatEnd';
    if (!closesRepeat && !followsRepeat) {
      issues.error(ending.span, ending.text, `ending "${ending.text}" is not in a repeat (end it with ":|", or put it after one)`);
    }
    g = last;
  }
}

function checkRepeats(placed: readonly PlacedDraft[], issues: IssueList): void {
  let open: BarLineToken | null = null;
  const unclosed = (token: BarLineToken) => issues.error(token.span, token.text, 'repeat "|:" is never closed with ":|"');
  for (const { draft } of placed) {
    if (draft.bar.start === 'repeatStart' && draft.startToken) {
      if (open) unclosed(open);
      open = draft.startToken;
    }
    if (draft.bar.end === 'repeatEnd' && draft.endToken) {
      if (open) open = null;
      else if (!draft.bar.ending) {
        issues.warning(draft.endToken.span, draft.endToken.text, '":|" has no "|:" before it, so it repeats from the start');
      }
    }
  }
  if (open) unclosed(open);
}

function checkSimiles(placed: readonly PlacedDraft[], issues: IssueList): void {
  const first = placed[0]?.draft.bar.content;
  if (first?.kind === 'repeatPrevious') issues.error(first.span, '%', '"%" has no bar before it to repeat');
}

/** Slashes at the start of a bar continue the previous chord, so there has to be one. */
function checkContinuations(placed: readonly PlacedDraft[], issues: IssueList): void {
  let chordBefore = false;
  for (const { draft } of placed) {
    const content = draft.bar.content;
    if (content.kind !== 'items') continue;
    for (const item of content.items) {
      if (item.kind === 'continue' && !chordBefore) issues.error(item.span, item.text, '"/" has no chord before it');
      if (item.kind === 'chord' || item.kind === 'noChord') chordBefore = true;
    }
  }
}

/** The song's last bar gets a final bar line, unless it ends a repeat. */
function finishSong(placed: readonly PlacedDraft[]): void {
  const last = placed[placed.length - 1]?.draft.bar;
  if (last && last.end !== 'repeatEnd') last.end = 'final';
}

// ---------------------------------------------------------------------------
// Lines

/** Lines of 3 or more words with no bar lines are lyrics or other text when most of their words aren't chords (or %, N.C., endings...). */
const TEXT_LINE_MIN_WORDS = 3;

/** The warning for a line read as lyrics or text: 'Line 3 is shown as a note because it looks like lyrics'. */
export const LYRIC_LINE_MESSAGE = 'is shown as a note because it looks like lyrics';

function isTextLine(tokens: readonly (NoteToken | WordToken)[]): boolean {
  const words = tokens.filter((t): t is WordToken => t.kind === 'word');
  if (words.length < TEXT_LINE_MIN_WORDS) return false;
  const scratch = new IssueList();
  const unreadable = words.filter((w) => classifyWord(w, scratch).some((t) => t.kind === 'item' && t.item.kind === 'invalid')).length;
  return unreadable * 2 > words.length;
}

/** Words that name a section, for lines like `Verse 1:` or `CHORUS` (any case; `Pre-Chorus` is `prechorus`). */
const SECTION_WORDS: ReadonlySet<string> = new Set([
  'intro', 'verse', 'prechorus', 'chorus', 'postchorus', 'refrain', 'bridge', 'interlude', 'instrumental',
  'solo', 'solos', 'break', 'breakdown', 'outro', 'coda', 'tag', 'hook', 'vamp', 'head',
]);
/** `Verse 1:` or `Intro: C G Am F`: a name of up to 3 words and a colon (not a `:|`), then maybe chords. */
const SECTION_COLON_RE = /^\s*([A-Za-z][\w'’-]*(?:[ \t]+[\w'’-]+){0,2}):(?!\|)(?=\s|$)/;
/** `(Chorus)`, `(Verse 2)`. */
const SECTION_PARENS_RE = /^\s*\(\s*([A-Za-z][\w'’-]*(?:[ \t]+[\w'’-]+){0,2})\s*\)\s*$/;
/** `CHORUS`, `Verse 1`, `Guitar Solo`. */
const SECTION_WORDS_RE = /^\s*([A-Za-z][\w'’-]*(?:[ \t]+[\w'’-]+){0,2})\s*$/;

/** A section name: has a section word, and no word of it reads as a chord (or %, N.C., an ending...). */
function isSectionName(name: string): boolean {
  const words = name.split(/\s+/);
  if (!words.some((w) => SECTION_WORDS.has(w.toLowerCase().replace(/[-'’]/g, '')))) return false;
  const scratch = new IssueList();
  return words.every((w) => classifyWord({ kind: 'word', text: w, span: span(1, 0, w.length) }, scratch).every((t) => t.kind === 'item' && t.item.kind === 'invalid'));
}

/**
 * A line written as a section the usual non-bracket ways. `label` is the
 * section part as typed; `rest` is the line with the label blanked out (so
 * columns stay right), or null when nothing follows it.
 */
function readSectionLikeLine(raw: string): { name: string; label: string; rest: string | null } | null {
  const colon = SECTION_COLON_RE.exec(raw);
  if (colon) {
    const name = colon[1]!.trim();
    if (!isSectionName(name)) return null;
    const end = colon[0].length;
    const rest = raw.slice(end);
    return { name, label: raw.slice(0, end).trim(), rest: rest.trim() ? ' '.repeat(end) + rest : null };
  }
  const match = SECTION_PARENS_RE.exec(raw) ?? SECTION_WORDS_RE.exec(raw);
  if (!match || !isSectionName(match[1]!)) return null;
  return { name: match[1]!.trim(), label: raw.trim(), rest: null };
}

/**
 * Parses a song. The text may start with `Title:` and `Artist:` lines (a full
 * file); in the app the editor holds the body only, and line numbers in issues
 * are lines of the given text.
 */
export function parseSheet(text: string): SheetParseResult {
  const issues = new IssueList();
  const song: Song = { title: '', artist: '', sections: [] };
  const placed: PlacedDraft[] = [];
  let section: Section | null = null;
  let inHeader = true;
  let blankBefore = false;

  const currentSection = (): Section => {
    if (!section) {
      section = { name: null, rows: [], line: null };
      song.sections.push(section);
    }
    return section;
  };

  text.split(/\r\n|\r|\n/).forEach((typedLine, index) => {
    const line = index + 1;
    let raw = typedLine;
    let trimmed = raw.trim();
    if (trimmed === '') {
      blankBefore = true;
      return;
    }

    const header = readHeaderLine(raw);
    if (header) {
      if (inHeader) song[header.field] = header.value;
      else {
        const label = raw.slice(0, raw.indexOf(':') + 1).trim();
        issues.error(span(line, raw.indexOf(label), label.length), label, `header line "${label}" should be at the top`);
      }
      return;
    }
    inHeader = false;

    const sectionMatch = SECTION_LINE_RE.exec(trimmed);
    if (sectionMatch) {
      let name = sectionMatch[1]!.trim();
      const suffix = sectionMatch[2]!.trim();
      const labelSuffix = SECTION_SUFFIX_RE.test(suffix);
      if (labelSuffix) name = `${name} ${suffix.replace(/^"|"$/g, '')}`.trim();
      if (!name) issues.warning(span(line, raw.indexOf('['), trimmed.length), trimmed, 'section has no name');
      section = { name: name || null, rows: [], line };
      song.sections.push(section);
      blankBefore = false;
      if (!suffix || labelSuffix) return;
      // `[Intro] C G Am F`: chords after the name are the section's first row.
      const end = raw.indexOf(']') + 1;
      raw = ' '.repeat(end) + raw.slice(end);
      trimmed = raw.trim();
    }

    // `Verse 1:`, `(Chorus)`, `CHORUS`, `Intro: C G Am F`: a section, with a hint; chords after the label are its first row.
    const sectionLike = readSectionLikeLine(raw);
    if (sectionLike) {
      const first = raw.length - raw.trimStart().length;
      issues.lineWarning(
        span(line, first, sectionLike.label.length),
        sectionLike.label,
        `is read as the section "${sectionLike.name}"; write [${sectionLike.name}] for a section`,
      );
      section = { name: sectionLike.name, rows: [], line };
      song.sections.push(section);
      blankBefore = false;
      if (sectionLike.rest === null) return;
      raw = sectionLike.rest;
      trimmed = raw.trim();
    }

    const target = currentSection();
    const spaceBefore = blankBefore && target.rows.length > 0;
    blankBefore = false;
    const tokens = tokenizeLine(raw, line, issues);

    // A line of notes only goes under the previous row of the section.
    const addNotes = (notes: RowNote[]) => {
      const prevRow = target.rows[target.rows.length - 1];
      if (prevRow) prevRow.notes.push(...notes);
      else if (notes.length > 0) target.rows.push({ bars: [], notes, spaceBefore, line });
    };
    if (tokens.every((t) => t.kind === 'note')) {
      addNotes(tokens.filter((t) => t.text).map((t) => ({ text: t.text, fromTextLine: false })));
      return;
    }

    let result: { drafts: BarDraft[]; notes: string[] };
    if (tokens.some((t) => t.kind === 'barLine')) {
      result = barsWithBarLines(tokens, issues);
    } else {
      const words = tokens as (NoteToken | WordToken)[];
      const lineIssues = new IssueList();
      const classified = classifyTokens(words, lineIssues);
      if (isTextLine(words)) {
        const text = trimmed.replace(/\s+/g, ' ');
        const first = raw.length - raw.trimStart().length;
        issues.lineWarning(span(line, first, trimmed.length), trimmed, LYRIC_LINE_MESSAGE);
        addNotes([{ text, fromTextLine: true }]);
        return;
      }
      issues.addAll(lineIssues);
      result = barsWithoutBarLines(classified, issues);
    }
    const { drafts, notes } = result;
    if (drafts.length === 0 && notes.length === 0) return;
    const row: Row = { bars: drafts.map((d) => d.bar), notes: notes.map((text) => ({ text, fromTextLine: false })), spaceBefore, line };
    target.rows.push(row);
    for (const draft of drafts) placed.push({ draft, row });
  });

  markEndings(placed, issues);
  checkRepeats(placed, issues);
  checkSimiles(placed, issues);
  checkContinuations(placed, issues);
  finishSong(placed);
  return { song, issues: issues.sorted() };
}
