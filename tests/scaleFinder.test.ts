import { describe, expect, it } from 'vitest';
import { defaultSpelling, formatNote, parseNote, pitchClass, type Note } from '../src/theory/notes';
import { findScaleGroups, findScales, scaleMatchKey, scaleName, type ScaleMatch } from '../src/theory/scaleFinder';

const pcs = (text: string) => text.split(' ').map((t) => pitchClass(parseNote(t)!));
const ascii = (n: Note) => formatNote(n, 'ascii');
const label = (m: ScaleMatch) => `${ascii(m.tonic)} ${m.scale.name}`;
const notes = (list: Note[]) => list.map(ascii).join(' ');
/** The tonic as the tonic picker spells it (C#, Eb, F#, Ab, Bb). */
const tonic = (pc: number) => defaultSpelling(pc);

describe('scaleName', () => {
  it('capitalises modes, lowercases other scales', () => {
    expect(scaleName(parseNote('D')!, 'dorian')).toBe('D Dorian');
    expect(scaleName(parseNote('A')!, 'harmonicMinor')).toBe('A harmonic minor');
    expect(scaleName(parseNote('Eb')!, 'majorPentatonic')).toBe('E♭ major pentatonic');
  });
});

describe('findScales with a tonic', () => {
  it('lists the scales on that tonic that contain the notes, exact first, then fewest extra notes', () => {
    const r = findScales(pcs('C D E G A'), { tonic: tonic(0) });
    expect(r.map(label)).toEqual(['C Major pentatonic', 'C Ionian', 'C Mixolydian', 'C Lydian']);
    expect(r[0]!.exact).toBe(true);
    expect(notes(r[1]!.extra)).toBe('F B');
  });

  it('counts the chosen tonic as selected', () => {
    const r = findScales(pcs('E F'), { tonic: tonic(0) });
    expect(r.map(label)).toEqual(['C Ionian', 'C Mixolydian']);
    expect(notes(r[0]!.extra)).toBe('D G A B');
  });

  it('spells every result from the chosen tonic (E♭ Phrygian, 7 flats), unless its key is theoretical (D♯ Locrian)', () => {
    const eb = findScales(pcs('Gb Bb'), { tonic: tonic(3) });
    expect(eb.map(label)).toEqual([
      'Eb Minor pentatonic',
      'Eb Blues',
      'Eb Aeolian',
      'Eb Dorian',
      'Eb Harmonic minor',
      'Eb Melodic minor',
      'Eb Phrygian',
    ]);
    expect(notes(eb.find((m) => m.scale.id === 'aeolian')!.notes)).toBe('Eb F Gb Ab Bb Cb Db');
    expect(notes(eb.find((m) => m.scale.id === 'phrygian')!.notes)).toBe('Eb Fb Gb Ab Bb Cb Db');
    expect(scaleMatchKey(eb.find((m) => m.scale.id === 'phrygian')!)).toEqual({ tonic: parseNote('Eb'), mode: 'phrygian' });
    const locrian = findScales(pcs('Eb'), { tonic: tonic(3) }).find((m) => m.scale.id === 'locrian')!;
    expect(label(locrian)).toBe('D# Locrian');
    const cs = findScales(pcs('C#'), { tonic: tonic(1) });
    expect(ascii(cs.find((m) => m.scale.id === 'ionian')!.tonic)).toBe('C#');
    expect(ascii(cs.find((m) => m.scale.id === 'lydian')!.tonic)).toBe('Db');
    const ab = findScales(pcs('Ab'), { tonic: tonic(8) });
    expect(ascii(ab.find((m) => m.scale.id === 'aeolian')!.tonic)).toBe('Ab');
    expect(ascii(ab.find((m) => m.scale.id === 'phrygian')!.tonic)).toBe('G#');
    // Any spelling is honoured the same way: D# minor, but Eb major (D# major is theoretical).
    const ds = findScales(pcs('D#'), { tonic: parseNote('D#') });
    expect(ascii(ds.find((m) => m.scale.id === 'aeolian')!.tonic)).toBe('D#');
    expect(ascii(ds.find((m) => m.scale.id === 'ionian')!.tonic)).toBe('Eb');
  });

  it('a 7-note selection matches exactly one mode per tonic', () => {
    const r = findScales(pcs('D E F G A B C'), { tonic: tonic(2) });
    expect(r.map(label)).toEqual(['D Dorian']);
    expect(r[0]!.exact).toBe(true);
    expect(scaleMatchKey(r[0]!)).toEqual({ tonic: parseNote('D'), mode: 'dorian' });
  });

  it('melodic minor, harmonic minor and blues are candidates', () => {
    expect(findScales(pcs('A B C D E F# G#'), { tonic: tonic(9) }).map(label)).toEqual(['A Melodic minor']);
    expect(findScales(pcs('A B C D E F G#'), { tonic: tonic(9) }).map(label)).toEqual(['A Harmonic minor']);
    const blues = findScales(pcs('A C D Eb E G'), { tonic: tonic(9) });
    expect(blues.map(label)).toEqual(['A Blues']);
    expect(scaleMatchKey(blues[0]!)).toBeNull();
  });

  it('returns nothing without notes', () => {
    expect(findScales([], { tonic: tonic(0) })).toEqual([]);
    expect(findScaleGroups([])).toEqual([]);
  });
});

