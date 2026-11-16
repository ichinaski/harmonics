// Sweeps every root, chord type and key (12 tonics x 7 modes, plus no key)
// and checks the spelling rules: no note ever needs more than a double
// accidental, chromatic chords avoid double accidentals whenever the plain
// sharp or flat spelling of the root avoids them, chord names (root and
// bass) never use a double accidental nor F♭, C♭, E♯ or B♯ unless the key's
// scale has that note, and tensions (9, 11, 13) never need a double accidental.

import { describe, expect, it } from 'vitest';
import { chordAlternates, findChords, chordsForRootAndFamily, spellChordBass, spellChordRoot } from '../src/theory/chordFinder';
import { CHORD_TYPES, QUALITY_FAMILIES, chordNotes, chordName, chordTones, makeChord, spellBassFromRoot, type Chord } from '../src/theory/chords';
import { intervalDegree } from '../src/theory/intervals';
import { diatonicChords } from '../src/theory/diatonic';
import { analyseInKey } from '../src/theory/keyFinder';
import { LETTERS, naturalLetter, noteEquals, pitchClass, spellPitchClass, type Note } from '../src/theory/notes';
import { MODE_IDS, keyName, keyPcSet, keyScale, makeKey, type Key } from '../src/theory/scales';

const KEYS: Key[] = MODE_IDS.flatMap((mode) => Array.from({ length: 12 }, (_, pc) => makeKey(pc, mode)));
const CONTEXTS: (Key | null)[] = [null, ...KEYS];
const contextName = (key: Key | null) => (key ? keyName(key, 'ascii') : 'no key');

const maxAcc = (notes: readonly Note[]) => Math.max(...notes.map((n) => Math.abs(n.acc)));

/** Every note a chord shows: its tones and its bass. */
function shownNotes(chord: Chord): Note[] {
  return chord.bass ? [...chordNotes(chord), chord.bass] : chordNotes(chord);
}

/** True when the root is chromatic in the context (always, without a key). */
function isChromaticRoot(chord: Chord, key: Key | null): boolean {
  return key === null || !(keyPcSet(key) & (1 << pitchClass(chord.root)));
}

/** A chromatic chord may only show a double accidental when both plain spellings of its root would too. */
function doublesUnavoidable(chord: Chord): boolean {
  const pc = pitchClass(chord.root);
  return [spellPitchClass(pc, 'sharp'), spellPitchClass(pc, 'flat')].every(
    (root) => maxAcc(chordNotes({ root, type: chord.type })) >= 2,
  );
}

/** Problems with a chord's spelling, collected so a sweep reports them all at once (and stays fast). */
const problems: string[] = [];

/** E♯, B♯, F♭ or C♭ (a white key spelled with an accidental) that the key's scale doesn't have. */
function isOddOutsideKey(n: Note, key: Key | null): boolean {
  if (n.acc === 0 || naturalLetter(pitchClass(n)) === undefined) return false;
  return !(key && keyScale(key).some((s) => noteEquals(s, n)));
}

/** Problems with the notes in a chord name: its root and bass. */
function checkName(chord: Chord, key: Key | null, label: string): void {
  if (Math.abs(chord.root.acc) > 1) problems.push(`${label}: root has a double accidental`);
  if (chord.bass && Math.abs(chord.bass.acc) > 1) problems.push(`${label}: bass has a double accidental`);
  if (isOddOutsideKey(chord.root, key)) problems.push(`${label}: root is spelled E#, B#, Fb or Cb outside the key`);
  if (chord.bass && isOddOutsideKey(chord.bass, key)) problems.push(`${label}: bass is spelled E#, B#, Fb or Cb outside the key`);
  const tensions = chordTones(chord).filter((t) => intervalDegree(t.interval) > 7);
  if (tensions.some((t) => Math.abs(t.note.acc) > 1)) problems.push(`${label}: a tension has a double accidental`);
}

function checkChord(chord: Chord, key: Key | null): void {
  const label = `${chordName(chord, 'ascii')} in ${contextName(key)}`;
  if (maxAcc(shownNotes(chord)) > 2) problems.push(`${label}: more than a double accidental`);
  checkName(chord, key, label);
  if (isChromaticRoot(chord, key) && maxAcc(chordNotes(chord)) >= 2 && !doublesUnavoidable(chord)) {
    problems.push(`${label}: avoidable double accidental on a chromatic chord`);
  }
}

/** Runs a sweep and fails with the first few problems it found. */
function sweep(run: () => void): void {
  problems.length = 0;
  run();
  expect(problems.slice(0, 10)).toEqual([]);
}

