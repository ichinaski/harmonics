import { describe, expect, it } from 'vitest';
import {
  MIN_MATCH_NOTES,
  chordFitsKey,
  chordsForRootAndFamily,
  findChords,
  type ChordFinderOptions,
  type ChordMatch,
} from '../src/theory/chordFinder';
import { chordName, makeChord } from '../src/theory/chords';
import { formatNote, parseNote, pitchClass } from '../src/theory/notes';
import { makeKey } from '../src/theory/scales';

const pc = (text: string) => pitchClass(parseNote(text)!);
const pcs = (text: string) => text.split(' ').map(pc);
const name = (m: ChordMatch) => chordName(m.chord, 'ascii');
const altNames = (m: ChordMatch) => m.alternates.map((c) => chordName(c, 'ascii'));

function find(notes: string, options: Omit<ChordFinderOptions, 'bass' | 'root'> & { bass?: string; root?: string } = {}) {
  const { bass, root, ...rest } = options;
  return findChords(pcs(notes), { ...rest, bass: bass ? pc(bass) : null, root: root ? pc(root) : null });
}

const names = (matches: ChordMatch[]) => matches.map(name);
const byName = (matches: ChordMatch[], chord: string) => matches.find((m) => name(m) === chord || altNames(m).includes(chord));
const indexOf = (matches: ChordMatch[], chord: string) => matches.findIndex((m) => name(m) === chord);

describe('findChords ranking (fixed cases)', () => {
  it('C E G: C, then C6 (also Am7), Cmaj7, C7', () => {
    const r = find('C E G');
    expect(names(r).slice(0, 4)).toEqual(['C', 'C6', 'Cmaj7', 'C7']);
    expect(r[0]!.group).toBe('exact');
    expect(altNames(r[1]!)).toContain('Am7');
    expect(r.slice(1, 4).every((m) => m.group === 'contains')).toBe(true);
  });

  it('C E G A with bass A: one card named Am7, with C6 as an alternate', () => {
    const r = find('C E G A', { bass: 'A' });
    expect(name(r[0]!)).toBe('Am7');
    expect(r[0]!.group).toBe('exact');
    expect(altNames(r[0]!)).toContain('C6/A');
  });

  it('C E G A without bass: the root that comes first in the selection names the card', () => {
    expect(name(find('C E G A')[0]!)).toBe('C6');
    expect(name(find('A C E G')[0]!)).toBe('Am7');
  });

  it('E G: Em and C ahead of Cmaj7 and Em7', () => {
    const r = find('E G');
    expect(names(r).slice(0, 2)).toEqual(['Em', 'C']);
    expect(indexOf(r, 'Cmaj7')).toBeGreaterThan(1);
    expect(indexOf(r, 'Em7')).toBeGreaterThan(1);
  });

  it('B D F A: one card Bm7b5 / Dm6', () => {
    const exact = find('B D F A').filter((m) => m.group === 'exact');
    expect(exact).toHaveLength(1);
    expect(name(exact[0]!)).toBe('Bm7b5');
    expect(altNames(exact[0]!)).toEqual(['Dm6']);
  });

  it('B D F A with bass D: the bass names the card (Dm6)', () => {
    const r = find('B D F A', { bass: 'D' });
    expect(name(r[0]!)).toBe('Dm6');
    expect(altNames(r[0]!)).toContain('Bm7b5/D');
  });

  it('F A C with bass G: F/G first, labelled bass not in chord, Fadd9/G as alternate', () => {
    const r = find('F A C G', { bass: 'G' });
    expect(name(r[0]!)).toBe('F/G');
    expect(r[0]!.group).toBe('exact');
    expect(r[0]!.nonChordBass).toBe(true);
    expect(altNames(r[0]!)).toContain('Fadd9/G');
    expect(r[0]!.notes[0]).toMatchObject({ interval: null, state: 'selected', pc: pc('G') });
  });

  it('F/G stays first with extended chords on (G9sus4 no 5th ranks below)', () => {
    const r = find('F A C G', { bass: 'G', extended: true });
    expect(name(r[0]!)).toBe('F/G');
    expect(byName(r, 'G9sus4')!.group).toBe('omitted');
  });

  it.each([
    ['D F# A E', 'E', 'D/E'],
    ['Bb D F C', 'C', 'Bb/C'],
    ['Ab C Eb Bb', 'Bb', 'Ab/Bb'],
  ])('common transcription slash chords: %s over %s is %s', (notes, bass, expected) => {
    expect(name(find(notes, { bass })[0]!)).toBe(expected);
  });

  it('spells a bass outside the chord by interval from the root, with the fewest accidentals', () => {
    const slash = (notes: string, bass: string) => name(find(notes, { bass }).find((m) => m.nonChordBass)!);
    expect(slash('F# A# C# G#', 'G#')).toBe('F#/G#');
    expect(slash('C# F G# D#', 'D#')).toBe('C#/D#');
    expect(slash('F A C G', 'G')).toBe('F/G');
    expect(slash('Bb D F C', 'C')).toBe('Bb/C');
    expect(slash('D F# A E', 'E')).toBe('D/E');
  });

  it('a 7th in the bass is a normal inversion: G7/F, Am7/G (not also G/F, Am/G: alternates keep the bass a chord tone)', () => {
    const g = find('G B D F', { bass: 'F' })[0]!;
    expect(name(g)).toBe('G7/F');
    expect(g.nonChordBass).toBe(false);
    expect(altNames(g)).not.toContain('G/F');
    const a = find('A C E G', { bass: 'G' })[0]!;
    expect(name(a)).toBe('Am7/G');
    expect(altNames(a)).not.toContain('Am/G');
    expect(altNames(a)).toContain('C6/G');
  });

  it('inversions: C/E and C/G', () => {
    expect(name(find('C E G', { bass: 'E' })[0]!)).toBe('C/E');
    expect(name(find('C E G', { bass: 'G' })[0]!)).toBe('C/G');
  });

  it('the non-chord-bass pass does not add clashing chords (no Cm/E for C E G over E)', () => {
    const r = find('C E G', { bass: 'E' });
    expect(byName(r, 'Cm/E')).toBeUndefined();
    expect(byName(r, 'C5/E')).toBeUndefined();
  });

  it('C G: the power chord first, then C and Cm ahead of Gsus4', () => {
    const r = find('C G');
    expect(names(r).slice(0, 3)).toEqual(['C5', 'C', 'Cm']);
    expect(indexOf(r, 'Gsus4')).toBeGreaterThan(2);
  });

  it('C Eb G: Cm7 ahead of Cm6', () => {
    const r = find('C Eb G');
    expect(name(r[0]!)).toBe('Cm');
    expect(indexOf(r, 'Cm7')).toBeLessThan(indexOf(r, 'Cm6'));
  });

  it('C F G: Csus4 (also Fsus2), and G7sus4 without its 5th', () => {
    const r = find('C F G');
    expect(name(r[0]!)).toBe('Csus4');
    expect(altNames(r[0]!)).toEqual(['Fsus2']);
    expect(byName(r, 'G7sus4')!.group).toBe('omitted');
  });
});

