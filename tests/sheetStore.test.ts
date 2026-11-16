import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeSheetText, encodeSheetText } from '../src/sheet/url';
import {
  LAST_SONG_LINK_STORAGE_KEY,
  LAST_SONG_STORAGE_KEY,
  SheetStore,
  BARS_PER_ROW_STORAGE_KEY,
  FIT_PAGES_STORAGE_KEY,
  URL_UPDATE_DELAY_MS,
  type SheetStoreEnv,
} from '../src/stores/sheet.svelte';

function fakeStorage(entries: Record<string, string> = {}) {
  const map = new Map(Object.entries(entries));
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

function fakeEnv(hash = '#/sheet', storage = fakeStorage()) {
  const env = {
    hash,
    replaced: [] as string[],
    clipboard: [] as string[],
    downloads: [] as [string, string][],
    clipboardFails: false,
  };
  const api: SheetStoreEnv = {
    getHash: () => env.hash,
    replaceHash: (h) => {
      env.hash = h;
      env.replaced.push(h);
    },
    href: () => `https://example.test/harmonics/${env.hash}`,
    writeClipboard: async (text) => {
      if (env.clipboardFails) throw new Error('denied');
      env.clipboard.push(await text);
    },
    download: (name, text) => void env.downloads.push([name, text]),
    storage,
  };
  return { env, storage: storage.map, store: new SheetStore(api) };
}

/** The song text in the fake address bar. */
async function songInHash(hash: string): Promise<string> {
  const s = new URLSearchParams(hash.split('?')[1] ?? '').get('s');
  if (!s) return '';
  const result = await decodeSheetText(s);
  if (!result.ok) throw new Error(result.error);
  return result.text;
}

describe('SheetStore address bar updates', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes the song about 500 ms after the last edit, once', async () => {
    const { env, store } = fakeEnv();
    store.setTitle('Blues');
    store.setBody('C F');
    vi.advanceTimersByTime(URL_UPDATE_DELAY_MS - 1);
    store.setBody('C F G');
    vi.advanceTimersByTime(URL_UPDATE_DELAY_MS - 1);
    expect(env.replaced).toEqual([]);
    vi.advanceTimersByTime(1);
    await vi.waitFor(() => expect(env.replaced).toHaveLength(1));
    expect(env.hash).toMatch(/^#\/sheet\?s=1\./);
    expect(await songInHash(env.hash)).toBe('Title: Blues\n\nC F G');
    expect(store.editorHash).toBe(env.hash);
  });

  it('clears the song from the address bar when the song is emptied', async () => {
    const { env, store } = fakeEnv();
    store.setBody('C');
    await store.flushUrl();
    store.setBody('');
    await store.flushUrl();
    expect(env.hash).toBe('#/sheet');
  });

  it('leaves the address bar alone after leaving the editor', async () => {
    const { env, store } = fakeEnv();
    store.setBody('C');
    env.hash = '#/key';
    vi.advanceTimersByTime(URL_UPDATE_DELAY_MS);
    await store.flushUrl();
    expect(env.replaced).toEqual([]);
    expect(store.editorHash).toMatch(/^#\/sheet\?s=1\./);
  });
});

