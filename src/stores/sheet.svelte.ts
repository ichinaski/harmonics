// The Sheet tab's song: Title, Artist, the editor's body and the layout
// (bars per row, Fit to). The song lives in the URL
// (#/sheet?s=1.<data>&b=6&f=1, see sheet/url.ts; `b` and `f` are left
// out at their defaults, as typed and off, so a link without them opens with
// the defaults; an older link's b=4, 6 or 8, which wrapped rows at that many
// bars, now reflows them into rows of that many, and its `z`, a text size
// from before the app chose the sheet's size, is ignored):
// typing updates the address bar about 500 ms after the last change with
// history.replaceState, so there's no history spam, a reload keeps the work
// and a bookmark is a saved song. When the page is hidden or left, a pending
// update is written at once, uncompressed (`0.`), so a closed tab doesn't
// lose the last edits. Opening a link loads its song.
// The last edited song and the layout are also kept in localStorage. It's
// one "last song", not a library. A bare #/sheet (no song in it) keeps the
// song of this visit (the tab link); on a new visit the sheet starts empty
// and the empty state offers to continue the last song, which loads only
// when that's clicked. A browser reload goes to the address the page had
// before it was left (Chrome ignores replaceState during pagehide), so the
// saved song also records the link it was edited from: reloading that link
// restores the newer local copy. A bare #/sheet never loads a song by itself.
// New, Load example, Open file and pasting a full song act at once; Undo
// (offered in a toast, see undoNotice) brings back the song, its layout and
// its link.

import { canonicalHash, resolveRoute, sheetEditorHash, sheetParam, SHEET_EDITOR_PATH, type SheetLinkLayout } from '../routes';
import { SHEET_FIT_PAGES, type SheetFitPages } from '../sheet/fit';
import { parseSheet } from '../sheet/parse';
import type { SheetParseResult } from '../sheet/model';
import { SHEET_BARS_PER_ROW, type SheetBarsPerRow } from '../sheet/render';
import {
  composeSheetText,
  hasHeaderLines,
  isEmptySheetText,
  normalizeLineBreaks,
  sheetFileName,
  splitSheetText,
  takeHeaderLines,
  type SheetText,
} from '../sheet/text';
import { decodeSheetText, encodeSheetText, encodeSheetTextPlain } from '../sheet/url';
import { sheetLink } from './sheetLink.svelte';

/** Delay between the last edit and the address bar update. */
export const URL_UPDATE_DELAY_MS = 500;

/** Larger files are not songs; reading them would only freeze the page. */
export const MAX_SHEET_FILE_BYTES = 1_000_000;

/** localStorage keys: the last edited song (full text, with header lines) and the layout settings. */
export const LAST_SONG_STORAGE_KEY = 'harmonics.sheet.lastSong';
/** The `s` value of the address bar the last song was saved with: a reload of that link restores the saved song. */
export const LAST_SONG_LINK_STORAGE_KEY = 'harmonics.sheet.lastSongLink';
export const BARS_PER_ROW_STORAGE_KEY = 'harmonics.sheet.barsPerRow';
export const FIT_PAGES_STORAGE_KEY = 'harmonics.sheet.fitPages';
/** The last song's own layout, `<bars per row>,<fit pages>`, so Continue last song brings it back too. */
export const LAST_SONG_LAYOUT_STORAGE_KEY = 'harmonics.sheet.lastSongLayout';

export const DEFAULT_BARS_PER_ROW: SheetBarsPerRow = 'typed';
export const DEFAULT_FIT_PAGES: SheetFitPages = 0;

/** Bars per row in the link (`b=4`, `b=6`, `b=8`; none for as typed) and in localStorage (also `typed`). */
function barsPerRowFrom(value: string | null): SheetBarsPerRow | null {
  return SHEET_BARS_PER_ROW.find((bars) => String(bars) === value) ?? null;
}

/** Fit to in the link and in localStorage: `f=0` (off), `f=1`, `f=2` pages. */
function fitPagesFrom(value: string | null): SheetFitPages | null {
  return SHEET_FIT_PAGES.find((pages) => String(pages) === value) ?? null;
}

export type SheetStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** What the store needs from the browser; tests pass their own. */
export interface SheetStoreEnv {
  /** location.hash */
  getHash(): string;
  /** history.replaceState with this hash. */
  replaceHash(hash: string): void;
  /** location.href; Copy link keeps the part before the hash. */
  href(): string;
  /** Called during the click, so a text still being worked out (Copy link's) keeps the click's permission to write. */
  writeClipboard(text: string | Promise<string>): Promise<void>;
  /** Saves a text file. */
  download(fileName: string, text: string): void;
  /** localStorage, or undefined where it isn't available. */
  storage: SheetStorage | undefined;
}

