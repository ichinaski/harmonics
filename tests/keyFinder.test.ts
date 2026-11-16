import { describe, expect, it } from 'vitest';
import { analyseInKey, bassChordReading, findKeys, romanNumeral, type KeyResult } from '../src/theory/keyFinder';
import { chordName, makeChord, parseProgression } from '../src/theory/chords';
import { parseNote, pitchClass } from '../src/theory/notes';
import { keyName, keyScale, makeKey, MODE_IDS, type ModeId } from '../src/theory/scales';

const prog = (text: string) => parseProgression(text).chords;
const keys = (text: string, modes = false) => findKeys(prog(text), { modes });
const names = (results: KeyResult[], n: number) => results.slice(0, n).map((r) => keyName(r.key, 'ascii'));
const key = (tonic: string, mode: ModeId) => makeKey(pitchClass(parseNote(tonic)!), mode);
const numerals = (text: string, tonic: string, mode: ModeId) => analyseInKey(prog(text), key(tonic, mode)).chords.map((c) => c.numeral);

describe('findKeys ranking (fixed cases)', () => {
  it('Am F C G: A minor and C major on top', () => {
    expect(names(keys('Am F C G'), 2).sort()).toEqual(['A minor', 'C major']);
    expect(numerals('Am F C G', 'A', 'aeolian')).toEqual(['i', '♭VI', '♭III', '♭VII']);
    expect(numerals('Am F C G', 'C', 'ionian')).toEqual(['vi', 'IV', 'I', 'V']);
  });

  it('Dm7 G7 Cmaj7: C major, with and without modes', () => {
    expect(names(keys('Dm7 G7 Cmaj7'), 1)).toEqual(['C major']);
    expect(names(keys('Dm7 G7 Cmaj7', true), 1)).toEqual(['C major']);
  });

  it('Dm G Dm C with modes: D Dorian', () => {
    const r = keys('Dm G Dm C', true);
    expect(names(r, 1)).toEqual(['D Dorian']);
    expect(r[0]!.chords.map((c) => c.numeral)).toEqual(['i', 'IV', 'i', '♭VII']);
  });

  it('C Bb F C: C major with a borrowed bVII from Mixolydian', () => {
    const r = keys('C Bb F C');
    expect(names(r, 1)).toEqual(['C major']);
    const bb = r[0]!.chords[1]!;
    expect(bb.numeral).toBe('♭VII');
    expect(bb.kind).toBe('borrowed');
    expect(bb.borrowedFrom).toEqual({ tonic: parseNote('C'), mode: 'mixolydian' });
    expect(bb.explanation).toBe('borrowed from C Mixolydian');
  });

  it('C Bb F C with modes: C Mixolydian, then C major', () => {
    expect(names(keys('C Bb F C', true), 2)).toEqual(['C Mixolydian', 'C major']);
  });

  it('C A7 Dm G7 C: C major with A7 as a resolved secondary dominant V7/ii', () => {
    const r = keys('C A7 Dm G7 C');
    expect(names(r, 1)).toEqual(['C major']);
    const a7 = r[0]!.chords[1]!;
    expect(a7.kind).toBe('secondaryDominant');
    expect(a7.numeral).toBe('V7/ii');
    expect(a7.target).toEqual({ numeral: 'ii', resolved: true });
    expect(r[0]!.chords.map((c) => c.numeral)).toEqual(['I', 'V7/ii', 'ii', 'V7', 'I']);
  });

  it('a secondary dominant scores more when the next chord is its target', () => {
    const resolved = analyseInKey(prog('C A7 Dm'), key('C', 'ionian'));
    const unresolved = analyseInKey(prog('C A7 F'), key('C', 'ionian'));
    expect(resolved.chords[1]!.fit).toBeGreaterThan(unresolved.chords[1]!.fit);
    expect(unresolved.chords[1]!.kind).toBe('secondaryDominant');
    expect(unresolved.chords[1]!.target!.resolved).toBe(false);
  });

  it('Am E7 Am: A minor, E7 is diatonic through harmonic minor', () => {
    const r = keys('Am E7 Am');
    expect(names(r, 1)).toEqual(['A minor']);
    expect(r[0]!.chords[1]).toMatchObject({ kind: 'diatonic', explanation: 'harmonic minor', numeral: 'V7' });
  });

  it('harmonic minor vii°7: G#dim7 in A minor', () => {
    const c = analyseInKey(prog('Am G#dim7 Am'), key('A', 'aeolian')).chords[1]!;
    expect(c).toMatchObject({ kind: 'diatonic', numeral: 'vii°7' });
  });

  it('harmonic minor chords are not diatonic in major keys or other modes', () => {
    expect(analyseInKey(prog('E7'), key('A', 'dorian')).chords[0]!.kind).not.toBe('diatonic');
  });

  it('C F G C: C major far ahead', () => {
    const r = keys('C F G C');
    expect(names(r, 1)).toEqual(['C major']);
    expect(r[0]!.score - r[1]!.score).toBeGreaterThan(15);
  });

  it('C Fm C: C major with a borrowed iv from C minor', () => {
    const r = keys('C Fm C');
    expect(names(r, 1)).toEqual(['C major']);
    expect(r[0]!.chords[1]).toMatchObject({ kind: 'borrowed', numeral: 'iv', explanation: 'borrowed from C minor' });
  });

  it('Em C G D: E minor and G major on top', () => {
    expect(names(keys('Em C G D'), 2).sort()).toEqual(['E minor', 'G major']);
  });

  it('A D A E with modes: A major ahead of E Mixolydian', () => {
    expect(names(keys('A D A E', true), 2)).toEqual(['A major', 'E Mixolydian']);
  });

  it('tensions do not count against the fit: G7b9 C is V7b9 I in C major', () => {
    const r = keys('G7b9 C');
    expect(names(r, 1)).toEqual(['C major']);
    expect(r[0]!.fit).toBe(1);
    expect(r[0]!.chords[0]!.numeral).toBe('V7♭9');
  });

  it('slash chords use the chord, not the bass: C/E G/B Am in C major', () => {
    expect(numerals('C/E G/B Am', 'C', 'ionian')).toEqual(['I', 'V', 'vi']);
    expect(analyseInKey(prog('C/E G/B Am'), key('C', 'ionian')).fit).toBe(1);
  });

  it('F/G C: F/G is read as G9sus4 (the chord on its bass), a V going to I in C major', () => {
    const r = keys('F/G C');
    expect(names(r, 1)).toEqual(['C major']);
    const fg = r[0]!.chords[0]!;
    expect(fg.numeral).toBe('V9sus4');
    expect(fg.kind).toBe('diatonic');
    expect(fg.explanation).toBe('diatonic, as G9sus4');
    expect(fg.reading && chordName(fg.reading, 'ascii')).toBe('G9sus4');
    expect(keyName(keys('F/G C', true)[0]!.key, 'ascii')).toBe('C major');
  });

  it('a tonic chord over a non-chord bass stays the tonic: F/G in F major is I', () => {
    const f = analyseInKey(prog('F/G Bb F'), key('F', 'ionian')).chords[0]!;
    expect(f.numeral).toBe('I');
  });

  it('a slash chord keeps its own reading where that fits the key better: Am/F is ii in G major, IVmaj7 in C major', () => {
    const g = analyseInKey(prog('Am/F'), key('G', 'ionian')).chords[0]!;
    expect(g).toMatchObject({ numeral: 'ii', kind: 'diatonic', explanation: 'diatonic' });
    expect(g.reading).toBeUndefined();
    const c = analyseInKey(prog('Am/F'), key('C', 'ionian')).chords[0]!;
    expect(c.numeral).toBe('IVmaj7');
    expect(c.reading && chordName(c.reading, 'ascii')).toBe('Fmaj7');
  });

  it('Cmaj7 D/C with modes: the C pedal puts C Lydian first', () => {
    const r = keys('Cmaj7 D/C', true);
    expect(names(r, 1)).toEqual(['C Lydian']);
    expect(r[0]!.chords.map((c) => c.numeral)).toEqual(['Imaj7', 'II']);
  });

  it('C/Bb F: F major, with C/Bb as V (no chord on Bb has these notes)', () => {
    const r = keys('C/Bb F');
    expect(names(r, 1)).toEqual(['F major']);
    expect(r[0]!.chords[0]).toMatchObject({ numeral: 'V', kind: 'diatonic', explanation: 'diatonic' });
    expect(r[0]!.chords[0]!.reading).toBeUndefined();
  });

  it('spells key tonics with the fewest accidentals: G#m E B F# gives G# minor', () => {
    expect(names(keys('G#m E B F#'), 2).sort()).toEqual(['B major', 'G# minor']);
  });

  it('leading-tone diminished chords are applied chords, fit like a secondary dominant', () => {
    const r = analyseInKey(prog('C C#dim7 Dm G7 C'), key('C', 'ionian'));
    const c = r.chords[1]!;
    expect(c.numeral).toBe('♯i°7');
    expect(c.kind).toBe('leadingTone');
    expect(c.explanation).toBe('leading-tone diminished to ii');
    expect(c.target).toEqual({ numeral: 'ii', resolved: true });
    expect(c.fit).toBe(0.75);
    const unresolved = analyseInKey(prog('C F#dim7 C'), key('C', 'ionian')).chords[1]!;
    expect(unresolved.explanation).toBe('leading-tone diminished to V');
    expect(unresolved.fit).toBe(0.5);
  });

  it('names a theoretical borrow source with its enharmonic: borrowed from Db minor (= C# minor)', () => {
    const c = analyseInKey(prog('Db Fb Db'), key('Db', 'ionian')).chords[1]!;
    expect(c.kind).toBe('borrowed');
    expect(c.explanation).toBe('borrowed from D♭ minor (= C♯ minor)');
    expect(analyseInKey(prog('C Ab C'), key('C', 'ionian')).chords[1]!.explanation).toBe('borrowed from C minor');
  });

  it('chromatic chords are flagged and score 0 fit', () => {
    const c = analyseInKey(prog('C F#m C'), key('C', 'ionian')).chords[1]!;
    expect(c.kind).toBe('chromatic');
    expect(c.fit).toBe(0);
  });
});