describe('SheetStore links', () => {
  it('loads the song of a link into the fields and editor', async () => {
    const { env, store } = fakeEnv();
    const hash = `#/sheet?s=${await encodeSheetText('Title: Autumn Leaves\nArtist: Joseph Kosma\n\n| Cm7 | F7 |')}`;
    env.hash = hash;
    await store.loadFromHash(hash);
    expect(store.text).toEqual({ title: 'Autumn Leaves', artist: 'Joseph Kosma', body: '| Cm7 | F7 |' });
    expect(store.sheet.song.title).toBe('Autumn Leaves');
    expect(store.sheet.song.sections[0]!.rows[0]!.bars).toHaveLength(2);
    expect(store.editorHash).toBe(hash);
    expect(env.replaced).toEqual([]);
  });

  it('keeps the song and reports a damaged link', async () => {
    const { store } = fakeEnv();
    store.setBody('C G');
    await store.loadFromHash('#/sheet?s=1.!!!');
    expect(store.body).toBe('C G');
    expect(store.linkError).toMatch(/damaged/);
    store.setBody('C G A');
    expect(store.linkError).toBeNull();
  });

  it('puts the current song back when the hash has none (the tab link)', async () => {
    const { env, store } = fakeEnv();
    store.setBody('C G');
    await store.loadFromHash('#/sheet');
    expect(await songInHash(env.hash)).toBe('C G');
  });

  it('copies the full text and the up-to-date link', async () => {
    const { env, store } = fakeEnv();
    store.setTitle('Blues');
    store.setBody('C F');
    expect(await store.copyText()).toBe(true);
    expect(await store.copyLink()).toBe(true);
    expect(env.clipboard[0]).toBe('Title: Blues\n\nC F');
    expect(env.clipboard[1]).toMatch(/^https:\/\/example\.test\/harmonics\/#\/sheet\?s=1\./);
    env.clipboardFails = true;
    expect(await store.copyText()).toBe(false);
  });

  it('copies the link of the song and layout as they are at the click, before the address bar catches up', async () => {
    const { env, store } = fakeEnv();
    store.setBody('C F');
    await store.flushUrl();
    store.setBarsPerRow(8);
    store.setFitPages(1);
    const copied = store.copyLink();
    // Changes after the click don't go into the copied link.
    store.setBarsPerRow(6);
    store.setBody('C F G');
    expect(await copied).toBe(true);
    expect(env.clipboard[0]).toMatch(/^https:\/\/example\.test\/harmonics\/#\/sheet\?s=1\.[\w-]+&b=8&f=1$/);
    expect(await songInHash(env.clipboard[0]!.split('#')[1]!)).toBe('C F');
  });

  it('downloads <title>.txt with the full text and a final line break', () => {
    const { env, store } = fakeEnv();
    store.setTitle('Autumn Leaves');
    store.setBody('| Cm7 |');
    store.download();
    store.setTitle('');
    store.download();
    expect(env.downloads).toEqual([
      ['autumn-leaves.txt', 'Title: Autumn Leaves\n\n| Cm7 |\n'],
      ['song.txt', '| Cm7 |\n'],
    ]);
  });
});

describe('SheetStore replacing the song', () => {
  it('replaces the song at once and offers Undo', () => {
    const { store } = fakeEnv();
    store.setBody('C G');
    store.replaceSong({ title: 'X', artist: '', body: 'D' }, 'Example loaded');
    expect(store.text).toEqual({ title: 'X', artist: '', body: 'D' });
    expect(store.undoNotice?.message).toBe('Example loaded');
  });

  it('takes a pasted full song with its header lines, and leaves other pastes alone', () => {
    const { store } = fakeEnv();
    expect(store.pasteSong('C G Am F')).toBe(false);
    expect(store.undoNotice).toBeNull();
    expect(store.pasteSong('Title: Let It Be\r\nArtist: The Beatles\r\n\r\nC G Am F')).toBe(true);
    expect(store.text).toEqual({ title: 'Let It Be', artist: 'The Beatles', body: 'C G Am F' });
    expect(store.undoNotice?.message).toBe('Song pasted');
  });

  it('opens a text file, with its name in the Undo toast', async () => {
    const { store } = fakeEnv();
    store.setBody('C');
    const result = await store.openFile(new File(['Title: So What\n\n| Dm7 |\n'], 'so-what.txt'));
    expect(result).toEqual({ ok: true });
    expect(store.text).toEqual({ title: 'So What', artist: '', body: '| Dm7 |\n' });
    expect(store.undoNotice?.message).toBe('Opened so-what.txt');
    await store.undo();
    expect(store.body).toBe('C');
  });

  it('refuses a huge file', async () => {
    const { store } = fakeEnv();
    const result = await store.openFile(new Blob(['x'.repeat(1_000_001)]));
    expect(result.ok).toBe(false);
    expect(store.body).toBe('');
    expect(store.undoNotice).toBeNull();
  });
});

describe('SheetStore New and Undo', () => {
  it('clears the song, resets the layout and puts a bare #/sheet in the address bar', async () => {
    const { env, store, storage } = fakeEnv();
    store.setTitle('Blues');
    store.setBody('C F');
    store.setBarsPerRow(6);
    store.setFitPages(1);
    await store.flushUrl();
    store.newSheet();
    expect(store.text).toEqual({ title: '', artist: '', body: '' });
    expect([store.barsPerRow, store.fitPages]).toEqual(['typed', 0]);
    expect(env.hash).toBe('#/sheet');
    expect(store.editorHash).toBe('#/sheet');
    expect(store.undoNotice?.message).toBe('Sheet cleared');
    expect(storage.get(BARS_PER_ROW_STORAGE_KEY)).toBe('typed');
    // The cleared song stays in the browser, offered by the empty sheet.
    expect(storage.get(LAST_SONG_STORAGE_KEY)).toBe('Title: Blues\n\nC F');
    expect(store.lastSong).toEqual({ title: 'Blues' });
  });

  it('saves edits not yet saved before clearing, so the offer is the latest song', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { env, store, storage } = fakeEnv();
      store.setBody('C F G');
      store.newSheet();
      expect(storage.get(LAST_SONG_STORAGE_KEY)).toBe('C F G');
      expect(store.lastSong).toEqual({ title: '' });
      // The cancelled address bar update doesn't bring the song back.
      vi.advanceTimersByTime(URL_UPDATE_DELAY_MS);
      expect(env.hash).toBe('#/sheet');
    } finally {
      vi.useRealTimers();
    }
  });

  it('undoes New: the song, its layout, its link and what was kept locally', async () => {
    const { env, store, storage } = fakeEnv();
    store.setBody('C F');
    store.setBarsPerRow(8);
    store.setFitPages(2);
    await store.flushUrl();
    const link = env.hash;
    const saved = Object.fromEntries(storage);
    store.newSheet();
    await store.undo();
    expect(store.text).toEqual({ title: '', artist: '', body: 'C F' });
    expect([store.barsPerRow, store.fitPages]).toEqual([8, 2]);
    expect(env.hash).toBe(link);
    expect(store.editorHash).toBe(link);
    expect(Object.fromEntries(storage)).toEqual(saved);
    expect(store.undoNotice).toBeNull();
  });

  it('undoes Load example, putting back the song it replaced in the browser too', async () => {
    const { env, store, storage } = fakeEnv();
    store.setBody('Mine');
    await store.flushUrl();
    store.replaceSong({ title: 'Example', artist: '', body: 'C' }, 'Example loaded');
    await store.flushUrl();
    expect(storage.get(LAST_SONG_STORAGE_KEY)).toBe('Title: Example\n\nC');
    await store.undo();
    expect(store.body).toBe('Mine');
    expect(storage.get(LAST_SONG_STORAGE_KEY)).toBe('Mine');
    expect(await songInHash(env.hash)).toBe('Mine');
  });

  it('undoes Load example on an empty sheet back to the empty sheet and its offer', async () => {
    const { env, store } = fakeEnv('#/sheet', fakeStorage({ [LAST_SONG_STORAGE_KEY]: 'Title: Old\n\nC' }));
    await store.loadFromHash('#/sheet');
    store.replaceSong({ title: 'Example', artist: '', body: 'C' }, 'Example loaded');
    expect(store.lastSong).toBeNull();
    await store.undo();
    expect(store.isEmpty).toBe(true);
    expect(store.lastSong).toEqual({ title: 'Old' });
    expect(env.hash).toBe('#/sheet');
  });

  it('stops offering Undo once the song is edited or the toast is dismissed', async () => {
    const { store } = fakeEnv();
    store.setBody('C');
    store.newSheet();
    store.setBody('D');
    expect(store.undoNotice).toBeNull();
    await store.undo();
    expect(store.body).toBe('D');
    store.newSheet();
    store.dismissUndo();
    await store.undo();
    expect(store.body).toBe('');
  });
});