describe('findChords omissions', () => {
  it('the 5th can be left out of a 7th chord: C E Bb is C7 (no 5th)', () => {
    const m = byName(find('C E Bb'), 'C7')!;
    expect(m.group).toBe('omitted');
    expect(m.omitted).toBe('5');
    expect(m.notes.find((n) => n.interval === '5')!.state).toBe('omitted');
  });

  it('the 5th of a triad is not omittable: C E is C in the contains group', () => {
    expect(byName(find('C E'), 'C')!.group).toBe('contains');
  });

  it('rootless with 4 notes: E G Bb D is Em7b5 exact and C9 without root', () => {
    const r = find('E G Bb D');
    expect(name(r[0]!)).toBe('Em7b5');
    const c9 = byName(r, 'C9')!;
    expect(c9.group).toBe('omitted');
    expect(c9.omitted).toBe('1');
    expect(c9.notes.find((n) => n.interval === '1')).toMatchObject({ state: 'omitted' });
  });

  it('rootless with 4 notes: E G B D is Em7 (also G6) and Cmaj9 without root', () => {
    const r = find('E G B D');
    expect(name(r[0]!)).toBe('Em7');
    expect(altNames(r[0]!)).toEqual(['G6']);
    expect(byName(r, 'Cmaj9')!.group).toBe('omitted');
  });

  it('rootless needs 4 notes: E G Bb alone is not C7 without root', () => {
    const r = find('E G Bb');
    expect(byName(r, 'C7')!.group).toBe('contains');
    expect(r.filter((m) => m.group === 'omitted' && m.omitted === '1')).toEqual([]);
  });

  it('13th chords may drop the 9th; 13ths have no 11th', () => {
    const m = byName(find('C E G Bb A', { extended: true }), 'C13')!;
    expect(m.group).toBe('omitted');
    expect(m.omitted).toBe('9');
  });

  it('only one tone may be omitted: C Bb D is not C9 omitted', () => {
    expect(byName(find('C Bb D'), 'C9')!.group).toBe('contains');
  });
});

