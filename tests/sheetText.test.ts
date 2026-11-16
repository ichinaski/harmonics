import { describe, expect, it } from 'vitest';
import {
  composeSheetText,
  hasHeaderLines,
  isEmptySheetText,
  readHeaderLine,
  sheetFileName,
  splitSheetText,
  takeHeaderLines,
} from '../src/sheet/text';

describe('composeSheetText', () => {
  it('writes header lines, a blank line, then the body', () => {
    expect(composeSheetText({ title: 'Autumn Leaves', artist: 'Joseph Kosma', body: '[A]\n| Cm7 |' })).toBe(
      'Title: Autumn Leaves\nArtist: Joseph Kosma\n\n[A]\n| Cm7 |',
    );
  });

  it('leaves out empty header fields', () => {
    expect(composeSheetText({ title: 'Blues', artist: ' ', body: 'C F' })).toBe('Title: Blues\n\nC F');
    expect(composeSheetText({ title: '', artist: 'Anon', body: 'C F' })).toBe('Artist: Anon\n\nC F');
    expect(composeSheetText({ title: '', artist: '', body: 'C F' })).toBe('C F');
    expect(composeSheetText({ title: 'Only', artist: '', body: '' })).toBe('Title: Only');
  });

  it('keeps header values on one line', () => {
    expect(composeSheetText({ title: 'Two\nlines', artist: '', body: '' })).toBe('Title: Two lines');
  });
});

describe('splitSheetText', () => {
  it('takes the header lines off the top', () => {
    expect(splitSheetText('Title: Autumn Leaves\nArtist: Joseph Kosma\n\n[A]\n| Cm7 |\n')).toEqual({
      title: 'Autumn Leaves',
      artist: 'Joseph Kosma',
      body: '[A]\n| Cm7 |\n',
    });
  });

  it('reads any case and spacing, in any order, with blank lines between', () => {
    expect(splitSheetText('\nartist :Bill Evans\n\nTITLE:  Waltz for Debby  \nC')).toEqual({
      title: 'Waltz for Debby',
      artist: 'Bill Evans',
      body: 'C',
    });
  });

  it('leaves text without header lines as body, and header lines further down in it', () => {
    expect(splitSheetText('| C |\nTitle: Late')).toEqual({ title: '', artist: '', body: '| C |\nTitle: Late' });
  });

  it('normalises Windows line breaks', () => {
    expect(splitSheetText('Title: X\r\n\r\nC\r\nG')).toEqual({ title: 'X', artist: '', body: 'C\nG' });
    expect(splitSheetText('C\r\nG').body).toBe('C\nG');
  });

  it('round-trips with composeSheetText', () => {
    for (const song of [
      { title: 'Autumn Leaves', artist: 'Joseph Kosma', body: '[A]\n|: Cm7 | F7 :|\n' },
      { title: 'Café ☕', artist: '', body: 'C' },
      { title: '', artist: 'Anon', body: '' },
      { title: '', artist: '', body: '' },
    ]) {
      expect(splitSheetText(composeSheetText(song))).toEqual(song);
    }
  });
});

describe('header helpers', () => {
  it('reads one header line', () => {
    expect(readHeaderLine('Title: So What')).toEqual({ field: 'title', value: 'So What' });
    expect(readHeaderLine('Key: C')).toBeNull();
    expect(readHeaderLine('| C |')).toBeNull();
  });

  it('tells a full song from a fragment', () => {
    expect(hasHeaderLines('\nTitle: X\nC')).toBe(true);
    expect(hasHeaderLines('C G\nTitle: X')).toBe(false);
    expect(hasHeaderLines('')).toBe(false);
  });

  it('knows an empty song', () => {
    expect(isEmptySheetText({ title: ' ', artist: '', body: '\n\n' })).toBe(true);
    expect(isEmptySheetText({ title: 'X', artist: '', body: '' })).toBe(false);
  });
});

describe('sheetFileName', () => {
  it('slugifies the title', () => {
    expect(sheetFileName('Autumn Leaves')).toBe('autumn-leaves.txt');
    expect(sheetFileName('  All the Things You Are! ')).toBe('all-the-things-you-are.txt');
    expect(sheetFileName('Café del Mar')).toBe('cafe-del-mar.txt');
    expect(sheetFileName('Rock/Roll: Part 2')).toBe('rock-roll-part-2.txt');
    expect(sheetFileName('枯葉')).toBe('枯葉.txt');
  });

  it('is song.txt without a usable title', () => {
    expect(sheetFileName('')).toBe('song.txt');
    expect(sheetFileName('  ')).toBe('song.txt');
    expect(sheetFileName('!!!')).toBe('song.txt');
  });

  it('keeps long names short', () => {
    expect(sheetFileName('a '.repeat(100)).length).toBeLessThanOrEqual(84);
    expect(sheetFileName('a '.repeat(100))).not.toMatch(/-\.txt$/);
  });
});

describe('takeHeaderLines', () => {
  it('takes finished header lines off the top, with the blank lines after them', () => {
    expect(takeHeaderLines('Title: So What\n')).toEqual({ title: 'So What', body: '' });
    expect(takeHeaderLines('\nTitle: So What\nArtist: Miles Davis\n\n| Dm7 |')).toEqual({ title: 'So What', artist: 'Miles Davis', body: '| Dm7 |' });
    expect(takeHeaderLines('Artist: Miles Davis\n| Dm7 |\n')).toEqual({ artist: 'Miles Davis', body: '| Dm7 |\n' });
  });

  it('leaves a header line still being typed, and texts that start with something else', () => {
    expect(takeHeaderLines('Title: So Wh')).toBeNull();
    expect(takeHeaderLines('Title: So What\nArtist: Mi')).toEqual({ title: 'So What', body: 'Artist: Mi' });
    expect(takeHeaderLines('| C |\nTitle: X\n')).toBeNull();
    expect(takeHeaderLines('')).toBeNull();
  });
});