describe('SheetStore start state', () => {
  it('starts a new visit at a bare #/sheet empty, offering the last song without loading it', async () => {
    const { env, store, storage } = fakeEnv('#/sheet', fakeStorage({ [LAST_SONG_STORAGE_KEY]: 'Title: Blues\n\nC F' }));
    await store.loadFromHash('#/sheet');
    expect(store.isEmpty).toBe(true);
    expect(store.lastSong).toEqual({ title: 'Blues' });
    expect(env.replaced).toEqual([]);
    expect(storage.get(LAST_SONG_STORAGE_KEY)).toBe('Title: Blues\n\nC F');
    await store.continueLastSong();
    expect(store.text).toEqual({ title: 'Blues', artist: '', body: 'C F' });
    expect(store.lastSong).toBeNull();
    expect(await songInHash(env.hash)).toBe('Title: Blues\n\nC F');
  });

  it('offers nothing without a last song, and says when it has no title', async () => {
    const { store } = fakeEnv();
    await store.loadFromHash('#/sheet');
    expect(store.lastSong).toBeNull();
    const untitled = fakeEnv('#/sheet', fakeStorage({ [LAST_SONG_STORAGE_KEY]: 'C F' })).store;
    await untitled.loadFromHash('#/sheet');
    expect(untitled.lastSong).toEqual({ title: '' });
  });

  it('keeps the song of this visit when the Sheet tab link is followed back', async () => {
    const { env, store } = fakeEnv('#/sheet', fakeStorage({ [LAST_SONG_STORAGE_KEY]: 'Old' }));
    store.setBody('New');
    // Another tab is shown while the address bar update is due.
    env.hash = '#/chords';
    await store.flushUrl();
    const tabLink = store.editorHash;
    env.hash = tabLink;
    await store.loadFromHash(tabLink);
    expect(store.body).toBe('New');
    // A bare #/sheet (the guide's tab, a bookmark) in the same visit keeps it too.
    await store.loadFromHash('#/sheet');
    expect(store.body).toBe('New');
    expect(store.lastSong).toBeNull();
  });

  it('always loads the song of a link, without the offer', async () => {
    const { store } = fakeEnv('#/sheet', fakeStorage({ [LAST_SONG_STORAGE_KEY]: 'Mine' }));
    await store.loadFromHash('#/sheet');
    expect(store.lastSong).toEqual({ title: '' });
    await store.loadFromHash(`#/sheet?s=${await encodeSheetText('Shared')}`);
    expect(store.body).toBe('Shared');
    expect(store.lastSong).toBeNull();
  });

  it('keeps the offer after New until something new is typed, also across the tab link', async () => {
    const { store } = fakeEnv();
    store.setTitle('Blues');
    store.setBody('C F');
    await store.flushUrl();
    store.newSheet();
    store.setBarsPerRow(4);
    expect(store.lastSong).toEqual({ title: 'Blues' });
    await store.loadFromHash(store.editorHash);
    expect(store.lastSong).toEqual({ title: 'Blues' });
    store.setBody('D');
    expect(store.lastSong).toBeNull();
  });

  it('keeps the last song when a stray keystroke after New is deleted, for the next visit', async () => {
    const { store, storage } = fakeEnv();
    store.setTitle('Blues');
    await store.flushUrl();
    store.newSheet();
    store.setBody('x');
    store.setBody('');
    await store.flushUrl();
    expect(storage.get(LAST_SONG_STORAGE_KEY)).toBe('Title: Blues');
    const next = fakeEnv('#/sheet', fakeStorage(Object.fromEntries(storage))).store;
    await next.loadFromHash('#/sheet');
    expect(next.lastSong).toEqual({ title: 'Blues' });
  });

  it('doesn’t load a song at a bare #/sheet after a quick reload of an empty sheet that was typed in', async () => {
    const first = fakeEnv('#/sheet', fakeStorage({ [LAST_SONG_STORAGE_KEY]: 'Old' }));
    first.store.setBody('Typed');
    first.store.flushUrlNow();
    // The browser reloads the bare address the page had before it was left.
    const second = fakeEnv('#/sheet', fakeStorage(Object.fromEntries(first.storage)));
    await second.store.loadFromHash('#/sheet');
    expect(second.store.isEmpty).toBe(true);
    expect(second.store.lastSong).toEqual({ title: '' });
    await second.store.continueLastSong();
    expect(second.store.body).toBe('Typed');
  });

  it('continues the last song with its own bars per row and fit to', async () => {
    const first = fakeEnv('#/sheet', fakeStorage());
    first.store.setBody('| C | G |');
    first.store.setBarsPerRow(8);
    first.store.setFitPages(1);
    await first.store.flushUrl();
    first.store.newSheet();
    expect(first.store.barsPerRow).not.toBe(8);
    const next = fakeEnv('#/sheet', fakeStorage(Object.fromEntries(first.storage))).store;
    await next.loadFromHash('#/sheet');
    await next.continueLastSong();
    expect(next.body).toBe('| C | G |');
    expect(next.barsPerRow).toBe(8);
    expect(next.fitPages).toBe(1);
  });
});

