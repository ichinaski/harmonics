import { describe, expect, it } from 'vitest';
import {
  CHORD_TYPES,
  QUALITY_FAMILIES,
  chordName,
  chordNotes,
  chordPcSet,
  chordSeventh,
  chordThird,
  chordTones,
  chordTypePcSet,
  chordTypeSymbol,
  chordTypesForTiers,
  getChordType,
  hasNonChordBass,
  makeChord,
  parseChord,
  parseChordQuality,
  parseProgression,
  type Chord,
} from '../src/theory/chords';
import { parseInterval } from '../src/theory/intervals';
import { formatNote, note, parseNote, pcSetOfNotes, pcSetSize, pcSetToArray, toPcSet, type Note } from '../src/theory/notes';

const ascii = (n: Note) => formatNote(n, 'ascii');
const n = (text: string) => parseNote(text)!;
const notesOf = (root: string, typeId: string) => chordNotes(makeChord(n(root), typeId)).map(ascii).join(' ');

const COMMON_IDS = ['maj', 'm', 'dim', 'aug', 'sus2', 'sus4', '5', '6', 'm6', '7', 'maj7', 'm7', 'm7b5', 'dim7', '9', 'maj9', 'm9', 'add9', 'madd9', '7sus4'];
const EXTENDED_IDS = ['6/9', 'm6/9', 'mMaj7', 'aug7', 'augMaj7', '11', 'm11', 'maj7#11', '13', 'm13', 'maj13', '7b5', '7#5', '7b9', '7#9', '7#11', '7b13', '7alt', '9sus4', 'add11', '13sus4'];

/** Every chord type built on C. */
const C_CHORDS: Record<string, string> = {
  maj: 'C E G',
  m: 'C Eb G',
  dim: 'C Eb Gb',
  aug: 'C E G#',
  sus2: 'C D G',
  sus4: 'C F G',
  '5': 'C G',
  '6': 'C E G A',
  m6: 'C Eb G A',
  '7': 'C E G Bb',
  maj7: 'C E G B',
  m7: 'C Eb G Bb',
  m7b5: 'C Eb Gb Bb',
  dim7: 'C Eb Gb Bbb',
  '9': 'C E G Bb D',
  maj9: 'C E G B D',
  m9: 'C Eb G Bb D',
  add9: 'C E G D',
  madd9: 'C Eb G D',
  '7sus4': 'C F G Bb',
  '6/9': 'C E G A D',
  'm6/9': 'C Eb G A D',
  mMaj7: 'C Eb G B',
  aug7: 'C E G# Bb',
  augMaj7: 'C E G# B',
  '11': 'C E G Bb D F',
  m11: 'C Eb G Bb D F',
  'maj7#11': 'C E G B F#',
  '13': 'C E G Bb D A',
  m13: 'C Eb G Bb D A',
  maj13: 'C E G B D A',
  '7b5': 'C E Gb Bb',
  '7#5': 'C E G# Bb',
  '7b9': 'C E G Bb Db',
  '7#9': 'C E G Bb D#',
  '7#11': 'C E G Bb F#',
  '7b13': 'C E G Bb Ab',
  '7alt': 'C E Bb Db D# F# Ab',
  '9sus4': 'C F G Bb D',
  add11: 'C E G F',
  '13sus4': 'C F G Bb D A',
};