export type OpenFileResult = { ok: true } | { ok: false; error: string };

/** The last song kept in the browser, offered by the empty state ("Continue last song: <title>"). */
export interface LastSongOffer {
  /** '' when the song has no title. */
  title: string;
}

/** The toast after New, Load example, Open file or a pasted song: "Sheet cleared. Undo". */
export interface UndoNotice {
  message: string;
  /** Changes with every notice, so the view restarts its timer. */
  id: number;
}

/** Everything Undo puts back: the song, its layout, its link and what was kept in localStorage. */
interface SheetSnapshot {
  text: SheetText;
  barsPerRow: SheetBarsPerRow;
  fitPages: SheetFitPages;
  lastSong: LastSongOffer | null;
  songUnsaved: boolean;
  stored: Record<string, string | null>;
}

const SNAPSHOT_STORAGE_KEYS = [
  LAST_SONG_STORAGE_KEY,
  LAST_SONG_LINK_STORAGE_KEY,
  LAST_SONG_LAYOUT_STORAGE_KEY,
  BARS_PER_ROW_STORAGE_KEY,
  FIT_PAGES_STORAGE_KEY,
];

const EMPTY_SHEET_TEXT: SheetText = { title: '', artist: '', body: '' };

export class SheetStore {
  title = $state('');
  artist = $state('');
  body = $state('');
  /** Set when the link's song couldn't be read; cleared by the next edit or load. */
  linkError = $state<string | null>(null);
  /** Rows as typed, or reflowed into rows of 4, 6 or 8 bars. In the link (when not as typed) and remembered locally when chosen. */
  barsPerRow = $state<SheetBarsPerRow>(DEFAULT_BARS_PER_ROW);
  /** Fit to: shrink the sheet to print on this many pages (0 = off). In the link (when on) and remembered locally when chosen. */
  fitPages = $state<SheetFitPages>(DEFAULT_FIT_PAGES);
  /** The editor hash with the current song, for the Sheet tab link: '#/sheet?s=1.abc&b=6'. */
  editorHash = $state(sheetEditorHash(''));
  /** The empty sheet's "Continue last song" offer: set on a new visit's bare #/sheet and after New, cleared by the next edit or load. */
  lastSong = $state<LastSongOffer | null>(null);
  /** The Undo toast's message, while the last New, Load example, Open file or paste can be undone. */
  undoNotice = $state<UndoNotice | null>(null);
  /** The parsed body. Its title and artist come from the fields, falling back to header lines in the body. */
  readonly sheet: SheetParseResult = $derived.by(() => {
    const result = parseSheet(this.body);
    const title = this.title.trim() || result.song.title;
    const artist = this.artist.trim() || result.song.artist;
    return { ...result, song: { ...result.song, title, artist } };
  });

  readonly #env: SheetStoreEnv;
  #timer: ReturnType<typeof setTimeout> | undefined;
  /** The `s` value of the song in the address bar (or about to be). */
  #encoded = '';
  #urlVersion = 0;
  #editVersion = 0;
  /** The address bar is behind the song or the layout (an update is pending or under way). */
  #urlStale = false;
  /** The song was edited since it was last saved to localStorage. */
  #songUnsaved = false;
  /** What Undo restores, while undoNotice is shown. */
  #undo: SheetSnapshot | null = null;
  #undoNoticeId = 0;