// Exhaustive sweeps: a few seconds locally, slower on CI runners.
describe('spelling sweep', { timeout: 30_000 }, () => {
  it('spellChordRoot: every root pc x chord type x key', () => {
    sweep(() => {
      for (const key of CONTEXTS) {
        for (const type of CHORD_TYPES) {
          for (let pc = 0; pc < 12; pc++) checkChord(makeChord(spellChordRoot(pc, type, key), type), key);
        }
      }
    });
  });

  it('chord finder results in every key: every root and chord type (extended on), via selections of its root and 3rd, sus note or 5th', () => {
    sweep(() => {
      // Every chord type holds its root plus a note 2, 3, 4, 5 or 7 semitones up, so these pairs reach every candidate.
      const steps = [2, 3, 4, 5, 7];
      for (const key of CONTEXTS) {
        for (let root = 0; root < 12; root++) {
          for (const step of steps) {
            for (const m of findChords([root, (root + step) % 12], { key, extended: true, root })) {
              for (const chord of [m.chord, ...m.alternates]) checkChord(chord, key);
              if (maxAcc(m.notes.map((n) => n.note)) > 2) problems.push(`${chordName(m.chord, 'ascii')} notes in ${contextName(key)}`);
            }
          }
        }
      }
    });
  });

  it('chord finder slash chords over every bass in every key', () => {
    sweep(() => {
      for (const key of CONTEXTS) {
        for (let root = 0; root < 12; root++) {
          const triad = [root, root + 4, root + 7].map((p) => p % 12);
          for (let bass = 0; bass < 12; bass++) {
            if (triad.includes(bass)) continue;
            for (const m of findChords([bass, ...triad], { key, bass, mode: 'exact' })) {
              for (const chord of [m.chord, ...m.alternates]) checkChord(chord, key);
              if (m.nonChordBass && Math.abs(m.chord.bass!.acc) > 1) problems.push(`${chordName(m.chord, 'ascii')}: bass`);
            }
          }
        }
      }
    });
  });

  it('chord-tone basses in every key: every root, chord type and tone in the bass', () => {
    sweep(() => {
      for (const key of CONTEXTS) {
        for (const type of CHORD_TYPES) {
          for (let pc = 0; pc < 12; pc++) {
            const root = spellChordRoot(pc, type, key);
            for (const t of chordTones({ root, type })) {
              if (t.interval === '1') continue;
              checkChord(makeChord(root, type, spellChordBass(root, type, t.pc, key)), key);
            }
          }
        }
      }
    });
  });

  it('chord finder inversions of common chords in every key', () => {
    sweep(() => {
      for (const key of CONTEXTS) {
        for (const typeId of ['7', 'dim7', 'aug', '7alt']) {
          const type = CHORD_TYPES.find((t) => t.id === typeId)!;
          for (let pc = 0; pc < 12; pc++) {
            const tones = chordTones({ root: spellChordRoot(pc, type, key), type });
            for (const bass of [tones[1]!.pc, tones[tones.length - 1]!.pc]) {
              for (const m of findChords(tones.map((t) => t.pc), { key, bass, extended: true, mode: 'exact' })) {
                for (const chord of [m.chord, ...m.alternates]) checkChord(chord, key);
              }
            }
          }
        }
      }
    });
  });

  it('Chord notes alternates: every root, chord type and bass, no key', () => {
    sweep(() => {
      for (const type of CHORD_TYPES) {
        for (let pc = 0; pc < 12; pc++) {
          const root = spellChordRoot(pc, type);
          for (const t of chordTones({ root, type })) {
            const chord = makeChord(root, type, t.pc);
            checkChord(chord, null);
            for (const alt of chordAlternates(chord)) checkChord(alt, null);
          }
        }
      }
    });
  });

  it('a bass outside the chord never needs a double accidental', () => {
    for (const letter of LETTERS) {
      for (const acc of [-1, 0, 1]) {
        for (let bass = 0; bass < 12; bass++) {
          expect(Math.abs(spellBassFromRoot({ letter, acc }, bass).acc)).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('chord lists for a root and family in every key', () => {
    sweep(() => {
      for (const key of CONTEXTS) {
        for (const family of QUALITY_FAMILIES) {
          for (let pc = 0; pc < 12; pc++) {
            for (const chord of chordsForRootAndFamily(pc, family, { key, extended: true })) checkChord(chord, key);
          }
        }
      }
    });
  });

  it('key finder numerals and explanations never show a double accidental', () => {
    sweep(() => {
      for (const key of KEYS) {
        for (const type of CHORD_TYPES) {
          for (let pc = 0; pc < 12; pc++) {
            const chord = makeChord(spellChordRoot(pc, type), type);
            for (const c of analyseInKey([chord], key).chords) {
              const text = [c.numeral, c.explanation, c.target?.numeral ?? ''].join(' ');
              if (/[♯♭]{2}/u.test(text)) problems.push(`${chordName(chord, 'ascii')} in ${contextName(key)}: ${text}`);
            }
          }
        }
      }
    });
  });

  it('diatonic, secondary dominant and borrowed chords stay within double accidentals', () => {
    sweep(() => {
      for (const key of KEYS) {
        const d = diatonicChords(key);
        const chords = [
          ...d.degrees.flatMap((x) => [x.triad.chord, x.seventh.chord]),
          ...d.secondaryDominants.map((s) => s.chord),
          ...d.borrowed.flatMap((s) => [...s.triads, ...s.sevenths].map((b) => b.chord)),
        ];
        for (const chord of chords) {
          if (maxAcc(shownNotes(chord)) > 2) problems.push(`${chordName(chord, 'ascii')} in ${contextName(key)}`);
        }
      }
    });
  });
});