describe('chord type table', () => {
  it('has exactly the common and extended vocabulary', () => {
    expect(chordTypesForTiers(false).map((t) => t.id)).toEqual(COMMON_IDS);
    expect(chordTypesForTiers(true).map((t) => t.id)).toEqual([...COMMON_IDS, ...EXTENDED_IDS]);
    expect(CHORD_TYPES.filter((t) => t.tier === 'extended').map((t) => t.id)).toEqual(EXTENDED_IDS);
  });

  it('has unique ids and valid metadata', () => {
    expect(new Set(CHORD_TYPES.map((t) => t.id)).size).toBe(CHORD_TYPES.length);
    for (const type of CHORD_TYPES) {
      expect(type.intervals[0], type.id).toBe('1');
      for (const i of type.intervals) expect(parseInterval(i), `${type.id} ${i}`).not.toBeNull();
      for (const c of type.core) expect(type.intervals, `${type.id} core`).toContain(c);
      for (const o of type.omittable) expect(type.intervals, `${type.id} omittable`).toContain(o);
      expect(type.core).toContain('1');
      expect(QUALITY_FAMILIES).toContain(type.family);
      expect(type.qualityName.length).toBeGreaterThan(0);
      expect(type.complexity).toBeGreaterThanOrEqual(0);
      expect(pcSetSize(chordTypePcSet(0, type)), `${type.id} has distinct tones`).toBe(type.intervals.length);
    }
  });

  it('only allows the common omissions', () => {
    for (const type of CHORD_TYPES) {
      const hasSeventh = chordSeventh(type) !== undefined;
      for (const o of type.omittable) {
        if (o === '5') expect(hasSeventh || type.intervals.includes('6'), type.id).toBe(true);
        if (o === '9') expect(type.intervals, type.id).toContain('13');
        if (o === '1') expect(hasSeventh && chordThird(type) !== undefined && type.intervals.length >= 5, type.id).toBe(true);
        expect(['1', '5', '9']).toContain(o);
      }
    }
    expect(getChordType('7').omittable).toEqual(['5']);
    expect(getChordType('13').omittable).toEqual(['1', '5', '9']);
    for (const id of ['13', 'm13', 'maj13']) {
      expect(getChordType(id).intervals, `${id} is defined without the 11th`).not.toContain('11');
      expect(getChordType(id).omittable, id).toEqual(['1', '5', '9']);
    }
    expect(getChordType('maj').omittable).toEqual([]);
    expect(getChordType('m7b5').omittable).toEqual([]);
  });

  it('assigns quality families', () => {
    const family = (id: string) => getChordType(id).family;
    expect(['maj', 'maj7', '6', 'add9'].map(family)).toEqual(['major', 'major', 'major', 'major']);
    expect(['m', 'm7', 'm6'].map(family)).toEqual(['minor', 'minor', 'minor']);
    expect(['7', '9', '7b9', '13'].map(family)).toEqual(['dominant', 'dominant', 'dominant', 'dominant']);
    expect(['dim', 'dim7', 'm7b5'].map(family)).toEqual(['diminished', 'diminished', 'diminished']);
    expect(['aug', 'aug7'].map(family)).toEqual(['augmented', 'augmented']);
    expect(['sus2', 'sus4', '7sus4'].map(family)).toEqual(['suspended', 'suspended', 'suspended']);
    expect(family('5')).toBe('power');
  });

  it('orders complexity C < Cadd9 < C6/9', () => {
    const cx = (id: string) => getChordType(id).complexity;
    expect(cx('maj')).toBeLessThan(cx('add9'));
    expect(cx('add9')).toBeLessThan(cx('6/9'));
  });

  it('has core tones: root, 3rd or suspended note, and 5th', () => {
    expect(getChordType('m7b5').core).toEqual(['1', 'b3', 'b5']);
    expect(getChordType('7sus4').core).toEqual(['1', '4', '5']);
    expect(getChordType('sus2').core).toEqual(['1', '2', '5']);
    expect(getChordType('5').core).toEqual(['1', '5']);
    expect(getChordType('13').core).toEqual(['1', '3', '5']);
  });

  it('finds the 3rd and 7th', () => {
    expect(chordThird(getChordType('m9'))).toBe('b3');
    expect(chordThird(getChordType('sus4'))).toBeUndefined();
    expect(chordSeventh(getChordType('dim7'))).toBe('bb7');
    expect(chordSeventh(getChordType('maj9'))).toBe('7');
    expect(chordSeventh(getChordType('6'))).toBeUndefined();
  });

  it('throws on unknown ids', () => {
    expect(() => getChordType('nope')).toThrow();
  });
});

