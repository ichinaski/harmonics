// Scale definitions (7 modes plus other common scales), scale spelling, and
// keys: a tonic + mode, with the tonic spelled for the fewest accidentals.

import { CHROMATIC_DEGREE_NAMES, transpose, type IntervalName } from './intervals';
import {
  enharmonicSpellings,
  formatNote,
  mod12,
  pcSetOfNotes,
  pitchClass,
  spellPitchClass,
  type AccidentalStyle,
  type Note,
  type PitchClass,
  type PitchClassSet,
} from './notes';

export type ModeId = 'ionian' | 'dorian' | 'phrygian' | 'lydian' | 'mixolydian' | 'aeolian' | 'locrian';

export type ScaleId =
  | ModeId
  | 'harmonicMinor'
  | 'melodicMinor'
  | 'majorPentatonic'
  | 'minorPentatonic'
  | 'blues';

/** Quality of the triad built on the scale's tonic; tags modes as major, minor or diminished. */
export type TonicTriad = 'major' | 'minor' | 'diminished';

export interface ScaleType {
  id: ScaleId;
  /** 'Ionian', 'Harmonic minor'. */
  name: string;
  /** Familiar name where there is one: Ionian 'Major', Aeolian 'Natural minor'. */
  commonName?: string;
  intervals: readonly IntervalName[];
  tonicTriad: TonicTriad;
  /** The mode whose key signature decides how the tonic is spelled. */
  keyMode: ModeId;
  /** For the 7 modes: the degree of the major scale the mode starts on (Dorian = 2). */
  majorDegree?: number;
  /** Enharmonic interval used when an interval would spell with a double accidental (the blues ♭5 becomes ♯4: E♭ blues has A, not B𝄫). */
  doubleAccidentalFallback?: Readonly<Record<IntervalName, IntervalName>>;
}

export const MODE_IDS: readonly ModeId[] = [
  'ionian',
  'dorian',
  'phrygian',
  'lydian',
  'mixolydian',
  'aeolian',
  'locrian',
];

export const SCALE_TYPES: readonly ScaleType[] = [
  { id: 'ionian', name: 'Ionian', commonName: 'Major', intervals: ['1', '2', '3', '4', '5', '6', '7'], tonicTriad: 'major', keyMode: 'ionian', majorDegree: 1 },
  { id: 'dorian', name: 'Dorian', intervals: ['1', '2', 'b3', '4', '5', '6', 'b7'], tonicTriad: 'minor', keyMode: 'dorian', majorDegree: 2 },
  { id: 'phrygian', name: 'Phrygian', intervals: ['1', 'b2', 'b3', '4', '5', 'b6', 'b7'], tonicTriad: 'minor', keyMode: 'phrygian', majorDegree: 3 },
  { id: 'lydian', name: 'Lydian', intervals: ['1', '2', '3', '#4', '5', '6', '7'], tonicTriad: 'major', keyMode: 'lydian', majorDegree: 4 },
  { id: 'mixolydian', name: 'Mixolydian', intervals: ['1', '2', '3', '4', '5', '6', 'b7'], tonicTriad: 'major', keyMode: 'mixolydian', majorDegree: 5 },
  { id: 'aeolian', name: 'Aeolian', commonName: 'Natural minor', intervals: ['1', '2', 'b3', '4', '5', 'b6', 'b7'], tonicTriad: 'minor', keyMode: 'aeolian', majorDegree: 6 },
  { id: 'locrian', name: 'Locrian', intervals: ['1', 'b2', 'b3', '4', 'b5', 'b6', 'b7'], tonicTriad: 'diminished', keyMode: 'locrian', majorDegree: 7 },
  { id: 'harmonicMinor', name: 'Harmonic minor', intervals: ['1', '2', 'b3', '4', '5', 'b6', '7'], tonicTriad: 'minor', keyMode: 'aeolian' },
  { id: 'melodicMinor', name: 'Melodic minor', intervals: ['1', '2', 'b3', '4', '5', '6', '7'], tonicTriad: 'minor', keyMode: 'aeolian' },
  { id: 'majorPentatonic', name: 'Major pentatonic', intervals: ['1', '2', '3', '5', '6'], tonicTriad: 'major', keyMode: 'ionian' },
  { id: 'minorPentatonic', name: 'Minor pentatonic', intervals: ['1', 'b3', '4', '5', 'b7'], tonicTriad: 'minor', keyMode: 'aeolian' },
  { id: 'blues', name: 'Blues', intervals: ['1', 'b3', '4', 'b5', '5', 'b7'], tonicTriad: 'minor', keyMode: 'aeolian', doubleAccidentalFallback: { b5: '#4' } },
];

const SCALES_BY_ID = new Map<ScaleId, ScaleType>(SCALE_TYPES.map((s) => [s.id, s]));

export function getScaleType(id: ScaleId): ScaleType {
  const scale = SCALES_BY_ID.get(id);
  if (!scale) throw new Error(`Unknown scale "${id}"`);
  return scale;
}

export function isMode(id: ScaleId): id is ModeId {
  return (MODE_IDS as readonly string[]).includes(id);
}

/** Spells a scale from a tonic by interval, so each degree keeps its own letter (7-note scales use every letter once). */
export function spellScale(tonic: Note, scale: ScaleId | ScaleType): Note[] {
  const type = typeof scale === 'string' ? getScaleType(scale) : scale;
  return type.intervals.map((i) => {
    const n = transpose(tonic, i);
    const fallback = type.doubleAccidentalFallback?.[i];
    return fallback && Math.abs(n.acc) >= 2 ? transpose(tonic, fallback) : n;
  });
}