describe('SheetStore never losing the song', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes a pending update at once, uncompressed, when the page is left', async () => {
    const { env, store, storage } = fakeEnv();
    store.setBody('| C | G |');
    store.flushUrlNow();
    expect(env.replaced).toHaveLength(1);
    expect(env.hash).toMatch(/^#\/sheet\?s=0\.[\w-]+$/);
    expect(await songInHash(env.hash)).toBe('| C | G |');
    expect(storage.get(LAST_SONG_STORAGE_KEY)).toBe('| C | G |');
    // Nothing pending: nothing to write, and the cancelled debounced update doesn't follow.
    store.flushUrlNow();
    vi.advanceTimersByTime(URL_UPDATE_DELAY_MS);
    await Promise.resolve();
    expect(env.replaced).toHaveLength(1);
  });

  it('wins over a compressed update still under way', async () => {
    const { env, store } = fakeEnv();
    store.setBody('C');
    const pending = store.flushUrl();
    store.setBody('C G');
    store.flushUrlNow();
    await pending;
    expect(await songInHash(env.hash)).toBe('C G');
    expect(env.replaced).toHaveLength(1);
  });

  it('keeps the last edited song locally and offers it on a new visit’s bare #/sheet', async () => {
    const first = fakeEnv();
    first.store.setTitle('Blues');
    first.store.setBody('C F');
    await first.store.flushUrl();
    expect(first.storage.get(LAST_SONG_STORAGE_KEY)).toBe('Title: Blues\n\nC F');

    const second = fakeEnv('#/sheet', fakeStorage(Object.fromEntries(first.storage)));
    await second.store.loadFromHash('#/sheet');
    expect(second.store.isEmpty).toBe(true);
    expect(second.store.lastSong).toEqual({ title: 'Blues' });
  });

  it('doesn’t save a song opened from a link until it’s edited, and keeps the last song when the song is emptied', async () => {
    const { store, storage } = fakeEnv('#/sheet', fakeStorage({ [LAST_SONG_STORAGE_KEY]: 'Mine' }));
    await store.loadFromHash(`#/sheet?s=${await encodeSheetText('Shared')}`);
    await store.flushUrl();
    expect(storage.get(LAST_SONG_STORAGE_KEY)).toBe('Mine');
    store.setBody('Shared, edited');
    await store.flushUrl();
    expect(storage.get(LAST_SONG_STORAGE_KEY)).toBe('Shared, edited');
    store.setBody('');
    await store.flushUrl();
    expect(storage.get(LAST_SONG_STORAGE_KEY)).toBe('Shared, edited');
    expect(storage.has(LAST_SONG_LINK_STORAGE_KEY)).toBe(false);
  });

  it('restores the newer local song on a reload of the link it was edited from', async () => {
    const first = fakeEnv();
    first.store.setBody('| C | F |');
    await first.store.flushUrl();
    const linkBefore = first.env.hash;
    first.store.setBody('| C | F | G |');
    first.store.flushUrlNow();
    expect(first.storage.get(LAST_SONG_LINK_STORAGE_KEY)).toBe(new URLSearchParams(linkBefore.split('?')[1]).get('s'));

    // The browser reloads the address from before the page was left.
    const second = fakeEnv(linkBefore, fakeStorage(Object.fromEntries(first.storage)));
    await second.store.loadFromHash(linkBefore);
    expect(second.store.body).toBe('| C | F | G |');
    expect(await songInHash(second.env.hash)).toBe('| C | F | G |');

    // Other links are opened as they are.
    const third = fakeEnv('#/sheet', fakeStorage(Object.fromEntries(first.storage)));
    await third.store.loadFromHash(`#/sheet?s=${await encodeSheetText('Shared')}`);
    expect(third.store.body).toBe('Shared');
  });

  it('keeps the current song for a bare #/sheet', async () => {
    const { store } = fakeEnv('#/sheet', fakeStorage({ [LAST_SONG_STORAGE_KEY]: 'Old' }));
    store.setBody('New');
    await store.loadFromHash('#/sheet');
    expect(store.body).toBe('New');
  });
});