describe('findChords collapse of identical notes', () => {
  it('dim7 symmetry: one card with four names, named after the first selected note', () => {
    const exact = find('C Eb Gb A').filter((m) => m.group === 'exact');
    expect(exact).toHaveLength(1);
    expect(name(exact[0]!)).toBe('Cdim7');
    // D#dim7 (D# F# A C), not Ebdim7 with Bbb and Dbb.
    expect(altNames(exact[0]!).sort()).toEqual(['Adim7', 'D#dim7', 'F#dim7']);
    expect(name(find('A C Eb Gb')[0]!)).toBe('Adim7');
  });

  it('dim7 with a bass: the bass names the card', () => {
    expect(name(find('C Eb Gb A', { bass: 'Gb' })[0]!)).toBe('F#dim7');
  });

  it('symmetric chords take their name from the bass, or else the lowest selected note: B D F Ab is Bdim7', () => {
    expect(name(find('B D F Ab')[0]!)).toBe('Bdim7');
    expect(name(find('D F Ab B')[0]!)).toBe('Ddim7');
    expect(name(find('D F Ab B', { bass: 'B' })[0]!)).toBe('Bdim7');
    expect(name(find('B D F Ab', { bass: 'Ab' })[0]!)).toBe('G#dim7');
  });

  it('augmented triads collapse too', () => {
    const r = find('C E G#');
    expect(name(r[0]!)).toBe('Caug');
    expect(altNames(r[0]!)).toHaveLength(2);
  });
});

describe('findChords scores', () => {
  it('scores are 0..100 integers that never go up the list', () => {
    for (const notes of ['C E G', 'E G', 'B D F A', 'C E Bb', 'C G', 'E G Bb D']) {
      for (const extended of [false, true]) {
        const scores = find(notes, { extended }).map((m) => m.score);
        expect(scores.length).toBeGreaterThan(0);
        for (const s of scores) {
          expect(Number.isInteger(s)).toBe(true);
          expect(s).toBeGreaterThanOrEqual(0);
          expect(s).toBeLessThanOrEqual(100);
        }
        for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]!);
      }
    }
  });

  it('results are sorted strictly by score, also with a bass and extended chords (C7/E, C/G)', () => {
    const scoresOf = (notes: string, bass: string | undefined, extended: boolean) =>
      find(notes, { bass, extended }).map((m) => m.score);
    // The user-test cases: E7alt (21) was listed above C9/E (43), G13sus4 (31) above C6/G (52).
    for (const [notes, bass] of [
      ['C E G Bb', 'E'],
      ['C E G', 'G'],
      ['C E G C#', 'E'],
      ['F A C G', 'G'],
      ['E G# B D', 'D'],
      ['A C E G', 'G'],
    ] as const) {
      for (const extended of [false, true]) {
        const scores = scoresOf(notes, bass, extended);
        for (let i = 1; i < scores.length; i++) expect(scores[i], `${notes} / ${bass}`).toBeLessThanOrEqual(scores[i - 1]!);
      }
    }
    const r = find('C E G Bb', { bass: 'E', extended: true });
    expect(indexOf(r, 'C9/E')).toBeLessThan(indexOf(r, 'E7alt'));
  });

  it('scores never increase down the list, for every bass of many selections', () => {
    for (const notes of ['C E G', 'C E G Bb', 'D F# A E', 'C Eb Gb A', 'E G Bb D', 'F A C G', 'C D E G', 'G B D F A']) {
      for (const bass of [undefined, ...notes.split(' ')]) {
        for (const extended of [false, true]) {
          const scores = find(notes, { bass, extended }).map((m) => m.score);
          for (let i = 1; i < scores.length; i++) expect(scores[i], `${notes} / ${bass}`).toBeLessThanOrEqual(scores[i - 1]!);
        }
      }
    }
  });

  it('groups come in order: exact, omitted, contains', () => {
    const order = { exact: 0, omitted: 1, contains: 2 };
    const groups = find('E G Bb D', { extended: true }).map((m) => order[m.group]);
    expect(groups).toEqual([...groups].sort((a, b) => a - b));
  });

  it('the bass on the root ranks higher than other inversions', () => {
    const root = find('C E G', { bass: 'C' })[0]!;
    const first = find('C E G', { bass: 'E' })[0]!;
    expect(root.score).toBeGreaterThan(first.score);
  });
});

