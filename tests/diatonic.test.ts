import { describe, expect, it } from 'vitest';
import { chordName, chordNotes, parseChord } from '../src/theory/chords';
import { chordFunction, diatonicChords, type DiatonicChords } from '../src/theory/diatonic';
import { formatNote, parseNote, pitchClass } from '../src/theory/notes';
import { MODE_IDS, keyName, keyNameWithEnharmonic, makeKey, type ModeId } from '../src/theory/scales';

const key = (tonic: string, mode: ModeId) => makeKey(pitchClass(parseNote(tonic)!), mode);
const of = (tonic: string, mode: ModeId) => diatonicChords(key(tonic, mode));
const ascii = (c: Parameters<typeof chordName>[0]) => chordName(c, 'ascii');
const triads = (d: DiatonicChords) => d.degrees.map((x) => ascii(x.triad.chord)).join(' ');
const sevenths = (d: DiatonicChords) => d.degrees.map((x) => ascii(x.seventh.chord)).join(' ');
const triadNumerals = (d: DiatonicChords) => d.degrees.map((x) => x.triad.numeral).join(' ');
const seventhNumerals = (d: DiatonicChords) => d.degrees.map((x) => x.seventh.numeral).join(' ');

describe('borrow source names', () => {
  it('keeps the parallel letters for theoretical sources and adds the enharmonic key', () => {
    const d = of('Db', 'ionian');
    const minor = d.borrowed.find((s) => s.key.mode === 'aeolian')!;
    expect(keyName(minor.key)).toBe('D♭ minor');
    expect(keyNameWithEnharmonic(minor.key)).toBe('D♭ minor (= C♯ minor)');
    expect(minor.triads.map((t) => ascii(t.chord))).toContain('Fb');
    expect(keyNameWithEnharmonic(of('C', 'ionian').borrowed[0]!.key)).toBe('C minor');
  });
});

describe('degree chords for all 7 modes', () => {
  // [tonic, mode, triads, 7ths, triad numerals]
  const cases: [string, ModeId, string, string, string][] = [
    ['C', 'ionian', 'C Dm Em F G Am Bdim', 'Cmaj7 Dm7 Em7 Fmaj7 G7 Am7 Bm7b5', 'I ii iii IV V vi vii°'],
    ['D', 'dorian', 'Dm Em F G Am Bdim C', 'Dm7 Em7 Fmaj7 G7 Am7 Bm7b5 Cmaj7', 'i ii ♭III IV v vi° ♭VII'],
    ['E', 'phrygian', 'Em F G Am Bdim C Dm', 'Em7 Fmaj7 G7 Am7 Bm7b5 Cmaj7 Dm7', 'i ♭II ♭III iv v° ♭VI ♭vii'],
    ['F', 'lydian', 'F G Am Bdim C Dm Em', 'Fmaj7 G7 Am7 Bm7b5 Cmaj7 Dm7 Em7', 'I II iii ♯iv° V vi vii'],
    ['G', 'mixolydian', 'G Am Bdim C Dm Em F', 'G7 Am7 Bm7b5 Cmaj7 Dm7 Em7 Fmaj7', 'I ii iii° IV v vi ♭VII'],
    ['A', 'aeolian', 'Am Bdim C Dm Em F G', 'Am7 Bm7b5 Cmaj7 Dm7 Em7 Fmaj7 G7', 'i ii° ♭III iv v ♭VI ♭VII'],
    ['B', 'locrian', 'Bdim C Dm Em F G Am', 'Bm7b5 Cmaj7 Dm7 Em7 Fmaj7 G7 Am7', 'i° ♭II ♭iii iv ♭V ♭VI ♭vii'],
  ];
  for (const [tonic, mode, t, s, n] of cases) {
    it(`${tonic} ${mode}`, () => {
      const d = of(tonic, mode);
      expect(triads(d)).toBe(t);
      expect(sevenths(d)).toBe(s);
      expect(triadNumerals(d)).toBe(n);
    });
  }

  it('numerals are relative to major: C Dorian is i ii ♭III IV v vi° ♭VII', () => {
    expect(triadNumerals(of('C', 'dorian'))).toBe('i ii ♭III IV v vi° ♭VII');
    expect(seventhNumerals(of('C', 'dorian'))).toBe('i7 ii7 ♭IIImaj7 IV7 v7 viø7 ♭VIImaj7');
    expect(seventhNumerals(of('C', 'ionian'))).toBe('Imaj7 ii7 iii7 IVmaj7 V7 vi7 viiø7');
  });

  it('every mode in every key has 7 spelled degrees with one letter each', () => {
    for (const mode of MODE_IDS) {
      for (let pc = 0; pc < 12; pc++) {
        const d = diatonicChords(makeKey(pc, mode));
        expect(new Set(d.degrees.map((x) => x.note.letter)).size).toBe(7);
        expect(d.degrees.map((x) => x.triad.chord.root)).toEqual(d.scale);
      }
    }
  });
});

