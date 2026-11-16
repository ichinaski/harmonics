// The song in the URL: `#/sheet?s=1.<data>`. Version 1 is the UTF-8 text
// compressed with CompressionStream('deflate-raw'), version 0 the plain UTF-8
// text (when the browser has no CompressionStream); both are base64url without
// padding. Decoding never throws: a damaged link gives an error result.

export type SheetDecodeResult = { ok: true; text: string } | { ok: false; error: string };

const CORRUPT_LINK = 'This link’s song data is damaged and can’t be read.';

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Bytes of a base64url string, or null if it isn't one. */
function base64UrlToBytes(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function transform(bytes: Uint8Array, stream: TransformStream<BufferSource, Uint8Array>): Promise<Uint8Array> {
  const output = new Blob([bytes as BufferSource]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(output).arrayBuffer());
}

function hasCompressionStreams(): boolean {
  return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
}

/** The uncompressed `s` value for a song text, '0.<utf-8 base64url>'. Synchronous, for writing the URL as the page is left. */
export function encodeSheetTextPlain(text: string): string {
  return `0.${bytesToBase64Url(new TextEncoder().encode(text))}`;
}

/** The `s` value for a song text: '1.<deflate-raw base64url>', or '0.<utf-8 base64url>' without CompressionStream. */
export async function encodeSheetText(text: string): Promise<string> {
  if (hasCompressionStreams()) {
    try {
      const bytes = new TextEncoder().encode(text);
      return `1.${bytesToBase64Url(await transform(bytes, new CompressionStream('deflate-raw')))}`;
    } catch {
      // Fall through to the uncompressed form.
    }
  }
  return encodeSheetTextPlain(text);
}

/** The song text of an `s` value (version 1 or 0). */
export async function decodeSheetText(value: string): Promise<SheetDecodeResult> {
  const dot = value.indexOf('.');
  const version = dot < 0 ? '' : value.slice(0, dot);
  if (version !== '0' && version !== '1') {
    return { ok: false, error: 'This link’s song data is in an unknown format.' };
  }
  const bytes = base64UrlToBytes(value.slice(dot + 1));
  if (!bytes) return { ok: false, error: CORRUPT_LINK };
  let utf8 = bytes;
  if (version === '1') {
    if (!hasCompressionStreams()) {
      return { ok: false, error: 'This browser can’t open compressed songs. Try a newer browser.' };
    }
    try {
      utf8 = await transform(bytes, new DecompressionStream('deflate-raw'));
    } catch {
      return { ok: false, error: CORRUPT_LINK };
    }
  }
  try {
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(utf8) };
  } catch {
    return { ok: false, error: CORRUPT_LINK };
  }
}