  constructor(env: SheetStoreEnv) {
    this.#env = env;
    this.barsPerRow = barsPerRowFrom(this.#read(BARS_PER_ROW_STORAGE_KEY)) ?? DEFAULT_BARS_PER_ROW;
    this.fitPages = fitPagesFrom(this.#read(FIT_PAGES_STORAGE_KEY)) ?? DEFAULT_FIT_PAGES;
  }

  get text(): SheetText {
    return { title: this.title, artist: this.artist, body: this.body };
  }

  /** Header lines plus body, as copied, downloaded and stored in the URL. */
  get fullText(): string {
    return composeSheetText(this.text);
  }

  get isEmpty(): boolean {
    return isEmptySheetText(this.text);
  }

  setTitle(title: string): void {
    this.dismissUndo();
    this.title = title;
    this.#edited();
  }

  setArtist(artist: string): void {
    this.dismissUndo();
    this.artist = artist;
    this.#edited();
  }

  /** Sets the editor's text. Finished `Title:` and `Artist:` lines typed at its top move into the fields. */
  setBody(body: string): void {
    this.dismissUndo();
    const header = takeHeaderLines(body);
    if (header) {
      if (header.title !== undefined) this.title = header.title;
      if (header.artist !== undefined) this.artist = header.artist;
      this.body = header.body;
    } else {
      this.body = body;
    }
    this.#edited();
  }

  /** The bars per row buttons: remembered locally and written into the link. */
  setBarsPerRow(bars: SheetBarsPerRow): void {
    this.barsPerRow = bars;
    this.#write(BARS_PER_ROW_STORAGE_KEY, String(bars));
    this.#saveLayout();
    this.#scheduleUrl();
  }

  /** The Fit to buttons: remembered locally and written into the link. */
  setFitPages(pages: SheetFitPages): void {
    this.fitPages = pages;
    this.#write(FIT_PAGES_STORAGE_KEY, String(pages));
    this.#saveLayout();
    this.#scheduleUrl();
  }

  /**
   * Replaces the whole song at once (Open file, Load example, pasting a full
   * song) and offers to undo it with `message` ("Example loaded").
   */
  replaceSong(next: SheetText, message: string): void {
    this.#keepForUndo(message);
    this.#set(next);
    this.#edited();
  }

  /**
   * Handles a paste into the editor: a text that starts with header lines is
   * a full song and replaces the current one (with Undo). Returns true when it
   * was handled that way, so the view prevents the normal paste.
   */
  pasteSong(pasted: string): boolean {
    if (!hasHeaderLines(pasted)) return false;
    this.replaceSong(splitSheetText(pasted), 'Song pasted');
    return true;
  }

  /**
   * New: clears title, artist and chords, puts Bars per row and Fit to back
   * to their defaults and the address bar to a bare #/sheet, with Undo. The
   * song is saved locally first (if it had unsaved edits), so the empty sheet
   * offers to continue it until something new is typed.
   */
  newSheet(): void {
    this.#saveSong(this.fullText, this.#encoded);
    this.#keepForUndo('Sheet cleared');
    this.#cancelUrlUpdate();
    this.#editVersion++;
    this.#set(EMPTY_SHEET_TEXT);
    this.linkError = null;
    this.barsPerRow = DEFAULT_BARS_PER_ROW;
    this.fitPages = DEFAULT_FIT_PAGES;
    this.#write(BARS_PER_ROW_STORAGE_KEY, String(DEFAULT_BARS_PER_ROW));
    this.#write(FIT_PAGES_STORAGE_KEY, String(DEFAULT_FIT_PAGES));
    this.lastSong = this.#lastSongOffer();
    this.#writeUrl('');
  }

  /** The toast's Undo: brings back the song, its layout and its link as they were before the last New, Load example, Open file or paste. */
  async undo(): Promise<void> {
    const snapshot = this.#undo;
    if (!snapshot) return;
    this.dismissUndo();
    this.#cancelUrlUpdate();
    this.#editVersion++;
    this.#set(snapshot.text);
    this.linkError = null;
    this.barsPerRow = snapshot.barsPerRow;
    this.fitPages = snapshot.fitPages;
    this.lastSong = snapshot.lastSong;
    for (const [key, value] of Object.entries(snapshot.stored)) this.#write(key, value);
    this.#songUnsaved = snapshot.songUnsaved;
    await this.flushUrl();
  }

  /** The toast timed out, or the song was edited since: Undo is no longer offered. */
  dismissUndo(): void {
    this.#undo = null;
    this.undoNotice = null;
  }

  /** The empty state's "Continue last song": loads the last song kept in the browser. */
  async continueLastSong(): Promise<void> {
    const saved = this.#read(LAST_SONG_STORAGE_KEY);
    this.lastSong = null;
    if (saved === null) return;
    this.dismissUndo();
    this.#cancelUrlUpdate();
    this.#editVersion++;
    this.#set(splitSheetText(saved));
    const [bars, pages] = (this.#read(LAST_SONG_LAYOUT_STORAGE_KEY) ?? '').split(',');
    const savedBars = barsPerRowFrom(bars ?? null);
    const savedPages = fitPagesFrom(pages ?? null);
    if (savedBars !== null) {
      this.barsPerRow = savedBars;
      this.#write(BARS_PER_ROW_STORAGE_KEY, String(savedBars));
    }
    if (savedPages !== null) {
      this.fitPages = savedPages;
      this.#write(FIT_PAGES_STORAGE_KEY, String(savedPages));
    }
    this.linkError = null;
    await this.flushUrl();
  }

  /** Open file: reads a text file and replaces the song, with Undo ("Opened autumn-leaves.txt"). */
  async openFile(file: Blob & { name?: string }): Promise<OpenFileResult> {
    if (file.size > MAX_SHEET_FILE_BYTES) return { ok: false, error: 'This file is too big for a song (over 1 MB).' };
    let text: string;
    try {
      text = await file.text();
    } catch {
      return { ok: false, error: 'This file couldn’t be read.' };
    }
    this.replaceSong(splitSheetText(text), file.name ? `Opened ${file.name}` : 'File opened');
    return { ok: true };
  }

  /** Copy text: the full text with header lines. Resolves false if the clipboard refused. */
  async copyText(): Promise<boolean> {
    return this.#copy(this.fullText);
  }

  /**
   * Copy link: the link to the song and layout as they are at the click
   * (never behind a pending address bar update); the address bar is brought
   * up to date too.
   */
  async copyLink(): Promise<boolean> {
    const text = this.fullText;
    const empty = this.isEmpty;
    const layout = this.#linkLayout();
    const base = this.#env.href().split('#')[0]!;
    const link = (empty ? Promise.resolve('') : encodeSheetText(text)).then((encoded) => base + sheetEditorHash(encoded, layout));
    void this.flushUrl();
    return this.#copy(link);
  }

  /** Download: `<title>.txt` (song.txt without a title) with the full text. */
  download(): void {
    const text = this.fullText;
    this.#env.download(sheetFileName(this.title), text.endsWith('\n') || text === '' ? text : `${text}\n`);
  }

  /**
   * Loads the song of a Sheet editor hash, on start and on hashchange, and its
   * layout: a link with a song and without `b` or `f` has the defaults for
   * them (bars as typed, Fit to off); an older link's `z` is ignored. A hash
   * without a song (the tab link, a bookmark of #/sheet) keeps the song of
   * this visit and puts it back in the address bar; with no song yet (a new
   * visit) the sheet stays empty and offers the last song kept in
   * localStorage (lastSong), without loading it. A damaged link sets
   * linkError and keeps the current song.
   */
  async loadFromHash(hash: string): Promise<void> {
    const encoded = sheetParam(hash);
    if (encoded) {
      this.barsPerRow = barsPerRowFrom(sheetParam(hash, 'b')) ?? DEFAULT_BARS_PER_ROW;
      this.fitPages = fitPagesFrom(sheetParam(hash, 'f')) ?? DEFAULT_FIT_PAGES;
    }
    if (!encoded) {
      if (this.isEmpty) this.lastSong = this.#lastSongOffer();
      else await this.flushUrl();
      return;
    }
    if (encoded === this.#encoded) {
      this.#setEditorHash(sheetEditorHash(encoded, this.#linkLayout()));
      return;
    }
    const saved = this.#read(LAST_SONG_STORAGE_KEY);
    if (saved !== null && this.#read(LAST_SONG_LINK_STORAGE_KEY) === encoded) {
      // A reload right after typing: the link is older than the song saved with it.
      this.dismissUndo();
      this.#set(splitSheetText(saved));
      this.linkError = null;
      this.lastSong = null;
      await this.flushUrl();
      return;
    }
    const editVersion = this.#editVersion;
    const result = await decodeSheetText(encoded);
    // Typing while the link was read wins over the link.
    if (editVersion !== this.#editVersion) return;
    if (!result.ok) {
      this.linkError = result.error;
      return;
    }
    // The link's song replaces any pending address bar update.
    this.#cancelUrlUpdate();
    this.#urlStale = false;
    this.dismissUndo();
    this.#set(splitSheetText(result.text));
    this.linkError = null;
    this.lastSong = null;
    this.#encoded = encoded;
    this.#setEditorHash(sheetEditorHash(encoded, this.#linkLayout()));
  }

  /** Writes the current song to the address bar now (pending debounced updates included). */
  async flushUrl(): Promise<void> {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    const version = ++this.#urlVersion;
    const text = this.fullText;
    const encoded = this.isEmpty ? '' : await encodeSheetText(text);
    if (version !== this.#urlVersion) return;
    this.#saveSong(text, encoded);
    this.#writeUrl(encoded);
  }

  /**
   * Writes a pending address bar update at once, uncompressed, and saves the
   * song locally: for `pagehide` and `visibilitychange`, when there's no time
   * to wait for the compressed form.
   */
  flushUrlNow(): void {
    if (!this.#urlStale) return;
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#urlVersion++;
    const text = this.fullText;
    // A reload goes to the address bar as it is now, not as written below.
    this.#saveSong(text, this.#encoded);
    this.#writeUrl(this.isEmpty ? '' : encodeSheetTextPlain(text));
  }

  #writeUrl(encoded: string): void {
    this.#urlStale = false;
    this.#encoded = encoded;
    this.#setEditorHash(sheetEditorHash(encoded, this.#linkLayout()));
    const current = this.#env.getHash();
    // Only on the editor: leaving the tab during the delay must not pull the address bar back.
    if (resolveRoute(current).path === SHEET_EDITOR_PATH && canonicalHash(current) !== this.editorHash) {
      this.#env.replaceHash(this.editorHash);
    }
  }

  /** The layout part of the link; bars per row and Fit to only when they aren't the defaults. */
  #linkLayout(): SheetLinkLayout {
    return {
      b: this.barsPerRow === DEFAULT_BARS_PER_ROW ? undefined : String(this.barsPerRow),
      f: this.fitPages === DEFAULT_FIT_PAGES ? undefined : String(this.fitPages),
    };
  }

  /** Drops a pending or running address bar update. */
  #cancelUrlUpdate(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#urlVersion++;
  }

  #keepForUndo(message: string): void {
    this.#undo = {
      text: this.text,
      barsPerRow: this.barsPerRow,
      fitPages: this.fitPages,
      lastSong: this.lastSong,
      songUnsaved: this.#songUnsaved,
      stored: Object.fromEntries(SNAPSHOT_STORAGE_KEYS.map((key) => [key, this.#read(key)])),
    };
    this.undoNotice = { message, id: ++this.#undoNoticeId };
  }

  /** The offer for the last song kept in localStorage, if there's one. */
  #lastSongOffer(): LastSongOffer | null {
    const saved = this.#read(LAST_SONG_STORAGE_KEY);
    return saved === null ? null : { title: splitSheetText(saved).title.trim() };
  }

  #setEditorHash(hash: string): void {
    this.editorHash = hash;
    sheetLink.hash = hash;
  }

  /**
   * Keeps the last edited song in localStorage with the `s` value of the link
   * a reload would open. An emptied song keeps the stored one (the next new
   * visit offers it) and clears only the link.
   */
  #saveSong(text: string, link: string): void {
    if (!this.#songUnsaved) return;
    this.#songUnsaved = false;
    if (!this.isEmpty) this.#write(LAST_SONG_STORAGE_KEY, text);
    this.#write(LAST_SONG_LINK_STORAGE_KEY, this.isEmpty || !link ? null : link);
    this.#saveLayout();
  }

  /** Keeps the layout with the last song (not for an empty sheet, which keeps the stored one). */
  #saveLayout(): void {
    if (!this.isEmpty) this.#write(LAST_SONG_LAYOUT_STORAGE_KEY, `${this.barsPerRow},${this.fitPages}`);
  }

  #read(key: string): string | null {
    try {
      return this.#env.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  #write(key: string, value: string | null): void {
    try {
      if (value === null) this.#env.storage?.removeItem(key);
      else this.#env.storage?.setItem(key, value);
    } catch {
      // Private mode or storage full: the URL still has the song.
    }
  }

  #set(next: SheetText): void {
    this.title = next.title;
    this.artist = next.artist;
    this.body = normalizeLineBreaks(next.body);
  }

  #edited(): void {
    this.#editVersion++;
    this.#songUnsaved = true;
    this.linkError = null;
    this.lastSong = null;
    this.#scheduleUrl();
  }

