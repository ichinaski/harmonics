import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeSheetText, encodeSheetText, encodeSheetTextPlain } from '../src/sheet/url';

const SONG = `Title: Autumn Leaves
Artist: Joseph Kosma

[A]
|: Cm7 | F7 | Bbmaj7 | Ebmaj7 |
| Am7b5 | D7 | 1. Gm | % :|
| 2. Gm | Gm ||`;

const UNICODE = 'Title: Café ☕ 枯葉 🎷\n| B♭maj7 | C♯ø7 | E°7 | "rit. — ça va" |';

async function roundTrip(text: string): Promise<string> {
  const decoded = await decodeSheetText(await encodeSheetText(text));
  if (!decoded.ok) throw new Error(decoded.error);
  return decoded.text;
}

describe('sheet URL codec (deflate-raw, version 1)', () => {
  it('round-trips a song, unicode and the empty text', async () => {
    for (const text of [SONG, UNICODE, '', 'C', SONG.repeat(50)]) {
      expect(await roundTrip(text)).toBe(text);
    }
  });

  it('uses version 1 and URL-safe characters only', async () => {
    const encoded = await encodeSheetText(SONG + UNICODE);
    expect(encoded).toMatch(/^1\.[A-Za-z0-9_-]+$/);
  });

  it('compresses repetitive songs', async () => {
    const text = SONG.repeat(20);
    expect((await encodeSheetText(text)).length).toBeLessThan(text.length / 4);
  });

  it('returns an error for damaged data, never throwing', async () => {
    const good = await encodeSheetText(SONG);
    for (const bad of [
      '',
      'abc',
      '2.abc',
      'x.abc',
      '1.',
      '1.!!!',
      '1.a',
      '1.AAAA',
      good.slice(0, good.length - 8),
      '0.%%%',
      '0._w', // invalid UTF-8 (0xFF)
    ]) {
      const result = await decodeSheetText(bad);
      expect(result.ok, bad).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/link/);
    }
  });

  it('never throws on changed data (deflate-raw has no checksum, so some changes decode to other text)', async () => {
    const good = await encodeSheetText(SONG);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    for (let i = 2; i < good.length; i++) {
      const changed = good.slice(0, i) + alphabet[(alphabet.indexOf(good[i]!) + 7) % 64] + good.slice(i + 1);
      const result = await decodeSheetText(changed);
      expect(typeof result.ok).toBe('boolean');
    }
  });
});

describe('sheet URL codec without CompressionStream (version 0)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores plain UTF-8 and decodes it', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    const encoded = await encodeSheetText(UNICODE);
    expect(encoded).toMatch(/^0\.[A-Za-z0-9_-]+$/);
    expect(await decodeSheetText(encoded)).toEqual({ ok: true, text: UNICODE });
    expect(await roundTrip('')).toBe('');
  });

  it('is decoded by browsers that do compress, and version 1 links need one that does', async () => {
    const compressed = await encodeSheetText(SONG);
    vi.stubGlobal('CompressionStream', undefined);
    const plain = await encodeSheetText(SONG);
    vi.unstubAllGlobals();
    expect(await decodeSheetText(plain)).toEqual({ ok: true, text: SONG });

    vi.stubGlobal('DecompressionStream', undefined);
    const result = await decodeSheetText(compressed);
    expect(result.ok).toBe(false);
  });
});

describe('encodeSheetTextPlain', () => {
  it('writes the uncompressed version 0 form, synchronously', async () => {
    const value = encodeSheetTextPlain(UNICODE);
    expect(value).toMatch(/^0\.[\w-]+$/);
    expect(await decodeSheetText(value)).toEqual({ ok: true, text: UNICODE });
  });
});