describe('building chords', () => {
  it('covers every chord type in the table', () => {
    expect(Object.keys(C_CHORDS).sort()).toEqual(CHORD_TYPES.map((t) => t.id).sort());
  });

  it.each(Object.entries(C_CHORDS))('C %s = %s', (id, expected) => {
    expect(notesOf('C', id)).toBe(expected);
  });

  it('spells tones from the root by interval', () => {
    expect(notesOf('Db', 'maj')).toBe('Db F Ab');
    expect(notesOf('C#', 'maj')).toBe('C# E# G#');
    expect(notesOf('Db', '7')).toBe('Db F Ab Cb');
    expect(notesOf('C#', '7')).toBe('C# E# G# B');
    expect(notesOf('F#', 'dim7')).toBe('F# A C Eb');
    expect(notesOf('Eb', 'm7b5')).toBe('Eb Gb Bbb Db');
    expect(notesOf('Bb', 'maj7')).toBe('Bb D F A');
    expect(notesOf('G#', 'aug')).toBe('G# B# D##');
    expect(notesOf('Ab', 'm')).toBe('Ab Cb Eb');
    expect(notesOf('Bb', '13')).toBe('Bb D F Ab C G');
  });

  it('spells tensions enharmonically when they would need a double accidental or land on E#, B#, Fb or Cb, chord tones never', () => {
    expect(notesOf('F#', '7#9')).toBe('F# A# C# E A');
    expect(notesOf('E', '7alt')).toBe('E G# D F G A# C');
    expect(notesOf('E', '7#9')).toBe('E G# B D G');
    expect(notesOf('Eb', '7b9')).toBe('Eb G Bb Db E');
    expect(notesOf('A', '7#9')).toBe('A C# E G C');
    expect(notesOf('C#', '7#11')).toBe('C# E# G# B G');
    // Chord tones keep their letters: the 5th of G# aug and the 7th of C dim7.
    expect(notesOf('G#', 'aug')).toBe('G# B# D##');
    expect(notesOf('C', 'dim7')).toBe('C Eb Gb Bbb');
  });

  it('builds the same pitch classes for every root regardless of spelling', () => {
    for (const type of CHORD_TYPES) {
      for (let pc = 0; pc < 12; pc++) {
        const fromC = pcSetToArray(chordTypePcSet(0, type)).map((x) => (x + pc) % 12);
        expect(pcSetToArray(chordTypePcSet(pc, type))).toEqual([...fromC].sort((a, b) => a - b));
      }
    }
  });

  it('returns chord tones with interval and pitch class', () => {
    expect(chordTones(makeChord(n('A'), 'm7'))).toEqual([
      { interval: '1', note: note('A'), pc: 9 },
      { interval: 'b3', note: note('C'), pc: 0 },
      { interval: '5', note: note('E'), pc: 4 },
      { interval: 'b7', note: note('G'), pc: 7 },
    ]);
  });

  it('spells a pitch-class bass as the chord tone, or by default when outside the chord', () => {
    const cOverE = makeChord(note('C'), 'maj', 4);
    expect(cOverE.bass).toEqual(note('E'));
    expect(hasNonChordBass(cOverE)).toBe(false);
    // Bass notes avoid E#, B#, Fb, Cb and double accidentals (no key needs them here): C#/F, Cdim7/A.
    expect(makeChord(n('C#'), 'maj', 5).bass).toEqual(n('F'));
    expect(makeChord(note('C'), 'dim7', 9).bass).toEqual(n('A'));
    expect(makeChord(n('Db'), '7', 11).bass).toEqual(n('B'));
    // A typed bass keeps its spelling.
    expect(makeChord(n('C#'), 'maj', n('E#')).bass).toEqual(n('E#'));
    const fOverG = makeChord(note('F'), 'maj', 7);
    expect(fOverG.bass).toEqual(note('G'));
    expect(hasNonChordBass(fOverG)).toBe(true);
    expect(makeChord(note('F'), 'maj', 3).bass).toEqual(n('Eb'));
  });

  it('drops a bass equal to the root', () => {
    expect(makeChord(note('C'), 'maj', 0).bass).toBeUndefined();
    expect(makeChord(note('C'), 'maj', note('C')).bass).toBeUndefined();
  });

  it('gives pitch-class sets including a non-chord bass', () => {
    expect(chordPcSet(makeChord(note('F'), 'maj', 7))).toBe(toPcSet([5, 9, 0, 7]));
    expect(chordPcSet(makeChord(note('C'), 'maj', 4))).toBe(toPcSet([0, 4, 7]));
    expect(chordTypePcSet(0, getChordType('maj7'))).toBe(toPcSet([0, 4, 7, 11]));
  });

  it('sees identical pitch sets (C6 = Am7, dim7 symmetry)', () => {
    expect(chordTypePcSet(0, getChordType('6'))).toBe(chordTypePcSet(9, getChordType('m7')));
    expect(chordTypePcSet(2, getChordType('m6'))).toBe(chordTypePcSet(11, getChordType('m7b5')));
    expect(chordTypePcSet(0, getChordType('dim7'))).toBe(chordTypePcSet(3, getChordType('dim7')));
    expect(chordTypePcSet(0, getChordType('aug'))).toBe(chordTypePcSet(4, getChordType('aug')));
  });
});

