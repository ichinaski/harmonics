import { describe, expect, it } from 'vitest';
import { chordName, makeChord, parseChord, type Chord } from '../src/theory/chords';
import { chordAlternates } from '../src/theory/chordFinder';
import { LETTER_PITCH_CLASS, formatNote, note, type Note } from '../src/theory/notes';
import { chordNoteDetails, chordVoicing, chordVoicingMidi, intervalLabel, inversionName } from '../src/theory/voicings';

const chord = (text: string): Chord => {
  const r = parseChord(text);
  if (!r.ok) throw new Error(r.error);
  return r.chord;
};
/** Scientific octave of a spelled note: it follows the letter, so MIDI 59 spelled C♭ is C♭4. */
const noteOctave = (n: Note, midi: number) => (midi - LETTER_PITCH_CLASS[n.letter] - n.acc) / 12 - 1;
/** 'C3 E3 G3' */
const spelled = (text: string) =>
  chordVoicing(chord(text))
    .map((n) => formatNote(n.note, 'ascii') + noteOctave(n.note, n.midi))
    .join(' ');

describe('chordVoicing', () => {
  it('root position: close, stacked from a root in C3..B3', () => {
    expect(spelled('C')).toBe('C3 E3 G3');
    expect(spelled('C7')).toBe('C3 E3 G3 Bb3');
    expect(chordVoicingMidi(chord('Bbmaj7'))).toEqual([58, 62, 65, 69]);
    expect(chordVoicingMidi(chord('B7'))).toEqual([59, 63, 66, 69]);
  });

  it('keeps extensions above the 7th in root position', () => {
    expect(spelled('C9')).toBe('C3 E3 G3 Bb3 D4');
    expect(chordVoicingMidi(chord('C13'))).toEqual([48, 52, 55, 58, 62, 69]);
  });

  it('spells chord tones from the root: Db7 and F#m7b5', () => {
    expect(spelled('Db7')).toBe('Db3 F3 Ab3 Cb4');
    expect(spelled('F#m7b5/A')).toBe('A3 C4 E4 F#4');
  });

  it('enharmonic roots sound the same', () => {
    expect(chordVoicingMidi(chord('C#7'))).toEqual(chordVoicingMidi(chord('Db7')));
    expect(chordVoicingMidi(makeChord(note('B', 1), 'maj'))).toEqual([48, 52, 55]);
  });

  it('a chord-tone bass gives the inversion, with the bass at the bottom in C3..B3', () => {
    expect(spelled('C/E')).toBe('E3 G3 C4');
    expect(spelled('C/G')).toBe('G3 C4 E4');
    expect(spelled('C7/Bb')).toBe('Bb3 C4 E4 G4');
    expect(spelled('Am7/G')).toBe('G3 A3 C4 E4');
  });

  it('a bass on an extension goes under the rest of the chord in root position', () => {
    expect(spelled('C9/D')).toBe('D3 C4 E4 G4 Bb4');
  });

  it('a bass outside the chord goes below the root position chord, within an octave', () => {
    expect(spelled('F/G')).toBe('G2 F3 A3 C4');
    expect(chordVoicingMidi(chord('Am/G'))).toEqual([55, 57, 60, 64]);
    expect(chordVoicing(chord('F/G'))[0]!.interval).toBeNull();
  });

  it('notes always go up', () => {
    for (const text of ['C/E', 'C7/Bb', 'C13/A', 'F/G', 'C7alt/E', 'Cm6/A']) {
      const midi = chordVoicingMidi(chord(text));
      expect([...midi].sort((a, b) => a - b)).toEqual(midi);
      expect(new Set(midi).size).toBe(midi.length);
    }
  });
});

