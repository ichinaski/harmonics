import { describe, expect, it } from 'vitest';
import { canonicalHash, hashQuery, resolveRoute, sheetEditorHash, sheetParam } from '../src/routes';

describe('resolveRoute', () => {
  it('maps the four tabs and the two Chords sides', () => {
    expect(resolveRoute('#/chords')).toEqual({ path: 'chords', route: { tab: 'chords', side: 'find' } });
    expect(resolveRoute('#/chords/notes')).toEqual({ path: 'chords/notes', route: { tab: 'chords', side: 'notes' } });
    expect(resolveRoute('#/key').route).toEqual({ tab: 'key' });
    expect(resolveRoute('#/harmonize').route).toEqual({ tab: 'harmonize' });
    expect(resolveRoute('#/scales').route).toEqual({ tab: 'scales' });
  });

  it('redirects the first version’s routes: Voicings to Chord notes, Diatonic to Harmonize', () => {
    expect(resolveRoute('#/voicings')).toEqual({ path: 'chords/notes', route: { tab: 'chords', side: 'notes' } });
    expect(resolveRoute('#/diatonic')).toEqual({ path: 'harmonize', route: { tab: 'harmonize' } });
  });

  it('sends empty and unknown hashes to Find chord', () => {
    for (const hash of ['', '#', '#/', '#/nope', '#/chords/other', '#/toString', '#/constructor']) {
      expect(resolveRoute(hash)).toEqual({ path: 'chords', route: { tab: 'chords', side: 'find' } });
    }
  });

  it('accepts a trailing slash and a missing leading slash', () => {
    expect(resolveRoute('#/key/').path).toBe('key');
    expect(resolveRoute('#chords/notes').path).toBe('chords/notes');
  });
});

describe('Sheet routes', () => {
  it('maps the editor and the syntax guide, ignoring the query', () => {
    expect(resolveRoute('#/sheet')).toEqual({ path: 'sheet', route: { tab: 'sheet', page: 'editor' } });
    expect(resolveRoute('#/sheet?s=1.abc')).toEqual({ path: 'sheet', route: { tab: 'sheet', page: 'editor' } });
    expect(resolveRoute('#/sheet/syntax')).toEqual({ path: 'sheet/syntax', route: { tab: 'sheet', page: 'syntax' } });
    expect(resolveRoute('#/sheet/?s=1.abc').path).toBe('sheet');
  });

  it('keeps the query on the Sheet editor only', () => {
    expect(canonicalHash('#/sheet?s=1.abc')).toBe('#/sheet?s=1.abc');
    expect(canonicalHash('#sheet/?s=1.abc')).toBe('#/sheet?s=1.abc');
    expect(canonicalHash('#/sheet')).toBe('#/sheet');
    expect(canonicalHash('#/sheet/syntax?s=1.abc')).toBe('#/sheet/syntax');
    expect(canonicalHash('#/key?s=1.abc')).toBe('#/key');
    expect(canonicalHash('#/voicings')).toBe('#/chords/notes');
    expect(canonicalHash('')).toBe('#/chords');
  });

  it('reads and writes the song parameter', () => {
    expect(hashQuery('#/sheet?s=1.abc')).toBe('s=1.abc');
    expect(hashQuery('#/sheet')).toBe('');
    expect(sheetParam('#/sheet?s=1.a-b_c')).toBe('1.a-b_c');
    expect(sheetParam('#/sheet')).toBe('');
    expect(sheetParam('#/sheet/syntax?s=1.abc')).toBe('');
    expect(sheetParam('#/key?s=1.abc')).toBe('');
    expect(sheetEditorHash('1.abc')).toBe('#/sheet?s=1.abc');
    expect(sheetEditorHash('')).toBe('#/sheet');
    expect(sheetEditorHash('1.abc', { b: '6', f: '1' })).toBe('#/sheet?s=1.abc&b=6&f=1');
    expect(sheetEditorHash('1.abc', { f: '2' })).toBe('#/sheet?s=1.abc&f=2');
    expect(sheetEditorHash('', { b: '6' })).toBe('#/sheet');
    // Older links' z= (the removed text size) doesn't get in the way.
    expect(sheetParam('#/sheet?s=1.abc&z=l')).toBe('1.abc');
    expect(sheetParam('#/key?b=6', 'b')).toBe('');
    expect(sheetParam('#/sheet?s=1.abc&z=l&b=8&f=2', 'b')).toBe('8');
    expect(sheetParam('#/sheet?s=1.abc&z=l&b=8&f=2', 'f')).toBe('2');
    expect(sheetParam('#/sheet?s=1.abc&z=l', 'f')).toBe('');
  });
});
