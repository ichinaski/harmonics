import { describe, expect, it } from 'vitest';
import { LETTERS, formatNote, note, parseNote, pcSetToArray, pitchClass, type Note } from '../src/theory/notes';
import {
  MODE_IDS,
  SCALE_TYPES,
  getScaleType,
  isMode,
  keyName,
  keyPcSet,
  keyScale,
  keySignature,
  keyTonicSpelling,
  makeKey,
  modeLabel,
  scalePcSet,
  spellInKey,
  spellScale,
  spellScaleFromPc,
  type ModeId,
  type ScaleId,
} from '../src/theory/scales';

const ascii = (n: Note) => formatNote(n, 'ascii');
const names = (notes: Note[]) => notes.map(ascii).join(' ');
const n = (text: string) => parseNote(text)!;

describe('scale table', () => {
  it('has the 7 modes in order with their tonic triad tags', () => {
    expect(MODE_IDS).toEqual(['ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian']);
    const tags = MODE_IDS.map((m) => getScaleType(m).tonicTriad);
    expect(tags).toEqual(['major', 'minor', 'minor', 'major', 'major', 'minor', 'diminished']);
    expect(MODE_IDS.map((m) => getScaleType(m).majorDegree)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(getScaleType('ionian').commonName).toBe('Major');
    expect(getScaleType('aeolian').commonName).toBe('Natural minor');
  });

  it('includes the other candidate scales', () => {
    const others = SCALE_TYPES.filter((s) => !isMode(s.id)).map((s) => s.id);
    expect(others).toEqual(['harmonicMinor', 'melodicMinor', 'majorPentatonic', 'minorPentatonic', 'blues']);
  });

  it('throws on unknown scale ids', () => {
    expect(() => getScaleType('nope' as ScaleId)).toThrow();
  });
});

describe('spellScale', () => {
  it.each<[ScaleId, string]>([
    ['ionian', 'C D E F G A B'],
    ['dorian', 'C D Eb F G A Bb'],
    ['phrygian', 'C Db Eb F G Ab Bb'],
    ['lydian', 'C D E F# G A B'],
    ['mixolydian', 'C D E F G A Bb'],
    ['aeolian', 'C D Eb F G Ab Bb'],
    ['locrian', 'C Db Eb F Gb Ab Bb'],
    ['harmonicMinor', 'C D Eb F G Ab B'],
    ['melodicMinor', 'C D Eb F G A B'],
    ['majorPentatonic', 'C D E G A'],
    ['minorPentatonic', 'C Eb F G Bb'],
    ['blues', 'C Eb F Gb G Bb'],
  ])('C %s', (scale, expected) => {
    expect(names(spellScale(note('C'), scale))).toBe(expected);
  });

  it('spells other tonics by interval', () => {
    expect(names(spellScale(n('F#'), 'ionian'))).toBe('F# G# A# B C# D# E#');
    expect(names(spellScale(n('Db'), 'ionian'))).toBe('Db Eb F Gb Ab Bb C');
    expect(names(spellScale(n('G#'), 'aeolian'))).toBe('G# A# B C# D# E F#');
    expect(names(spellScale(n('A'), 'harmonicMinor'))).toBe('A B C D E F G#');
    expect(names(spellScale(n('G#'), 'harmonicMinor'))).toBe('G# A# B C# D# E F##');
  });

  it('spells the blues blue note as b5, or #4 when b5 would be a double flat', () => {
    expect(names(spellScale(n('Eb'), 'blues'))).toBe('Eb Gb Ab A Bb Db');
    expect(names(spellScale(n('Bb'), 'blues'))).toBe('Bb Db Eb Fb F Ab');
    expect(names(spellScale(n('Ab'), 'blues'))).toBe('Ab Cb Db D Eb Gb');
    expect(names(spellScale(n('A'), 'blues'))).toBe('A C D Eb E G');
    expect(names(spellScale(n('F#'), 'blues'))).toBe('F# A B C C# E');
  });

  it('uses each letter once in every 7-note scale on every tonic spelling', () => {
    const tonics = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B', 'Cb'];
    for (const scale of SCALE_TYPES.filter((s) => s.intervals.length === 7)) {
      for (const tonic of tonics) {
        const letters = spellScale(n(tonic), scale).map((x) => x.letter);
        expect(new Set(letters).size, `${tonic} ${scale.id}`).toBe(7);
        expect([...letters].sort()).toEqual([...LETTERS].sort());
      }
    }
  });

  it('spells a scale from a pitch class with the key tonic spelling', () => {
    expect(names(spellScaleFromPc(8, 'aeolian'))).toBe('G# A# B C# D# E F#');
    expect(names(spellScaleFromPc(1, 'ionian'))).toBe('Db Eb F Gb Ab Bb C');
    expect(names(spellScaleFromPc(1, 'harmonicMinor'))).toBe('C# D# E F# G# A B#');
    expect(names(spellScaleFromPc(10, 'majorPentatonic'))).toBe('Bb C D F G');
  });

  it('gives pitch-class sets', () => {
    expect(pcSetToArray(scalePcSet(0, 'ionian'))).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(pcSetToArray(scalePcSet(9, 'minorPentatonic'))).toEqual([0, 2, 4, 7, 9]);
    expect(scalePcSet(n('Db'), 'ionian')).toBe(scalePcSet(1, 'ionian'));
  });
});

describe('key signatures', () => {
  it('counts sharps and flats', () => {
    expect(keySignature(note('C'), 'ionian')).toBe(0);
    expect(keySignature(note('A'), 'aeolian')).toBe(0);
    expect(keySignature(note('E'), 'ionian')).toBe(4);
    expect(keySignature(n('Db'), 'ionian')).toBe(-5);
    expect(keySignature(note('D'), 'dorian')).toBe(0);
    expect(keySignature(n('G#'), 'aeolian')).toBe(5);
    expect(keySignature(n('Ab'), 'aeolian')).toBe(-7);
  });

  it('marks theoretical keys as null', () => {
    expect(keySignature(n('D#'), 'ionian')).toBeNull();
    expect(keySignature(n('Fb'), 'ionian')).toBeNull();
    expect(keySignature(n('Db'), 'aeolian')).toBeNull();
  });
});

describe('keyTonicSpelling', () => {
  const tonic = (pc: number, mode: ModeId) => ascii(keyTonicSpelling(pc, mode));

  it('picks the spelling with the fewest accidentals for the mode', () => {
    expect(tonic(1, 'ionian')).toBe('Db');
    expect(tonic(1, 'aeolian')).toBe('C#');
    expect(tonic(8, 'aeolian')).toBe('G#');
    expect(tonic(8, 'ionian')).toBe('Ab');
    expect(tonic(11, 'ionian')).toBe('B');
    expect(tonic(10, 'aeolian')).toBe('Bb');
    expect(tonic(6, 'aeolian')).toBe('F#');
    expect(tonic(1, 'dorian')).toBe('C#');
    expect(tonic(3, 'phrygian')).toBe('D#');
    expect(tonic(5, 'locrian')).toBe('F');
  });

  it('never produces theoretical keys', () => {
    expect(tonic(3, 'ionian')).toBe('Eb');
    expect(tonic(4, 'ionian')).toBe('E');
    expect(tonic(0, 'ionian')).toBe('C');
    for (const mode of MODE_IDS) {
      for (let pc = 0; pc < 12; pc++) {
        const t = keyTonicSpelling(pc, mode);
        expect(pitchClass(t)).toBe(pc);
        const signature = keySignature(t, mode);
        expect(signature, `${ascii(t)} ${mode}`).not.toBeNull();
        expect(Math.abs(signature!)).toBeLessThanOrEqual(6);
      }
    }
  });

  it('keeps a preferred spelling unless its key is theoretical', () => {
    expect(ascii(keyTonicSpelling(3, 'phrygian', n('Eb')))).toBe('Eb');
    expect(ascii(keyTonicSpelling(3, 'locrian', n('Eb')))).toBe('D#');
    expect(ascii(keyTonicSpelling(1, 'ionian', n('C#')))).toBe('C#');
    expect(ascii(keyTonicSpelling(1, 'lydian', n('C#')))).toBe('Db');
    // A preferred note of another pitch class is ignored.
    expect(ascii(keyTonicSpelling(1, 'ionian', n('D')))).toBe('Db');
    expect(makeKey(3, 'phrygian', n('Eb')).tonic).toEqual(n('Eb'));
  });

  it('breaks 6-accidental ties with sharps for major-type and flats for minor-type modes', () => {
    expect(tonic(6, 'ionian')).toBe('F#');
    expect(tonic(1, 'mixolydian')).toBe('C#');
    expect(tonic(11, 'lydian')).toBe('B');
    expect(tonic(3, 'aeolian')).toBe('Eb');
    expect(tonic(8, 'dorian')).toBe('Ab');
    expect(tonic(10, 'phrygian')).toBe('Bb');
    expect(tonic(5, 'locrian')).toBe('F');
  });
});

describe('keys', () => {
  it('builds keys with spelled scales', () => {
    const gSharpMinor = makeKey(8, 'aeolian');
    expect(names(keyScale(gSharpMinor))).toBe('G# A# B C# D# E F#');
    expect(keyName(gSharpMinor)).toBe('G♯ minor');
    expect(keyName(makeKey(1, 'ionian'))).toBe('D♭ major');
    expect(keyName(makeKey(2, 'dorian'), 'ascii')).toBe('D Dorian');
    expect(pcSetToArray(keyPcSet(makeKey(2, 'dorian')))).toEqual([0, 2, 4, 5, 7, 9, 11]);
  });

  it('labels modes', () => {
    expect(modeLabel('ionian')).toBe('major');
    expect(modeLabel('aeolian')).toBe('minor');
    expect(modeLabel('mixolydian')).toBe('Mixolydian');
  });
});

describe('spellInKey', () => {
  const inKey = (pc: number, tonicPc: number, mode: ModeId) => ascii(spellInKey(pc, makeKey(tonicPc, mode)));

  it('uses scale notes for diatonic pitch classes', () => {
    expect(inKey(6, 7, 'ionian')).toBe('F#');
    expect(inKey(10, 5, 'ionian')).toBe('Bb');
    expect(inKey(5, 6, 'ionian')).toBe('E#');
    expect(inKey(5, 1, 'ionian')).toBe('F');
  });

  it('spells chromatic notes by degree relative to major', () => {
    // C major: bII, bIII, #IV, bVI, bVII
    expect([1, 3, 6, 8, 10].map((pc) => inKey(pc, 0, 'ionian'))).toEqual(['Db', 'Eb', 'F#', 'Ab', 'Bb']);
    // G major: bIII is Bb, bVII is F
    expect(inKey(10, 7, 'ionian')).toBe('Bb');
    expect(inKey(5, 7, 'ionian')).toBe('F');
    // E major: A# (#IV), as in V/V
    expect(inKey(10, 4, 'ionian')).toBe('A#');
    // C minor: the raised 7th and major 3rd
    expect(inKey(11, 0, 'aeolian')).toBe('B');
    expect(inKey(4, 0, 'aeolian')).toBe('E');
    // C# minor: E# as the 3rd of a major V/i; Db major: Cb as the bVII
    expect(inKey(5, 1, 'aeolian')).toBe('E#');
    expect(inKey(11, 1, 'ionian')).toBe('Cb');
  });

  it('avoids double accidentals', () => {
    // Gb Lydian: b2 would be Abb
    expect(ascii(makeKey(6, 'lydian').tonic)).toBe('Gb');
    expect(inKey(7, 6, 'lydian')).toBe('G');
    // C# Mixolydian: #4 would be F##
    expect(ascii(makeKey(1, 'mixolydian').tonic)).toBe('C#');
    expect(inKey(7, 1, 'mixolydian')).toBe('G');
  });
});