export function scalePcSet(tonic: Note | PitchClass, scale: ScaleId | ScaleType): PitchClassSet {
  const root = typeof tonic === 'number' ? spellPitchClass(tonic, 'sharp') : tonic;
  return pcSetOfNotes(spellScale(root, scale));
}

/** Spells a scale for a tonic pitch class, choosing the tonic spelling from the scale's key mode. */
export function spellScaleFromPc(tonicPc: PitchClass, scale: ScaleId | ScaleType): Note[] {
  const type = typeof scale === 'string' ? getScaleType(scale) : scale;
  return spellScale(keyTonicSpelling(tonicPc, type.keyMode), type);
}

// ---------------------------------------------------------------------------
// Keys

export interface Key {
  tonic: Note;
  mode: ModeId;
}

/**
 * Number of sharps (positive) or flats (negative) in the key signature of a
 * tonic + mode, or null when it's a theoretical key (double accidentals, or
 * sharps and flats mixed).
 */
export function keySignature(tonic: Note, mode: ModeId): number | null {
  const scale = spellScale(tonic, mode);
  if (scale.some((n) => Math.abs(n.acc) > 1)) return null;
  const sharps = scale.filter((n) => n.acc === 1).length;
  const flats = scale.filter((n) => n.acc === -1).length;
  if (sharps > 0 && flats > 0) return null;
  return sharps - flats;
}

/**
 * Spells a key tonic: the spelling whose key signature has the fewest
 * accidentals for that mode (G# minor not Ab minor, Db major not C# major).
 * Theoretical keys are never chosen. Ties (F# vs Gb major) go to sharps for
 * major-type modes and to flats for minor-type and Locrian. A `preferred`
 * spelling of the same pitch class wins whenever its key isn't theoretical
 * (E♭ Phrygian, 7 flats, but D♯ Locrian, since E♭ Locrian needs B𝄫).
 */
export function keyTonicSpelling(pc: PitchClass, mode: ModeId, preferred?: Note): Note {
  if (preferred && pitchClass(preferred) === mod12(pc) && keySignature(preferred, mode) !== null) return { ...preferred };
  const prefersSharps = getScaleType(mode).tonicTriad === 'major';
  let best: { tonic: Note; signature: number } | null = null;
  for (const tonic of enharmonicSpellings(pc, 1)) {
    const signature = keySignature(tonic, mode);
    if (signature === null) continue;
    const size = Math.abs(signature);
    const bestSize = best === null ? Infinity : Math.abs(best.signature);
    const better =
      best === null ||
      size < bestSize ||
      (size === bestSize && (prefersSharps ? signature > best.signature : signature < best.signature));
    if (better) best = { tonic, signature };
  }
  // Every pitch class has a non-theoretical spelling in every mode, so best is always set.
  return best!.tonic;
}

/** A key on a tonic pitch class, spelled by keyTonicSpelling (with its optional `preferred` spelling). */
export function makeKey(tonicPc: PitchClass, mode: ModeId, preferred?: Note): Key {
  return { tonic: keyTonicSpelling(tonicPc, mode, preferred), mode };
}

export function keyScale(key: Key): Note[] {
  return spellScale(key.tonic, key.mode);
}

export function keyPcSet(key: Key): PitchClassSet {
  return pcSetOfNotes(keyScale(key));
}

/**
 * Spells a pitch class in a key: scale notes as in the scale, other notes by
 * their degree relative to the major scale (b2, b3, #4, b6, b7), so Bb in G
 * major is the bIII and F# in C major the #IV. Falls back to a single
 * accidental in the key signature's direction if that would give a double one.
 */
export function spellInKey(pc: PitchClass, key: Key): Note {
  const scale = keyScale(key);
  const inScale = scale.find((n) => pitchClass(n) === mod12(pc));
  if (inScale) return inScale;
  const byDegree = transpose(key.tonic, CHROMATIC_DEGREE_NAMES[mod12(pc - pitchClass(key.tonic))]!);
  if (Math.abs(byDegree.acc) <= 1) return byDegree;
  return spellPitchClass(pc, (keySignature(key.tonic, key.mode) ?? 0) < 0 ? 'flat' : 'sharp');
}

/** Short label for a mode in a key name: Ionian is 'major', Aeolian 'minor', others by mode name. */
export function modeLabel(mode: ModeId): string {
  if (mode === 'ionian') return 'major';
  if (mode === 'aeolian') return 'minor';
  return getScaleType(mode).name;
}

/** 'G♯ minor', 'D♭ major', 'D Dorian'. */
export function keyName(key: Key, style: AccidentalStyle = 'unicode'): string {
  return `${formatNote(key.tonic, style)} ${modeLabel(key.mode)}`;
}

/** True when the key's signature would need double accidentals or mixed sharps and flats (D♭ minor, F♭ major). */
export function isTheoreticalKey(key: Key): boolean {
  return keySignature(key.tonic, key.mode) === null;
}

/**
 * Key name with the enharmonic key added for theoretical keys: 'D♭ minor (= C♯ minor)'.
 * Parallel modes of a key keep its tonic letter (D♭ major borrows from D♭ minor), so this names the readable equivalent too.
 */
export function keyNameWithEnharmonic(key: Key, style: AccidentalStyle = 'unicode'): string {
  if (!isTheoreticalKey(key)) return keyName(key, style);
  return `${keyName(key, style)} (= ${keyName(makeKey(pitchClass(key.tonic), key.mode), style)})`;
}