describe('spelling in sharp and flat keys', () => {
  it('G major', () => {
    expect(triads(of('G', 'ionian'))).toBe('G Am Bm C D Em F#dim');
  });

  it('F# major: E# for the 7th degree', () => {
    const d = of('F#', 'ionian');
    expect(triads(d)).toBe('F# G#m A#m B C# D#m E#dim');
    expect(d.degrees[6]!.seventh.chord.root).toEqual(parseNote('E#'));
  });

  it('Eb major and Bb Mixolydian', () => {
    expect(sevenths(of('Eb', 'ionian'))).toBe('Ebmaj7 Fm7 Gm7 Abmaj7 Bb7 Cm7 Dm7b5');
    expect(triads(of('Bb', 'mixolydian'))).toBe('Bb Cm Ddim Eb Fm Gm Ab');
  });

  it('C# minor (not Db minor), F Phrygian, Eb Lydian and C Locrian', () => {
    const cs = of('C#', 'aeolian');
    expect(keyName(cs.key, 'ascii')).toBe('C# minor');
    expect(triads(cs)).toBe('C#m D#dim E F#m G#m A B');
    expect(triadNumerals(of('F', 'phrygian'))).toBe('i ♭II ♭III iv v° ♭VI ♭vii');
    expect(triads(of('F', 'phrygian'))).toBe('Fm Gb Ab Bbm Cdim Db Ebm');
    expect(triads(of('Eb', 'lydian'))).toBe('Eb F Gm Adim Bb Cm Dm');
    expect(triads(of('C', 'locrian'))).toBe('Cdim Db Ebm Fm Gb Ab Bbm');
  });
});

describe('functions and characteristic chords', () => {
  it('Ionian and Aeolian get tonic / subdominant / dominant labels', () => {
    expect(of('C', 'ionian').degrees.map((d) => d.function)).toEqual([
      'tonic', 'subdominant', 'tonic', 'subdominant', 'dominant', 'tonic', 'dominant',
    ]);
    expect(of('A', 'aeolian').degrees.map((d) => d.function)).toEqual([
      'tonic', 'subdominant', 'tonic', 'subdominant', 'dominant', 'tonic', 'dominant',
    ]);
    expect(of('C', 'ionian').characteristicDegree).toBeNull();
  });

  it('other modes have no functions and one characteristic chord', () => {
    const expected: [ModeId, string][] = [
      ['dorian', 'IV'],
      ['phrygian', '♭II'],
      ['lydian', 'II'],
      ['mixolydian', '♭VII'],
      ['locrian', '♭V'],
    ];
    for (const [mode, numeral] of expected) {
      const d = of('C', mode);
      expect(d.degrees.every((x) => x.function === null)).toBe(true);
      const marked = d.degrees.filter((x) => x.characteristic);
      expect(marked.map((x) => x.triad.numeral)).toEqual([numeral]);
    }
  });
});