describe('inversionName', () => {
  it.each([
    ['C', 'Root position'],
    ['C/E', '1st inversion'],
    ['Cm/Eb', '1st inversion'],
    ['Csus4/F', '1st inversion'],
    ['Csus2/D', '1st inversion'],
    ['C/G', '2nd inversion'],
    ['Cdim/Gb', '2nd inversion'],
    ['C7/Bb', '3rd inversion'],
    ['Am7/G', '3rd inversion'],
    ['Cdim7/Bbb', '3rd inversion'],
    ['C6/A', '3rd inversion'],
    ['C9/D', 'Bass on the 9th'],
    ['Cadd11/F', 'Bass on the 11th'],
    ['C13/A', 'Bass on the 13th'],
    ['C7b9/Db', 'Bass on the ♭9'],
    ['F/G', 'Bass not in chord'],
    ['C/D', 'Bass not in chord'],
    ['C/Bb', 'Bass on the ♭7 (same notes as C7, 3rd inversion)'],
    ['C/B', 'Bass on the 7 (same notes as Cmaj7, 3rd inversion)'],
    ['C/A', 'Bass on the 6 (same notes as C6, 3rd inversion)'],
    ['Am/G', 'Bass on the ♭7 (same notes as Am7, 3rd inversion)'],
    ['Cm/A', 'Bass on the 6 (same notes as Cm6, 3rd inversion)'],
    ['Cdim/Bb', 'Bass on the ♭7 (same notes as Cm7♭5, 3rd inversion)'],
    ['Csus4/Bb', 'Bass on the ♭7 (same notes as C7sus4, 3rd inversion)'],
  ])('%s: %s', (text, name) => {
    expect(inversionName(chord(text))).toBe(name);
  });
});

describe('intervalLabel', () => {
  it('uses ♭ and ♯', () => {
    expect(['1', '3', 'b7', '#11', 'bb7', '13'].map(intervalLabel)).toEqual(['1', '3', '♭7', '♯11', '♭♭7', '13']);
  });
});

describe('chordAlternates', () => {
  const names = (text: string) => chordAlternates(chord(text)).map((c) => chordName(c));

  it('names the same notes another way, with the chord’s bass (or root) as the bass', () => {
    expect(names('C6')).toEqual(['Am7/C']);
    expect(names('Am7')).toEqual(['C6/A']);
    expect(names('C6/A')).toEqual(['Am7']);
    expect(names('Cm6')).toEqual(['Am7♭5/C']);
  });

  it('leaves out names whose bass is not one of their chord tones', () => {
    expect(names('Cmaj7')).toEqual([]);
    expect(names('C7/B♭')).not.toContain('C/B♭');
    expect(names('F/G')).toEqual(['Fadd9/G']);
  });

  it('is empty when there is no other name', () => {
    expect(names('C')).toEqual([]);
    expect(names('C/E')).toEqual([]);
  });

  it('spells alternates like the chord', () => {
    expect(names('Db6')).toEqual(['B♭m7/D♭']);
    expect(names('C#6')).toEqual(['A♯m7/C♯']);
    expect(names('Caug')).toEqual(['Eaug/C', 'A♭aug/C']);
  });

  it('lists every name of a symmetric chord', () => {
    expect(names('Cdim7')).toEqual(expect.arrayContaining(['D♯°7/C', 'F♯°7/C', 'A°7/C']));
  });
});

describe('chordNoteDetails', () => {
  const details = (text: string) => chordNoteDetails(chord(text));
  const row = (text: string) =>
    details(text)
      .notes.map((n) => `${formatNote(n.note)} ${n.label}`)
      .join(' · ');

  it('lists the notes bottom to top with their intervals', () => {
    expect(row('C7/E')).toBe('E 3 · G 5 · B♭ ♭7 · C 1');
    expect(row('Cmaj7')).toBe('C 1 · E 3 · G 5 · B 7');
    expect(row('F/G')).toBe('G bass · F 1 · A 3 · C 5');
  });

  it('a bass on the ♭7, 7 or 6 names the 7th or 6th chord with the same notes, listed first among the alternates', () => {
    const d = details('C/B♭');
    expect(d.inversion).toBe('Bass on the ♭7 (same notes as C7, 3rd inversion)');
    expect(d.alternates.map((c) => chordName(c))[0]).toBe('C7/B♭');
    const a = details('C/A');
    expect(a.alternates.map((c) => chordName(c)).slice(0, 2)).toEqual(['C6/A', 'Am7']);
    expect(details('Am/G').alternates.map((c) => chordName(c))[0]).toBe('Am7/G');
  });

  it('names the inversion and the alternates', () => {
    const c6 = details('C6');
    expect(c6.inversion).toBe('Root position');
    expect(c6.alternates.map((c) => chordName(c))).toEqual(['Am7/C']);
    expect(details('C7/E').inversion).toBe('1st inversion');
    expect(details('F/G').inversion).toBe('Bass not in chord');
  });

  it('notes follow the voicing', () => {
    expect(details('Am7/G').notes.map((n) => n.midi)).toEqual(chordVoicingMidi(chord('Am7/G')));
  });
});
