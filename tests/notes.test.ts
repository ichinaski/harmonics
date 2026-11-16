import { describe, expect, it } from 'vitest';
import {
  defaultSpelling,
  enharmonicSpellings,
  formatNote,
  isEnharmonic,
  note,
  noteEquals,
  parseNote,
  pcSetAdd,
  pcSetDifference,
  pcSetHas,
  pcSetIsSubset,
  pcSetOfNotes,
  pcSetRemove,
  pcSetSize,
  pcSetToArray,
  pcSetTranspose,
  pitchClass,
  respell,
  simplifyNote,
  spellPitchClass,
  toMidi,
  toPcSet,
  type Note,
} from '../src/theory/notes';

const ascii = (n: Note) => formatNote(n, 'ascii');

describe('parseNote', () => {
  it.each([
    ['C', 'C', 0],
    ['Bb', 'B', -1],
    ['B♭', 'B', -1],
    ['F#', 'F', 1],
    ['F♯', 'F', 1],
    ['Ebb', 'E', -2],
    ['E𝄫', 'E', -2],
    ['F##', 'F', 2],
    ['F𝄪', 'F', 2],
    ['Fx', 'F', 2],
    ['G♮', 'G', 0],
    ['eb', 'E', -1],
    [' A ', 'A', 0],
  ])('parses %s', (text, letter, acc) => {
    expect(parseNote(text)).toEqual({ letter, acc });
  });

  it.each(['', 'H', 'C#b', 'Cbbb', 'C7', '#C', 'Cm'])('rejects %j', (text) => {
    expect(parseNote(text)).toBeNull();
  });
});

describe('formatNote', () => {
  it('formats with unicode accidentals by default', () => {
    expect(formatNote(note('B', -1))).toBe('B♭');
    expect(formatNote(note('F', 1))).toBe('F♯');
    expect(formatNote(note('F', 2))).toBe('F♯♯');
    expect(formatNote(note('B', -2))).toBe('B♭♭');
    expect(formatNote(note('G'))).toBe('G');
  });

  it('formats ascii', () => {
    expect(ascii(note('B', -1))).toBe('Bb');
    expect(ascii(note('F', 1))).toBe('F#');
    expect(ascii(note('B', -2))).toBe('Bbb');
  });

  it('round-trips through parseNote', () => {
    for (const text of ['C', 'C#', 'Db', 'E#', 'Fb', 'Bbb', 'G##']) {
      expect(ascii(parseNote(text)!)).toBe(text);
    }
  });
});

describe('pitch classes', () => {
  it('maps spelled notes to pitch classes', () => {
    expect(pitchClass(note('C'))).toBe(0);
    expect(pitchClass(note('C', 1))).toBe(1);
    expect(pitchClass(note('D', -1))).toBe(1);
    expect(pitchClass(note('E', 1))).toBe(5);
    expect(pitchClass(note('C', -1))).toBe(11);
    expect(pitchClass(note('B', 1))).toBe(0);
    expect(pitchClass(note('B', -2))).toBe(9);
  });

  it('computes MIDI numbers with the octave following the letter', () => {
    expect(toMidi(note('C'), 4)).toBe(60);
    expect(toMidi(note('A'), 4)).toBe(69);
    expect(toMidi(note('B', 1), 3)).toBe(60);
    expect(toMidi(note('C', -1), 4)).toBe(59);
    expect(toMidi(note('C'), 3)).toBe(48);
  });
});