describe('secondary dominants', () => {
  it('C major: V7 of ii, iii, IV, V and vi, spelled from the target', () => {
    const d = of('C', 'ionian');
    expect(d.secondaryDominants.map((s) => `${s.numeral}=${ascii(s.chord)}`)).toEqual([
      'V7/ii=A7', 'V7/iii=B7', 'V7/IV=C7', 'V7/V=D7', 'V7/vi=E7',
    ]);
    expect(d.secondaryDominants.every((s) => !s.inKey)).toBe(true);
  });

  it('skips the diminished chord and the tonic; flat and sharp keys spell correctly', () => {
    const eb = of('Eb', 'ionian');
    expect(eb.secondaryDominants.map((s) => ascii(s.chord))).toEqual(['C7', 'D7', 'Eb7', 'F7', 'G7']);
    const fs = of('F#', 'ionian');
    expect(fs.secondaryDominants.map((s) => ascii(s.chord))).toEqual(['D#7', 'E#7', 'F#7', 'G#7', 'A#7']);
    expect(chordNotes(fs.secondaryDominants[4]!.chord).map((n) => formatNote(n, 'ascii'))).toEqual(['A#', 'C##', 'E#', 'G#']);
  });

  it('minor and modes: targets use major-relative numerals; already diatonic ones are marked', () => {
    const cs = of('C#', 'aeolian');
    expect(cs.secondaryDominants.map((s) => `${s.numeral}=${ascii(s.chord)}${s.inKey ? '*' : ''}`)).toEqual([
      'V7/i=G#7',
      'V7/♭III=B7*', 'V7/iv=C#7', 'V7/v=D#7', 'V7/♭VI=E7', 'V7/♭VII=F#7',
    ]);
    const mix = of('G', 'mixolydian');
    expect(mix.secondaryDominants.find((s) => s.numeral === 'V7/IV')).toMatchObject({ inKey: true });
    expect(of('C', 'locrian').secondaryDominants.map((s) => s.target.triad.numeral)).toEqual(['♭II', '♭iii', 'iv', '♭V', '♭VI', '♭vii']);
  });
});

describe('chordFunction', () => {
  const fn = (text: string, tonic: string, mode: ModeId) => {
    const r = parseChord(text);
    if (!r.ok) throw new Error(r.error);
    return chordFunction(r.chord, key(tonic, mode));
  };

  it('labels chords that fit a major or minor key by their degree', () => {
    expect(['C', 'Dm7', 'Em', 'Fmaj7', 'G7', 'Am7', 'Bm7b5'].map((c) => fn(c, 'C', 'ionian'))).toEqual([
      'tonic', 'subdominant', 'tonic', 'subdominant', 'dominant', 'tonic', 'dominant',
    ]);
    expect(fn('E7', 'A', 'aeolian')).toBe('dominant');
    expect(fn('G#dim7', 'A', 'aeolian')).toBe('dominant');
  });

  it('is null outside the key and in the other modes', () => {
    expect(fn('D7', 'C', 'ionian')).toBeNull();
    expect(fn('Bb', 'C', 'ionian')).toBeNull();
    expect(fn('G', 'D', 'dorian')).toBeNull();
  });
});

describe('V7 of the tonic', () => {
  const tonicDominant = (tonic: string, mode: ModeId) => {
    const s = of(tonic, mode).secondaryDominants.find((x) => x.target.degree === 1);
    return s ? `${s.numeral}=${ascii(s.chord)} ${s.source}` : null;
  };

  it('minor-type modes get V7/i from harmonic minor', () => {
    expect(tonicDominant('A', 'aeolian')).toBe('V7/i=E7 harmonicMinor');
    expect(tonicDominant('D', 'dorian')).toBe('V7/i=A7 harmonicMinor');
    expect(tonicDominant('E', 'phrygian')).toBe('V7/i=B7 harmonicMinor');
    expect(tonicDominant('F#', 'aeolian')).toBe('V7/i=C#7 harmonicMinor');
  });

  it('Lydian and Mixolydian get V7 from the major scale', () => {
    expect(tonicDominant('C', 'lydian')).toBe('V7=G7 major');
    expect(tonicDominant('G', 'mixolydian')).toBe('V7=D7 major');
  });

  it('comes first, and only when the V7 is not already in the mode (Ionian) or the tonic is diminished (Locrian)', () => {
    expect(tonicDominant('C', 'ionian')).toBeNull();
    expect(tonicDominant('B', 'locrian')).toBeNull();
    const am = of('A', 'aeolian').secondaryDominants;
    expect(am[0]!.target.degree).toBe(1);
    expect(am[0]!.inKey).toBe(false);
    expect(am.slice(1).every((s) => s.source === null)).toBe(true);
  });
});