describe('findScaleGroups without a tonic', () => {
  it('groups the 7 modes of one parent scale, with the first selected note’s mode on top', () => {
    const groups = findScaleGroups(pcs('D E F G A B C'));
    expect(groups).toHaveLength(1);
    const [g] = groups;
    expect(g!.name).toBe('C major family');
    expect(g!.exact).toBe(true);
    expect(g!.matches.map(label)).toEqual([
      'D Dorian',
      'C Ionian',
      'E Phrygian',
      'F Lydian',
      'G Mixolydian',
      'A Aeolian',
      'B Locrian',
    ]);
  });

  it('orders groups exact first, then by fewest extra notes', () => {
    const groups = findScaleGroups(pcs('A C E'));
    const extras = groups.map((g) => g.extraCount);
    expect([...extras].sort((a, b) => a - b)).toEqual(extras);
    expect(groups[0]!.name).toBe('C major pentatonic family');
    expect(groups[0]!.matches.map(label)).toEqual(['A Minor pentatonic', 'C Major pentatonic']);
    const families = groups.filter((g) => g.name.endsWith(' major family'));
    expect(families[0]!.name).toBe('C major family');
    expect(label(families[0]!.matches[0]!)).toBe('A Aeolian');
  });

  it('spells every member of a group from its top member', () => {
    const groups = findScaleGroups(pcs('Eb F Gb Ab Bb Cb Db'));
    expect(groups[0]!.name).toBe('G♭ major family');
    expect(groups[0]!.matches.map(label)).toEqual([
      'Eb Aeolian',
      'Gb Ionian',
      'Ab Dorian',
      'Bb Phrygian',
      'Cb Lydian',
      'Db Mixolydian',
      'F Locrian',
    ]);
    const sharp = findScaleGroups(pcs('F# G# A# B C# D# E#'));
    expect(sharp[0]!.name).toBe('F♯ major family');
    expect(sharp[0]!.matches.map((m) => ascii(m.tonic))).toEqual(['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#']);
  });

  it('keeps scales without relatives as their own group', () => {
    const groups = findScaleGroups(pcs('A B C D E F G#'));
    expect(groups.map((g) => g.name)).toEqual(['A harmonic minor']);
    expect(groups[0]!.matches).toHaveLength(1);
  });

  it('marks extra notes per member', () => {
    const [g, next] = findScaleGroups(pcs('C E G B D'));
    expect(g!.name).toBe('C major family');
    expect(next!.name).toBe('G major family');
    expect(label(next!.matches[0]!)).toBe('C Lydian');
    expect(g!.extraCount).toBe(2);
    for (const m of g!.matches) expect(m.extra).toHaveLength(2);
    expect(notes(g!.matches[0]!.extra)).toBe('F A');
    expect(notes(g!.matches[1]!.extra)).toBe('F A');
  });
});