describe('findKeys candidates and scores', () => {
  it('major and minor by default (24 keys), all 7 modes with the toggle (84)', () => {
    expect(keys('C')).toHaveLength(24);
    expect(new Set(keys('C').map((r) => r.key.mode))).toEqual(new Set(['ionian', 'aeolian']));
    expect(keys('C', true)).toHaveLength(84);
  });

  it('never filters keys out, and scores are 0..100 integers in descending order', () => {
    const r = keys('C F#m Bb E7', true);
    expect(r).toHaveLength(84);
    for (const k of r) {
      expect(Number.isInteger(k.score)).toBe(true);
      expect(k.score).toBeGreaterThanOrEqual(0);
      expect(k.score).toBeLessThanOrEqual(100);
    }
    for (let i = 1; i < r.length; i++) expect(r[i]!.score).toBeLessThanOrEqual(r[i - 1]!.score);
  });

  it('no chords, no keys', () => {
    expect(findKeys([])).toEqual([]);
  });

  it('tonic emphasis separates relative keys with the same fit', () => {
    const r = keys('C G Am F C');
    const c = r.find((k) => keyName(k.key, 'ascii') === 'C major')!;
    const a = r.find((k) => keyName(k.key, 'ascii') === 'A minor')!;
    expect(c.fit).toBe(a.fit);
    expect(c.tonicEmphasis).toBeGreaterThan(a.tonicEmphasis);
    expect(c.score).toBeGreaterThan(a.score);
  });
});