describe('enharmonic helpers', () => {
  it('compares spelling and pitch', () => {
    expect(noteEquals(note('C', 1), note('D', -1))).toBe(false);
    expect(isEnharmonic(note('C', 1), note('D', -1))).toBe(true);
    expect(isEnharmonic(note('E', 1), note('F'))).toBe(true);
    expect(isEnharmonic(note('E'), note('F'))).toBe(false);
  });

  it('respells a pitch class on a given letter', () => {
    expect(respell(1, 'D')).toEqual(note('D', -1));
    expect(respell(0, 'B')).toEqual(note('B', 1));
    expect(respell(9, 'B')).toEqual(note('B', -2));
  });

  it('lists the spellings of a pitch class', () => {
    expect(enharmonicSpellings(1).map(ascii)).toEqual(['C#', 'Db', 'B##']);
    expect(enharmonicSpellings(1, 1).map(ascii)).toEqual(['C#', 'Db']);
    expect(enharmonicSpellings(0, 1).map(ascii)).toEqual(['C', 'B#']);
    expect(enharmonicSpellings(8, 1).map(ascii)).toEqual(['G#', 'Ab']);
  });

  it('simplifies awkward spellings', () => {
    expect(ascii(simplifyNote(note('E', 1)))).toBe('F');
    expect(ascii(simplifyNote(note('C', -1)))).toBe('B');
    expect(ascii(simplifyNote(note('B', -2)))).toBe('A');
    expect(ascii(simplifyNote(note('F', 2)))).toBe('G');
    expect(ascii(simplifyNote(note('E', -2)))).toBe('D');
    expect(ascii(simplifyNote(note('C', 2)))).toBe('D');
    expect(ascii(simplifyNote(note('G', 2)))).toBe('A');
    expect(ascii(simplifyNote(note('D', -1)))).toBe('Db');
    expect(ascii(simplifyNote(note('G', 1)))).toBe('G#');
  });

  it('spells pitch classes with a sharp or flat preference', () => {
    expect(ascii(spellPitchClass(6, 'sharp'))).toBe('F#');
    expect(ascii(spellPitchClass(6, 'flat'))).toBe('Gb');
    expect(ascii(spellPitchClass(4, 'flat'))).toBe('E');
    expect(ascii(spellPitchClass(-2, 'flat'))).toBe('Bb');
  });
});

describe('default spelling', () => {
  it('uses C# Eb F# Ab Bb for black keys', () => {
    const names = Array.from({ length: 12 }, (_, pc) => ascii(defaultSpelling(pc)));
    expect(names).toEqual(['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']);
  });

  it('returns a fresh object', () => {
    const a = defaultSpelling(1);
    a.acc = 5;
    expect(defaultSpelling(1).acc).toBe(1);
  });
});

describe('pitch-class sets', () => {
  const cMajor = toPcSet([0, 4, 7]);

  it('builds sets from pitch classes and notes', () => {
    expect(cMajor).toBe(0b10010001);
    expect(toPcSet([12, -8, 7])).toBe(cMajor);
    expect(pcSetOfNotes([note('C'), note('F', -1), note('G')])).toBe(cMajor);
  });

  it('queries and edits sets', () => {
    expect(pcSetHas(cMajor, 4)).toBe(true);
    expect(pcSetHas(cMajor, 5)).toBe(false);
    expect(pcSetSize(cMajor)).toBe(3);
    expect(pcSetToArray(pcSetAdd(cMajor, 11))).toEqual([0, 4, 7, 11]);
    expect(pcSetToArray(pcSetRemove(cMajor, 0))).toEqual([4, 7]);
  });

  it('checks subsets and differences', () => {
    const cMaj7 = toPcSet([0, 4, 7, 11]);
    expect(pcSetIsSubset(cMajor, cMaj7)).toBe(true);
    expect(pcSetIsSubset(cMaj7, cMajor)).toBe(false);
    expect(pcSetToArray(pcSetDifference(cMaj7, cMajor))).toEqual([11]);
  });

  it('transposes with wrap-around', () => {
    expect(pcSetToArray(pcSetTranspose(cMajor, 7))).toEqual([2, 7, 11]);
    expect(pcSetTranspose(cMajor, 12)).toBe(cMajor);
    expect(pcSetTranspose(cMajor, -5)).toBe(pcSetTranspose(cMajor, 7));
  });
});