  #scheduleUrl(): void {
    this.#urlStale = true;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.flushUrl(), URL_UPDATE_DELAY_MS);
  }

  async #copy(text: string | Promise<string>): Promise<boolean> {
    try {
      await this.#env.writeClipboard(text);
      return true;
    } catch {
      return false;
    }
  }
}

function downloadInBrowser(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const browserEnv: SheetStoreEnv = {
  getHash: () => location.hash,
  replaceHash: (hash) => history.replaceState(null, '', hash),
  href: () => location.href,
  writeClipboard: async (text) => {
    if (!navigator.clipboard) throw new Error('No clipboard');
    if (typeof text !== 'string' && typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
      // Safari only allows a write that starts during the click; the item's text can come later.
      try {
        const blob = text.then((t) => new Blob([t], { type: 'text/plain' }));
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
        return;
      } catch {
        // Fall back to a plain text write below.
      }
    }
    await navigator.clipboard.writeText(await text);
  },
  download: downloadInBrowser,
  storage: (() => {
    try {
      return typeof window === 'undefined' ? undefined : window.localStorage;
    } catch {
      return undefined;
    }
  })(),
};

export const sheet = new SheetStore(browserEnv);

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => sheet.flushUrlNow());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sheet.flushUrlNow();
  });
}