describe('chord names', () => {
  const name = (chord: Chord) => [chordName(chord), chordName(chord, 'ascii')];

  it('names chords with unicode and ascii symbols', () => {
    expect(name(makeChord(note('C'), 'maj'))).toEqual(['C', 'C']);
    expect(name(makeChord(n('Bb'), 'm7b5', n('Db')))).toEqual(['B♭m7♭5/D♭', 'Bbm7b5/Db']);
    expect(name(makeChord(note('C'), 'dim'))).toEqual(['C°', 'Cdim']);
    expect(name(makeChord(n('F#'), 'dim7'))).toEqual(['F♯°7', 'F#dim7']);
    expect(name(makeChord(note('G'), '7#9'))).toEqual(['G7♯9', 'G7#9']);
    expect(name(makeChord(note('C'), '6/9', note('E')))).toEqual(['C6/9/E', 'C6/9/E']);
    expect(name(makeChord(note('F'), 'maj', note('G')))).toEqual(['F/G', 'F/G']);
  });

  it('names augmented 7ths and the minor-major 7th the chart way, and still reads the old names', () => {
    expect(name(makeChord(note('C'), 'aug7'))).toEqual(['C+7', 'C+7']);
    expect(name(makeChord(note('C'), 'augMaj7'))).toEqual(['C+maj7', 'C+maj7']);
    expect(name(makeChord(note('C'), 'mMaj7'))).toEqual(['Cm(maj7)', 'Cm(maj7)']);
    for (const [text, id] of [
      ['Caug7', 'aug7'],
      ['CaugMaj7', 'augMaj7'],
      ['CmMaj7', 'mMaj7'],
    ] as const) {
      const result = parseChord(text);
      expect(result.ok && result.chord.type.id, text).toBe(id);
    }
  });

  it('formats type symbols', () => {
    expect(chordTypeSymbol(getChordType('maj7#11'))).toBe('maj7♯11');
    expect(chordTypeSymbol(getChordType('maj7#11'), 'ascii')).toBe('maj7#11');
    expect(chordTypeSymbol(getChordType('7b13'))).toBe('7♭13');
  });

  it('round-trips every chord type through the parser', () => {
    for (const type of CHORD_TYPES) {
      for (const root of ['C', 'Bb', 'F#']) {
        const chord = makeChord(n(root), type);
        for (const style of ['unicode', 'ascii'] as const) {
          const result = parseChord(chordName(chord, style));
          expect(result.ok, chordName(chord, style)).toBe(true);
          if (result.ok) expect(result.chord).toEqual(chord);
        }
      }
    }
  });
});

