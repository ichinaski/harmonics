// Hash routes (#/chords, #/chords/notes, #/key, ...): they work on GitHub
// Pages without server config. The first version's #/voicings and #/diatonic
// redirect to Chord notes and Harmonize. The Sheet editor keeps its song in a
// query after the route: #/sheet?s=1.<data>; other routes drop any query.

import type { ChordsSide } from './stores/session.svelte';

export type TabId = 'chords' | 'key' | 'harmonize' | 'scales' | 'sheet';

/** The Sheet tab's pages: the editor (#/sheet) and the syntax guide (#/sheet/syntax). */
export type SheetPage = 'editor' | 'syntax';

export type Route =
  | { tab: 'chords'; side: ChordsSide }
  | { tab: 'sheet'; page: SheetPage }
  | { tab: Exclude<TabId, 'chords' | 'sheet'> };

export const ROUTES: Readonly<Record<string, Route>> = {
  chords: { tab: 'chords', side: 'find' },
  'chords/notes': { tab: 'chords', side: 'notes' },
  key: { tab: 'key' },
  harmonize: { tab: 'harmonize' },
  scales: { tab: 'scales' },
  sheet: { tab: 'sheet', page: 'editor' },
  'sheet/syntax': { tab: 'sheet', page: 'syntax' },
};

/** Routes of the first version: Voicings became Chord notes, Diatonic became Harmonize. */
export const ROUTE_REDIRECTS: Readonly<Record<string, string>> = { voicings: 'chords/notes', diatonic: 'harmonize' };

export const DEFAULT_ROUTE_PATH = 'chords';

export const SHEET_EDITOR_PATH = 'sheet';

/** The hash without '#', the leading '/' and the query. */
function hashPath(hash: string): string {
  const raw = hash.replace(/^#\/?/, '');
  const query = raw.indexOf('?');
  return (query < 0 ? raw : raw.slice(0, query)).replace(/\/$/, '');
}

/** The query of a hash ('#/sheet?s=1.abc' → 's=1.abc'), or ''. */
export function hashQuery(hash: string): string {
  const query = hash.indexOf('?');
  return query < 0 ? '' : hash.slice(query + 1);
}

/** The route of a location hash, and its canonical path (old and unknown routes map to a current one). The query is ignored. */
export function resolveRoute(hash: string): { path: string; route: Route } {
  const raw = hashPath(hash);
  const path = Object.hasOwn(ROUTES, raw)
    ? raw
    : Object.hasOwn(ROUTE_REDIRECTS, raw)
      ? ROUTE_REDIRECTS[raw]!
      : DEFAULT_ROUTE_PATH;
  return { path, route: ROUTES[path]! };
}

/** The hash the address bar should show for a hash: the canonical path, plus the query on the Sheet editor. */
export function canonicalHash(hash: string): string {
  const { path } = resolveRoute(hash);
  const query = path === SHEET_EDITOR_PATH ? hashQuery(hash) : '';
  return query ? `#/${path}?${query}` : `#/${path}`;
}

/**
 * A parameter of the Sheet editor's hash, or '' when there's none (or the
 * hash is another route): `s`, the song, `b`, the bars per row, or `f`, the
 * pages to fit to. (Older links' `z`, a text size, is ignored.)
 */
export function sheetParam(hash: string, name: 's' | 'b' | 'f' = 's'): string {
  if (hashPath(hash) !== SHEET_EDITOR_PATH) return '';
  return new URLSearchParams(hashQuery(hash)).get(name) ?? '';
}

/** The Sheet's layout settings in the link, as their parameter values ('6', '1'); unset ones are left out. */
export interface SheetLinkLayout {
  b?: string;
  f?: string;
}

/** The Sheet editor's hash for an encoded song and its layout: '#/sheet?s=1.abc&b=6&f=1', or '#/sheet' for an empty song. */
export function sheetEditorHash(encoded: string, layout: SheetLinkLayout = {}): string {
  if (!encoded) return `#/${SHEET_EDITOR_PATH}`;
  const params = (['b', 'f'] as const).filter((name) => layout[name]).map((name) => `&${name}=${layout[name]}`);
  return `#/${SHEET_EDITOR_PATH}?s=${encoded}${params.join('')}`;
}
