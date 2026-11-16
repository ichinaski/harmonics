// Notes are stored spelled (letter + accidental), never as bare pitch numbers.
// Pitch classes and pitch-class sets are derived from them for matching.

export type Letter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

/** A spelled note. `acc` counts semitones of alteration: -1 flat, 1 sharp, 2 double sharp. */
export interface Note {
  letter: Letter;
  acc: number;
}

/** 0..11, C = 0. */
export type PitchClass = number;

export type AccidentalStyle = 'unicode' | 'ascii';

export const LETTERS: readonly Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

export const LETTER_PITCH_CLASS: Readonly<Record<Letter, PitchClass>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

export function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

export function note(letter: Letter, acc = 0): Note {
  return { letter, acc };
}

export function letterIndex(letter: Letter): number {
  return LETTERS.indexOf(letter);
}

export function pitchClass(n: Note): PitchClass {
  return mod12(LETTER_PITCH_CLASS[n.letter] + n.acc);
}

/** MIDI number of a note in scientific pitch notation (C4 = 60). The octave follows the letter, so B#3 = 60. */
export function toMidi(n: Note, octave: number): number {
  return 12 * (octave + 1) + LETTER_PITCH_CLASS[n.letter] + n.acc;
}

export function noteEquals(a: Note, b: Note): boolean {
  return a.letter === b.letter && a.acc === b.acc;
}

export function isEnharmonic(a: Note, b: Note): boolean {
  return pitchClass(a) === pitchClass(b);
}

// ---------------------------------------------------------------------------
// Parsing and formatting

const NOTE_RE = /^([A-Ga-g])(#{1,2}|♯{1,2}|b{1,2}|♭{1,2}|𝄪|𝄫|x|♮)?$/u;

function accidentalValue(text: string | undefined): number {
  if (!text || text === '♮') return 0;
  if (text === '𝄪' || text === 'x') return 2;
  if (text === '𝄫') return -2;
  const sharps = [...text].filter((c) => c === '#' || c === '♯').length;
  const flats = [...text].filter((c) => c === 'b' || c === '♭').length;
  return sharps - flats;
}

/** Parses 'C', 'Bb', 'F#', 'B♭', 'F♯♯', 'E𝄫', 'Fx', 'G♮'. Returns null for anything else. */
export function parseNote(text: string): Note | null {
  const m = NOTE_RE.exec(text.trim());
  if (!m) return null;
  return { letter: m[1]!.toUpperCase() as Letter, acc: accidentalValue(m[2]) };
}

export function formatAccidental(acc: number, style: AccidentalStyle = 'unicode'): string {
  if (acc === 0) return '';
  const sign = acc > 0 ? (style === 'unicode' ? '♯' : '#') : style === 'unicode' ? '♭' : 'b';
  return sign.repeat(Math.abs(acc));
}

/** 'B♭' (unicode, default) or 'Bb' (ascii). Double accidentals repeat the sign: 'F♯♯', 'Bbb'. */
export function formatNote(n: Note, style: AccidentalStyle = 'unicode'): string {
  return n.letter + formatAccidental(n.acc, style);
}

// ---------------------------------------------------------------------------
// Spelling helpers

/** Context-free spelling: naturals for white keys, C# Eb F# Ab Bb for black keys. */
const DEFAULT_SPELLINGS: readonly Note[] = [
  note('C'),
  note('C', 1),
  note('D'),
  note('E', -1),
  note('E'),
  note('F'),
  note('F', 1),
  note('G'),
  note('A', -1),
  note('A'),
  note('B', -1),
  note('B'),
];

export function defaultSpelling(pc: PitchClass): Note {
  return { ...DEFAULT_SPELLINGS[mod12(pc)]! };
}

/** Spells a pitch class with sharps or flats for black keys; white keys stay natural. */
export function spellPitchClass(pc: PitchClass, prefer: 'sharp' | 'flat'): Note {
  const p = mod12(pc);
  const natural = naturalLetter(p);
  if (natural) return note(natural);
  return prefer === 'sharp' ? note(naturalLetter(p - 1)!, 1) : note(naturalLetter(p + 1)!, -1);
}

/** The letter whose natural note has this pitch class, or undefined for black keys. */
export function naturalLetter(pc: PitchClass): Letter | undefined {
  const p = mod12(pc);
  return LETTERS.find((l) => LETTER_PITCH_CLASS[l] === p);
}

/** Spells a pitch class using the given letter, e.g. respell(1, 'D') = Db. The accidental is the smallest shift (-6..5). */
export function respell(pc: PitchClass, letter: Letter): Note {
  let acc = mod12(pc - LETTER_PITCH_CLASS[letter]);
  if (acc > 6) acc -= 12;
  return { letter, acc };
}

/** All spellings of a pitch class with at most `maxAcc` accidentals, ordered by letter. */
export function enharmonicSpellings(pc: PitchClass, maxAcc = 2): Note[] {
  return LETTERS.map((l) => respell(pc, l)).filter((n) => Math.abs(n.acc) <= maxAcc);
}

/** Same pitch, simplest spelling: keeps single accidentals except E#, B#, Fb, Cb; otherwise the default spelling. */
export function simplifyNote(n: Note): Note {
  const pc = pitchClass(n);
  if (n.acc === 0) return { ...n };
  if (Math.abs(n.acc) === 1 && !naturalLetter(pc)) return { ...n };
  return spellPitchClass(pc, n.acc > 0 ? 'sharp' : 'flat');
}

// ---------------------------------------------------------------------------
// Pitch-class sets: a 12-bit mask, bit n set when pitch class n is present.
// Masks compare with === (used to collapse chords with identical notes).

export type PitchClassSet = number;

export const EMPTY_PC_SET: PitchClassSet = 0;

export function toPcSet(pcs: Iterable<PitchClass>): PitchClassSet {
  let set = 0;
  for (const pc of pcs) set |= 1 << mod12(pc);
  return set;
}

export function pcSetOfNotes(notes: Iterable<Note>): PitchClassSet {
  let set = 0;
  for (const n of notes) set |= 1 << pitchClass(n);
  return set;
}

export function pcSetHas(set: PitchClassSet, pc: PitchClass): boolean {
  return (set & (1 << mod12(pc))) !== 0;
}

export function pcSetAdd(set: PitchClassSet, pc: PitchClass): PitchClassSet {
  return set | (1 << mod12(pc));
}

export function pcSetRemove(set: PitchClassSet, pc: PitchClass): PitchClassSet {
  return set & ~(1 << mod12(pc));
}

export function pcSetSize(set: PitchClassSet): number {
  let count = 0;
  for (let s = set & 0xfff; s; s &= s - 1) count++;
  return count;
}

/** Pitch classes in ascending order. */
export function pcSetToArray(set: PitchClassSet): PitchClass[] {
  const out: PitchClass[] = [];
  for (let pc = 0; pc < 12; pc++) if (set & (1 << pc)) out.push(pc);
  return out;
}

/** True when every pitch class of `sub` is in `sup`. */
export function pcSetIsSubset(sub: PitchClassSet, sup: PitchClassSet): boolean {
  return (sub & ~sup & 0xfff) === 0;
}

/** Pitch classes in `a` that are not in `b`. */
export function pcSetDifference(a: PitchClassSet, b: PitchClassSet): PitchClassSet {
  return a & ~b & 0xfff;
}

export function pcSetTranspose(set: PitchClassSet, semitones: number): PitchClassSet {
  const n = mod12(semitones);
  const s = set & 0xfff;
  return ((s << n) | (s >> (12 - n))) & 0xfff;
}