describe('bassChordReading', () => {
  const reading = (text: string) => {
    const c = bassChordReading(prog(text)[0]!);
    return c ? chordName(c, 'ascii') : null;
  };

  it('reads a slash chord as the chord on its bass when the notes make one, exactly or with an allowed omission', () => {
    expect(reading('F/G')).toBe('G9sus4');
    expect(reading('Am/F')).toBe('Fmaj7');
    expect(reading('C/D')).toBe('D9sus4');
    expect(reading('Bb/C')).toBe('C9sus4');
  });

  it('is null for inversions, plain chords and slash chords with no chord on the bass', () => {
    expect(reading('C/E')).toBeNull();
    expect(reading('C')).toBeNull();
    expect(reading('D/C')).toBeNull();
    expect(reading('C/Bb')).toBeNull();
  });
});

describe('romanNumeral', () => {
  const chord = (root: string, type: string) => makeChord(parseNote(root)!, type);

  it('is relative to the major scale in every mode', () => {
    const triads: Record<ModeId, string[]> = {
      ionian: ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'],
      dorian: ['i', 'ii', '♭III', 'IV', 'v', 'vi°', '♭VII'],
      phrygian: ['i', '♭II', '♭III', 'iv', 'v°', '♭VI', '♭vii'],
      lydian: ['I', 'II', 'iii', '♯iv°', 'V', 'vi', 'vii'],
      mixolydian: ['I', 'ii', 'iii°', 'IV', 'v', 'vi', '♭VII'],
      aeolian: ['i', 'ii°', '♭III', 'iv', 'v', '♭VI', '♭VII'],
      locrian: ['i°', '♭II', '♭iii', 'iv', '♭V', '♭VI', '♭vii'],
    };
    const types = { major: 'maj', minor: 'm', diminished: 'dim' } as const;
    for (const mode of MODE_IDS) {
      const k = key('C', mode);
      const scale = keyScale(k);
      const got = scale.map((root, i) => {
        const third = (pitchClass(scale[(i + 2) % 7]!) - pitchClass(root) + 12) % 12;
        const fifth = (pitchClass(scale[(i + 4) % 7]!) - pitchClass(root) + 12) % 12;
        const quality = third === 4 ? 'major' : fifth === 6 ? 'diminished' : 'minor';
        return romanNumeral(makeChord(root, types[quality]), k);
      });
      expect(got, mode).toEqual(triads[mode]);
    }
  });

  it('writes 7th chord suffixes: ii7 V7 Imaj7 viiø7, vii°7 in minor', () => {
    const c = key('C', 'ionian');
    expect([chord('D', 'm7'), chord('G', '7'), chord('C', 'maj7'), chord('B', 'm7b5')].map((ch) => romanNumeral(ch, c))).toEqual([
      'ii7',
      'V7',
      'Imaj7',
      'viiø7',
    ]);
    expect(romanNumeral(chord('G#', 'dim7'), key('A', 'aeolian'))).toBe('vii°7');
  });

  it('spells the root in the key: A# in C major is bVII, chromatic roots use b2 b3 #4 b6 b7', () => {
    const c = key('C', 'ionian');
    expect(romanNumeral(chord('A#', 'maj'), c)).toBe('♭VII');
    expect(romanNumeral(chord('F#', 'dim'), c)).toBe('♯iv°');
    expect(romanNumeral(chord('Db', 'maj'), c)).toBe('♭II');
    expect(romanNumeral(chord('Ab', 'maj'), c)).toBe('♭VI');
  });

  it('names chromatic roots by major-relative degree, whatever the chord spelling: A in Db major is bVI', () => {
    const db = key('Db', 'ionian');
    expect(romanNumeral(chord('A', 'maj'), db)).toBe('♭VI');
    expect(romanNumeral(chord('D', 'maj'), db)).toBe('♭II');
    expect(romanNumeral(chord('E', 'm'), db)).toBe('♭iii');
    expect(romanNumeral(chord('A', 'maj'), makeKey(6, 'ionian', parseNote('Gb')!))).toBe('♭III');
    expect(romanNumeral(chord('A', 'maj'), key('F#', 'ionian'))).toBe('♭III');
  });

  it('uses raised degrees for leading-tone diminished chords: C#dim7 in C major is #i°7', () => {
    const c = key('C', 'ionian');
    expect(romanNumeral(chord('C#', 'dim7'), c)).toBe('♯i°7');
    expect(romanNumeral(chord('Db', 'dim7'), c)).toBe('♯i°7');
    expect(romanNumeral(chord('D#', 'dim7'), c)).toBe('♯ii°7');
    expect(romanNumeral(chord('F#', 'dim7'), c)).toBe('♯iv°7');
    expect(romanNumeral(chord('G#', 'dim7'), c)).toBe('♯v°7');
    expect(romanNumeral(chord('F#', 'm7b5'), c)).toBe('♯ivø7');
    // Not below a major or minor chord: Bb is a semitone below vii°, so it stays bvii°.
    expect(romanNumeral(chord('Bb', 'dim'), c)).toBe('♭vii°');
    // Other chord types on the same root keep the chromatic name.
    expect(romanNumeral(chord('C#', 'm'), c)).toBe('♭ii');
  });

  it('works in flat and sharp keys and in ascii', () => {
    expect(romanNumeral(chord('Gb', 'maj'), key('Db', 'ionian'))).toBe('IV');
    expect(romanNumeral(chord('C#', 'm7'), key('E', 'ionian'))).toBe('vi7');
    expect(romanNumeral(chord('E', 'maj'), key('F#', 'aeolian'), 'ascii')).toBe('bVII');
    expect(romanNumeral(chord('B', 'dim'), key('C', 'ionian'), 'ascii')).toBe('viio');
  });
});
