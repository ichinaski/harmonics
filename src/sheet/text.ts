// The song as text: `Title:` and `Artist:` header lines on top of the body.
// In the app the header lines are two fields; they're written into the text
// for Copy text, Download and the URL, and read back on Open file and paste.

export interface SheetText {
  title: string;
  artist: string;
  /** The editor's text: sections, rows and notes. */
  body: string;
}

export const EMPTY_SHEET_TEXT: SheetText = { title: '', artist: '', body: '' };

/** A `Title:` or `Artist:` line (any case, spaces allowed around the colon). */
export const HEADER_LINE_RE = /^\s*(title|artist)\s*:(.*)$/i;

export type HeaderField = 'title' | 'artist';

/** The field and value of a header line, or null for any other line. */
export function readHeaderLine(line: string): { field: HeaderField; value: string } | null {
  const m = HEADER_LINE_RE.exec(line);
  if (!m) return null;
  return { field: m[1]!.toLowerCase() as HeaderField, value: m[2]!.trim() };
}

/** One line, for a header value: line breaks become spaces. */
function oneLine(value: string): string {
  return value.replace(/\s*[\r\n]+\s*/g, ' ').trim();
}

/** The full text: header lines (only the ones with a value), a blank line, then the body. */
export function composeSheetText(song: SheetText): string {
  const header: string[] = [];
  const title = oneLine(song.title);
  const artist = oneLine(song.artist);
  if (title) header.push(`Title: ${title}`);
  if (artist) header.push(`Artist: ${artist}`);
  if (header.length === 0) return song.body;
  return song.body ? `${header.join('\n')}\n\n${song.body}` : header.join('\n');
}

/** Line breaks as `\n`, for text from files and the clipboard. */
export function normalizeLineBreaks(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/**
 * Splits a full text into header and body: the `Title:` and `Artist:` lines
 * at the top (blank lines between them allowed) and the rest. The blank lines
 * after the header are dropped from the body. A text without header lines is
 * all body.
 */
export function splitSheetText(text: string): SheetText {
  const lines = normalizeLineBreaks(text).split('\n');
  let title = '';
  let artist = '';
  let found = false;
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === '') continue;
    const header = readHeaderLine(line);
    if (!header) break;
    found = true;
    if (header.field === 'title') title = header.value;
    else artist = header.value;
  }
  if (!found) return { title: '', artist: '', body: normalizeLineBreaks(text) };
  return { title, artist, body: lines.slice(i).join('\n') };
}

/**
 * Takes finished `Title:` and `Artist:` lines (ended by a line break) off the
 * top of the editor's text, as they're typed: the fields they set and the
 * rest of the text, without the blank lines after them. Null when the text
 * doesn't start with one. A header line still being typed (no line break
 * after it yet) stays in the text.
 */
export function takeHeaderLines(body: string): { title?: string; artist?: string; body: string } | null {
  const lines = body.split('\n');
  const fields: { title?: string; artist?: string } = {};
  let taken = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i]!;
    if (line.trim() === '') continue;
    const header = readHeaderLine(line);
    if (!header) break;
    fields[header.field] = header.value;
    taken = i + 1;
  }
  if (taken === 0) return null;
  let rest = lines.slice(taken);
  while (rest.length > 1 && rest[0]!.trim() === '') rest = rest.slice(1);
  if (rest.length === 1 && rest[0]!.trim() === '') rest = [];
  return { ...fields, body: rest.join('\n') };
}

/** True when the text starts with header lines, so it's a full song (used on paste). */
export function hasHeaderLines(text: string): boolean {
  for (const line of normalizeLineBreaks(text).split('\n')) {
    if (line.trim() === '') continue;
    return readHeaderLine(line) !== null;
  }
  return false;
}

export function isEmptySheetText(song: SheetText): boolean {
  return song.title.trim() === '' && song.artist.trim() === '' && song.body.trim() === '';
}

/**
 * Download file name from the title: 'Autumn Leaves' → 'autumn-leaves.txt'.
 * Accents are dropped, other letters and digits kept; 'song.txt' without a title.
 */
export function sheetFileName(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
  return `${slug || 'song'}.txt`;
}