describe('parseChord', () => {
  const parsed = (text: string) => {
    const result = parseChord(text);
    if (!result.ok) throw new Error(`${text}: ${result.error}`);
    return result.chord;
  };
  const summary = (text: string) => {
    const chord = parsed(text);
    return [ascii(chord.root), chord.type.id, chord.bass ? ascii(chord.bass) : undefined];
  };

  it.each([
    ['C', 'C', 'maj'],
    ['Cmaj', 'C', 'maj'],
    ['CM', 'C', 'maj'],
    ['CM7', 'C', 'maj7'],
    ['Cmaj7', 'C', 'maj7'],
    ['CΔ7', 'C', 'maj7'],
    ['CΔ', 'C', 'maj7'],
    ['Cm', 'C', 'm'],
    ['Cmin', 'C', 'm'],
    ['C-', 'C', 'm'],
    ['Cm7', 'C', 'm7'],
    ['C-7', 'C', 'm7'],
    ['Cmin7', 'C', 'm7'],
    ['C°', 'C', 'dim'],
    ['Cdim', 'C', 'dim'],
    ['C°7', 'C', 'dim7'],
    ['Cdim7', 'C', 'dim7'],
    ['Cø', 'C', 'm7b5'],
    ['Cø7', 'C', 'm7b5'],
    ['Cm7b5', 'C', 'm7b5'],
    ['Cm7♭5', 'C', 'm7b5'],
    ['C-7b5', 'C', 'm7b5'],
    ['C+', 'C', 'aug'],
    ['Caug', 'C', 'aug'],
    ['C+7', 'C', 'aug7'],
    ['CaugMaj7', 'C', 'augMaj7'],
    ['C+M7', 'C', 'augMaj7'],
    ['C2', 'C', 'sus2'],
    ['Csus2', 'C', 'sus2'],
    ['Csus', 'C', 'sus4'],
    ['C5', 'C', '5'],
    ['C7sus4', 'C', '7sus4'],
    ['C7sus', 'C', '7sus4'],
    ['CmMaj7', 'C', 'mMaj7'],
    ['CmM7', 'C', 'mMaj7'],
    ['Cm(maj7)', 'C', 'mMaj7'],
    ['C-Δ7', 'C', 'mMaj7'],
    ['C6/9', 'C', '6/9'],
    ['C69', 'C', '6/9'],
    ['Cm6/9', 'C', 'm6/9'],
    ['C7(b9)', 'C', '7b9'],
    ['C7♯9', 'C', '7#9'],
    ['Cmaj7(#11)', 'C', 'maj7#11'],
    ['Cm(add9)', 'C', 'madd9'],
    ['C7alt', 'C', '7alt'],
    ['Calt', 'C', '7alt'],
    ['Bb', 'Bb', 'maj'],
    ['B♭m', 'Bb', 'm'],
    ['F#m7', 'F#', 'm7'],
    ['F♯7', 'F#', '7'],
    ['Ebm7b5', 'Eb', 'm7b5'],
    ['am', 'A', 'm'],
    // Chart aliases (Sheet): ^ reads like Δ, h is half-diminished, o is diminished.
    ['C^', 'C', 'maj7'],
    ['C^7', 'C', 'maj7'],
    ['C^9', 'C', 'maj9'],
    ['C-^7', 'C', 'mMaj7'],
    ['Ch', 'C', 'm7b5'],
    ['Ch7', 'C', 'm7b5'],
    ['Co', 'C', 'dim'],
    ['Co7', 'C', 'dim7'],
    ['Bbh7', 'Bb', 'm7b5'],
    ['F#o7', 'F#', 'dim7'],
  ])('%s', (text, root, typeId) => {
    expect(summary(text)).toEqual([root, typeId, undefined]);
  });

  it('keeps case: M is major, m is minor', () => {
    expect(parsed('CM7').type.id).toBe('maj7');
    expect(parsed('Cm7').type.id).toBe('m7');
  });

  it('reads the last slash followed by a note as the bass', () => {
    expect(summary('G/B')).toEqual(['G', 'maj', 'B']);
    expect(summary('C/E')).toEqual(['C', 'maj', 'E']);
    expect(summary('Am7/G')).toEqual(['A', 'm7', 'G']);
    expect(summary('F/G')).toEqual(['F', 'maj', 'G']);
    expect(summary('Bb/C')).toEqual(['Bb', 'maj', 'C']);
    expect(summary('D/F#')).toEqual(['D', 'maj', 'F#']);
    expect(summary('C6/9/E')).toEqual(['C', '6/9', 'E']);
    expect(summary('Cm6/9/Eb')).toEqual(['C', 'm6/9', 'Eb']);
    expect(summary('C/C')).toEqual(['C', 'maj', undefined]);
  });

  it('reports errors', () => {
    const error = (text: string) => {
      const result = parseChord(text);
      return result.ok ? null : result.error;
    };
    expect(error('H7')).toMatch(/note name/);
    expect(error('7')).toMatch(/note name/);
    expect(error('')).toMatch(/note name/);
    expect(error('Cxyz')).toBe('Unknown chord quality "xyz"');
    expect(error('Cmaj8')).toBe('Unknown chord quality "maj8"');
    expect(error('C/H')).toBe('Unknown bass note "H"');
    expect(error('C7/')).toBe('Missing bass note after "/"');
    expect(error('Cfoo/E')).toBe('Unknown chord quality "foo"');
    expect(error('Cbb')).toBe('Unknown chord quality "b"');
  });

  it('looks up qualities on their own', () => {
    expect(parseChordQuality('')?.id).toBe('maj');
    expect(parseChordQuality('-7')?.id).toBe('m7');
    expect(parseChordQuality('nope')).toBeNull();
  });
});

describe('parseProgression', () => {
  it('parses valid tokens and keeps per-token errors', () => {
    const text = 'Am F  C/E,G7 | Xyz Cfoo C6/9';
    const { tokens, chords } = parseProgression(text);
    expect(tokens.map((t) => t.text)).toEqual(['Am', 'F', 'C/E', 'G7', 'Xyz', 'Cfoo', 'C6/9']);
    for (const t of tokens) expect(text.slice(t.start, t.end)).toBe(t.text);
    expect(tokens.map((t) => t.result.ok)).toEqual([true, true, true, true, false, false, true]);
    expect(chords.map((c) => chordName(c, 'ascii'))).toEqual(['Am', 'F', 'C/E', 'G7', 'C6/9']);
    const bad = tokens[5]!.result;
    expect(bad.ok ? null : bad.error).toBe('Unknown chord quality "foo"');
  });

  it('returns nothing for empty input', () => {
    expect(parseProgression('   ')).toEqual({ tokens: [], chords: [] });
  });

  it('spells parsed chords from the root', () => {
    const [chord] = parseProgression('C#7').chords;
    expect(pcSetToArray(pcSetOfNotes(chordNotes(chord!)))).toEqual([1, 5, 8, 11]);
    expect(chordNotes(chord!).map(ascii)).toEqual(['C#', 'E#', 'G#', 'B']);
  });
});