describe('findChords filters and modes', () => {
  it('needs at least 2 notes', () => {
    expect(MIN_MATCH_NOTES).toBe(2);
    expect(find('C')).toEqual([]);
    expect(find('C C')).toEqual([]);
    expect(find('C E').length).toBeGreaterThan(0);
  });

  it('root filter keeps chords on that root and shows a collapsed card by its passing name', () => {
    const r = find('C E G A', { root: 'A' });
    expect(r.every((m) => pitchClass(m.chord.root) === pc('A'))).toBe(true);
    expect(name(r[0]!)).toBe('Am7');
    expect(altNames(r[0]!)).toContain('C6');
  });

  it('family filter keeps one quality family', () => {
    const r = find('E G', { family: 'minor' });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((m) => m.chord.type.family === 'minor')).toBe(true);
    expect(name(r[0]!)).toBe('Em');
  });

  it('extended tier adds extended chords only when enabled', () => {
    expect(byName(find('C E G Bb D A'), 'C13')).toBeUndefined();
    expect(byName(find('C E G Bb D A', { extended: true }), 'C13')!.group).toBe('exact');
  });

  it('exact mode returns only the exact group, including F/G style slash chords', () => {
    expect(names(find('C E G', { mode: 'exact' }))).toEqual(['C']);
    expect(find('E G', { mode: 'exact' })).toEqual([]);
    expect(names(find('F A C G', { bass: 'G', mode: 'exact' }))).toEqual(['F/G']);
  });

  it('partial mode marks selected, missing and omitted notes', () => {
    const cmaj7 = byName(find('C E G'), 'Cmaj7')!;
    expect(cmaj7.notes.map((n) => [n.interval, n.state])).toEqual([
      ['1', 'selected'],
      ['3', 'selected'],
      ['5', 'selected'],
      ['7', 'missing'],
    ]);
  });
});

describe('findChords with a key', () => {
  const fMajor = makeKey(pc('F'), 'ionian');

  it('marks diatonic chords and ranks them higher: C7 is diatonic in F, Cmaj7 is not', () => {
    const r = find('C E G', { key: fMajor });
    const c7 = byName(r, 'C7')!;
    const cmaj7 = byName(r, 'Cmaj7')!;
    expect(c7.diatonic).toBe(true);
    expect(cmaj7.diatonic).toBe(false);
    expect(indexOf(r, 'C7')).toBeLessThan(indexOf(r, 'Cmaj7'));
  });

  it('spells roots in the key: the same notes are Bb in F major and A# in F# major', () => {
    expect(name(find('Bb D F', { key: fMajor })[0]!)).toBe('Bb');
    const sharp = find('Bb D F', { key: makeKey(pc('F#'), 'ionian') })[0]!;
    expect(name(sharp)).toBe('A#');
    expect(sharp.notes.map((n) => chordName(makeChord(n.note, 'maj'), 'ascii'))).toEqual(['A#', 'C##', 'E#']);
  });

  it('follows sharp keys: Eb G Bb in E major is spelled D# F## A#', () => {
    const r = find('Eb G Bb', { key: makeKey(pc('E'), 'ionian') });
    expect(name(r[0]!)).toBe('D#');
    expect(r[0]!.notes.map((n) => n.note.letter)).toEqual(['D', 'F', 'A']);
  });

  it('no key: nothing is marked diatonic', () => {
    expect(find('C E G').some((m) => m.diatonic)).toBe(false);
  });

  it('minor keys mark the harmonic minor V, V7, vii° and vii°7 as diatonic', () => {
    const am = makeKey(9, 'aeolian');
    for (const [notes, chord] of [
      ['E G# B', 'E'],
      ['E G# B D', 'E7'],
      ['G# B D', 'G#dim'],
      ['G# B D F', 'G#dim7'],
    ] as const) {
      const m = byName(find(notes, { key: am }), chord)!;
      expect(m.diatonic, chord).toBe(true);
    }
    expect(chordFitsKey(makeChord(parseNote('E')!, '7'), am)).toBe(true);
    expect(byName(find('D F# A', { key: am }), 'D')!.diatonic).toBe(false);
  });

  it('avoids double accidentals on chromatic roots when the enharmonic root has none', () => {
    expect(name(find('C# E G Bb')[0]!)).toBe('C#dim7');
    expect(name(find('G# B D F')[0]!)).toBe('G#dim7');
    expect(name(find('C E G#', { key: makeKey(6, 'ionian') })[0]!)).toBe('Caug');
    expect(name(find('E G B', { key: makeKey(1, 'ionian') })[0]!)).toBe('Em');
    // Diatonic roots keep the key's letters: the V7 of G# minor has F##.
    expect(name(find('D# F## A# C#', { key: makeKey(8, 'aeolian') })[0]!)).toBe('D#7');
  });

  it('chordFitsKey ignores tensions (G7b9 fits C major)', () => {
    const c = makeKey(0, 'ionian');
    expect(chordFitsKey(makeChord(parseNote('G')!, '7b9'), c)).toBe(true);
    expect(chordFitsKey(makeChord(parseNote('D')!, '7'), c)).toBe(false);
  });
});