describe('SheetStore older text size links', () => {
  it('opens a link with z= (the removed text size) and leaves z out of the links it writes', async () => {
    const { env, store, storage } = fakeEnv();
    const encoded = await encodeSheetText('C');
    await store.loadFromHash(`#/sheet?s=${encoded}&z=l&b=6`);
    expect(store.body).toBe('C');
    expect(store.barsPerRow).toBe(6);
    expect(store.editorHash).toBe(`#/sheet?s=${encoded}&b=6`);
    store.setBody('C G');
    await store.flushUrl();
    expect(env.hash).not.toContain('z=');
    expect(Array.from(storage.keys()).some((key) => key.includes('textSize'))).toBe(false);
  });
});

describe('SheetStore bars per row and Fit to', () => {
  it('puts them in the link only when they aren’t the defaults, and remembers the chosen ones', async () => {
    const { env, store, storage } = fakeEnv();
    expect([store.barsPerRow, store.fitPages]).toEqual(['typed', 0]);
    store.setBody('C');
    await store.flushUrl();
    expect(env.hash).toMatch(/^#\/sheet\?s=1\.[\w-]+$/);
    store.setBarsPerRow(6);
    store.setFitPages(1);
    await store.flushUrl();
    expect(env.hash).toMatch(/\?s=1\.[\w-]+&b=6&f=1$/);
    expect(storage.get(BARS_PER_ROW_STORAGE_KEY)).toBe('6');
    expect(storage.get(FIT_PAGES_STORAGE_KEY)).toBe('1');
    const next = fakeEnv('#/sheet', fakeStorage(Object.fromEntries(storage))).store;
    expect([next.barsPerRow, next.fitPages]).toEqual([6, 1]);
    store.setBarsPerRow('typed');
    store.setFitPages(0);
    await store.flushUrl();
    expect(env.hash).toMatch(/^#\/sheet\?s=1\.[\w-]+$/);
    expect(storage.get(BARS_PER_ROW_STORAGE_KEY)).toBe('typed');
    expect(fakeEnv('#/sheet', fakeStorage(Object.fromEntries(storage))).store.barsPerRow).toBe('typed');
  });

  it('takes them from a link without saving them; a link without them has the defaults', async () => {
    const { store, storage } = fakeEnv('#/sheet', fakeStorage({ [BARS_PER_ROW_STORAGE_KEY]: '8', [FIT_PAGES_STORAGE_KEY]: '2' }));
    expect([store.barsPerRow, store.fitPages]).toEqual([8, 2]);
    const song = await encodeSheetText('C');
    await store.loadFromHash(`#/sheet?s=${song}&z=m&b=6&f=1`);
    expect([store.barsPerRow, store.fitPages]).toEqual([6, 1]);
    expect(storage.get(BARS_PER_ROW_STORAGE_KEY)).toBe('8');
    // A link with only the song (or an older one with only the text size) opens with bars as typed and Fit to off.
    await store.loadFromHash(`#/sheet?s=${await encodeSheetText('D')}&z=l`);
    expect([store.barsPerRow, store.fitPages]).toEqual(['typed', 0]);
    await store.loadFromHash(`#/sheet?s=${song}&b=5&f=9`);
    expect([store.barsPerRow, store.fitPages]).toEqual(['typed', 0]);
  });

  it('reads an older link’s b=4, 6 or 8 (wrap at that many bars) as reflowing into rows of that many', async () => {
    const { store } = fakeEnv();
    for (const bars of [4, 6, 8] as const) {
      await store.loadFromHash(`#/sheet?s=${await encodeSheetText(`C${bars}`)}&z=m&b=${bars}`);
      expect(store.barsPerRow).toBe(bars);
    }
  });

  it('keeps them for a bare #/sheet', async () => {
    const { store } = fakeEnv();
    store.setBarsPerRow(8);
    store.setFitPages(2);
    await store.loadFromHash('#/sheet');
    expect([store.barsPerRow, store.fitPages]).toEqual([8, 2]);
  });
});

describe('SheetStore header lines typed in the editor', () => {
  it('moves finished Title: and Artist: lines at the top into the fields', () => {
    const { store } = fakeEnv();
    store.setBody('Title: Let It');
    expect(store.text).toEqual({ title: '', artist: '', body: 'Title: Let It' });
    store.setBody('Title: Let It Be\n');
    expect(store.text).toEqual({ title: 'Let It Be', artist: '', body: '' });
    store.setBody('artist: The Beatles\n\n| C | G |');
    expect(store.text).toEqual({ title: 'Let It Be', artist: 'The Beatles', body: '| C | G |' });
    store.setBody('| C |\nTitle: Late\n');
    expect(store.title).toBe('Let It Be');
    expect(store.body).toBe('| C |\nTitle: Late\n');
  });
});