describe('borrowed chords', () => {
  const borrowedTriads = (d: DiatonicChords, i: number) =>
    d.borrowed[i]!.triads.map((b) => `${b.numeral}=${ascii(b.chord)}`).join(' ');

  it('major-type modes borrow from minor and Mixolydian by default', () => {
    const d = of('C', 'ionian');
    expect(d.borrowed.filter((s) => s.common).map((s) => s.key.mode)).toEqual(['aeolian', 'mixolydian']);
    expect(borrowedTriads(d, 0)).toBe('i=Cm ii°=Ddim ♭III=Eb iv=Fm v=Gm ♭VI=Ab ♭VII=Bb');
    expect(borrowedTriads(d, 1)).toBe('iii°=Edim v=Gm ♭VII=Bb');
    expect(d.borrowed[1]!.sevenths.map((b) => ascii(b.chord))).toEqual(['C7', 'Em7b5', 'Gm7', 'Bbmaj7']);
  });

  it('the other parallel modes follow, closest first', () => {
    const d = of('C', 'ionian');
    expect(d.borrowed.map((s) => s.key.mode)).toEqual(['aeolian', 'mixolydian', 'lydian', 'dorian', 'phrygian', 'locrian']);
    expect(d.borrowed.slice(2).every((s) => !s.common)).toBe(true);
  });

  it('minor-type modes (and Locrian) borrow from major and Dorian; a mode never borrows from itself', () => {
    const am = of('A', 'aeolian');
    expect(am.borrowed.filter((s) => s.common).map((s) => s.key.mode)).toEqual(['ionian', 'dorian']);
    expect(borrowedTriads(am, 1)).toBe('ii=Bm IV=D vi°=F#dim');
    expect(of('B', 'locrian').borrowed.filter((s) => s.common).map((s) => s.key.mode)).toEqual(['ionian', 'dorian']);
    expect(of('E', 'phrygian').borrowed.filter((s) => s.common).map((s) => s.key.mode)).toEqual(['ionian', 'dorian']);
    expect(of('F', 'lydian').borrowed.filter((s) => s.common).map((s) => s.key.mode)).toEqual(['aeolian', 'mixolydian']);
    for (const mode of MODE_IDS) expect(of('C', mode).borrowed.map((s) => s.key.mode)).not.toContain(mode);
  });

  it('when a default source is the mode itself, the next closest parallel mode replaces it', () => {
    const common = (tonic: string, mode: ModeId) => of(tonic, mode).borrowed.filter((s) => s.common).map((s) => s.key.mode);
    expect(common('G', 'mixolydian')).toEqual(['aeolian', 'ionian']);
    expect(common('D', 'dorian')).toEqual(['ionian', 'aeolian']);
    expect(common('A', 'aeolian')).toEqual(['ionian', 'dorian']);
    expect(common('C', 'ionian')).toEqual(['aeolian', 'mixolydian']);
    const g = of('G', 'mixolydian');
    expect(g.borrowed.map((s) => s.key.mode)).toHaveLength(6);
    expect(borrowedTriads(g, 1)).toBe('iii=Bm V=D vii°=F#dim');
  });

  it('spells borrowed chords from the parallel mode on the same tonic', () => {
    const eb = of('Eb', 'ionian');
    expect(borrowedTriads(eb, 0)).toBe('i=Ebm ii°=Fdim ♭III=Gb iv=Abm v=Bbm ♭VI=Cb ♭VII=Db');
    const bb = of('Bb', 'ionian');
    expect(bb.borrowed[0]!.key).toEqual({ tonic: parseNote('Bb'), mode: 'aeolian' });
    expect(borrowedTriads(bb, 1)).toBe('iii°=Ddim v=Fm ♭VII=Ab');
    const locrian = of('C', 'ionian').borrowed.find((s) => s.key.mode === 'locrian')!;
    expect(locrian.triads.find((b) => b.degree === 5)!.numeral).toBe('♭V');
  });

  it('borrowed chords are never diatonic to the key', () => {
    const d = of('G', 'ionian');
    const own = new Set(d.degrees.flatMap((x) => [ascii(x.triad.chord), ascii(x.seventh.chord)]));
    for (const source of d.borrowed) {
      for (const b of [...source.triads, ...source.sevenths]) expect(own.has(ascii(b.chord))).toBe(false);
    }
  });
});
