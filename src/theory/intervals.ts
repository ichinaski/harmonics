// Intervals are named by scale degree relative to the major scale, with an
// optional alteration: '1', 'b3', '#5', 'bb7', 'b9', '#11', '13'.
// The degree fixes the letter distance, the alteration fixes the semitones,
// which is what makes spelling from a root exact (a major 3rd above C# is E#).

import { LETTERS, letterIndex, mod12, pitchClass, type Note } from './notes';

/** An interval name such as '1', 'b3', '#11' or 'bb7'. */
export type IntervalName = string;

export interface Interval {
  name: IntervalName;
  /** Scale degree, 1..15 ('9' is 9). */
  degree: number;
  /** Letter steps above the root (degree - 1; a 9th is 8 steps). */
  steps: number;
  /** Semitones above the root (a 9th is 14). */
  semitones: number;
  /** Alteration relative to the major/perfect interval: -2..2. */
  alteration: number;
}

/** Semitones of the major-scale degrees 1..7. */
const MAJOR_DEGREE_SEMITONES = [0, 2, 4, 5, 7, 9, 11] as const;

const INTERVAL_RE = /^(bb|b|##|#)?(\d{1,2})$/;

/** Parses an interval name. Returns null when it isn't one. */
export function parseInterval(name: IntervalName): Interval | null {
  const m = INTERVAL_RE.exec(name);
  if (!m) return null;
  const degree = Number(m[2]);
  if (degree < 1 || degree > 15) return null;
  const prefix = m[1] ?? '';
  const alteration = prefix.startsWith('#') ? prefix.length : -prefix.length;
  const steps = degree - 1;
  const semitones = MAJOR_DEGREE_SEMITONES[steps % 7]! + 12 * Math.floor(steps / 7) + alteration;
  return { name, degree, steps, semitones, alteration };
}

function requireInterval(name: IntervalName): Interval {
  const interval = parseInterval(name);
  if (!interval) throw new Error(`Unknown interval "${name}"`);
  return interval;
}

export function intervalSemitones(name: IntervalName): number {
  return requireInterval(name).semitones;
}

export function intervalSteps(name: IntervalName): number {
  return requireInterval(name).steps;
}

/** Scale degree of an interval name: 'b3' → 3, '#11' → 11. */
export function intervalDegree(name: IntervalName): number {
  return requireInterval(name).degree;
}

/** Spells the note at an interval above a root: transpose(C#, '3') = E#, transpose(Db, '3') = F. */
export function transpose(root: Note, name: IntervalName): Note {
  const interval = requireInterval(name);
  const letter = LETTERS[(letterIndex(root.letter) + interval.steps) % 7]!;
  const targetPc = pitchClass(root) + interval.semitones;
  const naturalPc = pitchClass({ letter, acc: 0 });
  let acc = mod12(targetPc - naturalPc);
  if (acc > 6) acc -= 12;
  return { letter, acc };
}

/**
 * Simple interval name (degree 1..7) from one spelled note up to another, using
 * the letters: C→Eb is 'b3', C→D# is '#2', C→F# is '#4', C→Gb is 'b5'.
 */
export function intervalBetween(from: Note, to: Note): IntervalName {
  const steps = (letterIndex(to.letter) - letterIndex(from.letter) + 7) % 7;
  let alteration = mod12(pitchClass(to) - pitchClass(from)) - MAJOR_DEGREE_SEMITONES[steps]!;
  if (alteration > 6) alteration -= 12;
  if (alteration < -6) alteration += 12;
  const prefix = alteration > 0 ? '#'.repeat(alteration) : 'b'.repeat(-alteration);
  return prefix + String(steps + 1);
}

/**
 * The interval name used for each semitone above a tonic, relative to the major
 * scale: the major-scale degrees plus b2, b3, #4, b6, b7 for the chromatic ones.
 * This is the naming used for roman numerals (bIII, bVII, #IV°).
 */
export const CHROMATIC_DEGREE_NAMES: readonly IntervalName[] = [
  '1',
  'b2',
  '2',
  'b3',
  '3',
  '4',
  '#4',
  '5',
  'b6',
  '6',
  'b7',
  '7',
];