describe('findChords readable spelling', () => {
  const shown = (m: ChordMatch) => [name(m), ...m.notes.map((n) => formatNote(n.note, 'ascii'))].join(' ');

  it('tensions avoid double accidentals: E7alt shows G for the #9', () => {
    const e7alt = byName(find('C E G Bb', { bass: 'E', extended: true }), 'E7alt')!;
    expect(e7alt.notes.map((n) => formatNote(n.note, 'ascii'))).toEqual(['E', 'G#', 'D', 'F', 'G', 'A#', 'C']);
  });

  it('basses never use double accidentals, F♭, C♭, E♯ or B♯ outside a key that needs them', () => {
    for (const m of [...find('C E G C#', { bass: 'E', extended: true }), ...find('C E G', { bass: 'G', extended: true })]) {
      for (const chord of [m.chord, ...m.alternates]) {
        expect(chordName(chord, 'ascii'), shown(m)).not.toMatch(/\/([A-G](##|bb)|Fb|Cb|E#|B#)$/);
      }
    }
    expect(names(find('C E G', { bass: 'G', extended: true }))).toContain('E7alt/G');
    // In C# major the scale has E# and B#, so a chord-tone bass keeps them.
    expect(name(find('C# E# G#', { bass: 'F', key: makeKey(1, 'ionian', parseNote('C#')!) })[0]!)).toBe('C#/E#');
    expect(name(find('C# F G#', { bass: 'F' })[0]!)).toBe('C#/F');
  });

  it('chromatic roots avoid F♭, C♭, E♯ and B♯: E major in D♭ major is E, not F♭', () => {
    const db = makeKey(1, 'ionian');
    expect(name(find('E G# B', { key: db })[0]!)).toBe('E');
    expect(name(find('B D# F#', { key: db })[0]!)).toBe('B');
    // Scale roots keep the key's letters: C♭ in G♭ major.
    expect(name(find('B D# F#', { key: makeKey(6, 'ionian', parseNote('Gb')!) })[0]!)).toBe('Cb');
  });
});

describe('chordsForRootAndFamily', () => {
  it('lists the chords of a root and family, simplest first', () => {
    const list = chordsForRootAndFamily(pc('D'), 'minor').map((c) => chordName(c, 'ascii'));
    expect(list[0]).toBe('Dm');
    expect(list).toEqual(expect.arrayContaining(['Dm7', 'Dm6', 'Dm9', 'Dmadd9']));
    expect(list).not.toContain('Dm11');
  });

  it('adds extended chords when enabled and spells the root in the key', () => {
    const list = chordsForRootAndFamily(pc('A#'), 'dominant', { extended: true, key: makeKey(pc('F'), 'ionian') });
    expect(list.map((c) => chordName(c, 'ascii'))).toEqual(expect.arrayContaining(['Bb7', 'Bb13', 'Bb7alt']));
  });
});
