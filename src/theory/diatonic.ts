// Diatonic chords of a key: the triad and 7th chord on each degree with
// roman numerals (relative to the major scale), function labels for major and
// minor, the characteristic chord of the other modes, secondary dominants,
// and chords borrowed from the parallel modes.

import { chordStructurePcSet, makeChord, type Chord } from './chords';
import { transpose } from './intervals';
import { diatonicFit, romanNumeral } from './keyFinder';
import { mod12, pcSetIsSubset, pcSetSize, pitchClass, type Note, type PitchClassSet } from './notes';
import { MODE_IDS, getScaleType, keyPcSet, keyScale, type Key, type ModeId } from './scales';

export type HarmonicFunction = 'tonic' | 'subdominant' | 'dominant';

export interface DegreeChord {
  chord: Chord;
  /** Relative to the major scale: 'ii', '♭VII', 'vi°', 'IVmaj7'. */
  numeral: string;
}

export interface DiatonicDegree {
  /** 1..7 */
  degree: number;
  note: Note;
  triad: DegreeChord;
  seventh: DegreeChord;
  /** Only for Ionian and Aeolian. */
  function: HarmonicFunction | null;
  /** The chord that sets the mode apart (Dorian IV, Phrygian ♭II, ...). */
  characteristic: boolean;
}

export interface SecondaryDominant {
  /** The dominant 7th a perfect 5th above the target. */
  chord: Chord;
  /** 'V7/ii'; the tonic's is 'V7/i' in minor-type modes and 'V7' in major-type ones. */
  numeral: string;
  target: DiatonicDegree;
  /** The chord is already diatonic (V7/IV in Mixolydian is I7). */
  inKey: boolean;
  /**
   * For the V7 of the tonic, which only shows when it isn't in the mode:
   * where it comes from, harmonic minor (minor-type modes) or the major
   * scale (Lydian, Mixolydian). Null for the other degrees.
   */
  source: 'harmonicMinor' | 'major' | null;
}

export interface BorrowedChord {
  /** Degree in the source mode, 1..7. */
  degree: number;
  chord: Chord;
  /** Numeral in the source mode, which is the same as in the key: both are relative to major. */
  numeral: string;
}

export interface BorrowSource {
  /** The parallel key: same tonic, another mode. */
  key: Key;
  /** One of the most common sources for this kind of mode (shown by default). */
  common: boolean;
  /** Triads and 7th chords of the source that aren't diatonic to the key, by degree. */
  triads: BorrowedChord[];
  sevenths: BorrowedChord[];
}

export interface DiatonicChords {
  key: Key;
  scale: Note[];
  degrees: DiatonicDegree[];
  /** Degree of the characteristic chord, null for Ionian and Aeolian. */
  characteristicDegree: number | null;
  secondaryDominants: SecondaryDominant[];
  /** Common sources first, then the others from the closest scale to the furthest. */
  borrowed: BorrowSource[];
}

const T = 'tonic';
const S = 'subdominant';
const D = 'dominant';

/**
 * Function per degree, only for major and minor. Minor mirrors major: the
 * chords a 3rd above and below the tonic (♭III, ♭VI) are tonic substitutes,
 * like iii and vi in major, and ♭VII leads home like vii°.
 */
export const HARMONIC_FUNCTIONS: Readonly<Partial<Record<ModeId, readonly HarmonicFunction[]>>> = {
  ionian: [T, S, T, S, D, T, D],
  aeolian: [T, S, T, S, D, T, D],
};

/**
 * The function of a chord in a major or minor key (Ionian, Aeolian), by the
 * degree of its root, for chords that fit the key (including the harmonic
 * minor V and vii°): Am7 in C major is tonic, E7 in A minor dominant. Null in
 * the other modes and for chords outside the key.
 */
export function chordFunction(chord: Pick<Chord, 'root' | 'type'>, key: Key): HarmonicFunction | null {
  const functions = HARMONIC_FUNCTIONS[key.mode];
  const fit = functions ? diatonicFit(chord, key) : null;
  if (!functions || fit === null) return null;
  // The harmonic minor vii° sits on the raised 7th, which isn't in the natural minor scale.
  if (fit === 'harmonicMinor') return 'dominant';
  const index = keyScale(key).findIndex((n) => pitchClass(n) === pitchClass(chord.root));
  return index < 0 ? null : functions[index]!;
}

/** The chord that sets each other mode apart from major and minor: Dorian IV, Phrygian ♭II, Lydian II, Mixolydian ♭VII, Locrian ♭V. */
export const CHARACTERISTIC_DEGREES: Readonly<Partial<Record<ModeId, number>>> = {
  dorian: 4,
  phrygian: 2,
  lydian: 2,
  mixolydian: 7,
  locrian: 5,
};

/** Borrowed chords shown by default: from minor and Mixolydian in major-type modes, from major and Dorian in minor-type modes (Locrian counts as minor-type). See DEFAULT_BORROW_REPLACEMENTS for the mode's own slot. */
export const DEFAULT_BORROW_SOURCES: Readonly<Record<'major' | 'minor', readonly ModeId[]>> = {
  major: ['aeolian', 'mixolydian'],
  minor: ['ionian', 'dorian'],
};

/**
 * A mode never borrows from itself: when a default source is the current mode
 * (Mixolydian, Dorian), the next closest parallel mode takes its place, so
 * Mixolydian borrows from Aeolian and Ionian, Dorian from Ionian and Aeolian.
 */
const DEFAULT_BORROW_REPLACEMENTS: Readonly<Record<'major' | 'minor', ModeId>> = {
  major: 'ionian',
  minor: 'aeolian',
};

/** Chord type id by the semitones of its 3rd and 5th (and 7th) above the root. */
const TRIAD_TYPES: Readonly<Record<string, string>> = { '4,7': 'maj', '3,7': 'm', '3,6': 'dim', '4,8': 'aug' };
const SEVENTH_TYPES: Readonly<Record<string, string>> = {
  '4,7,11': 'maj7',
  '4,7,10': '7',
  '3,7,10': 'm7',
  '3,6,10': 'm7b5',
  '3,6,9': 'dim7',
  '3,7,11': 'mMaj7',
  '4,8,11': 'augMaj7',
  '4,8,10': 'aug7',
};

function stackedChord(scale: readonly Note[], index: number, size: 3 | 4): Chord {
  const root = scale[index]!;
  const rootPc = pitchClass(root);
  const above = [2, 4, 6].slice(0, size - 1).map((step) => mod12(pitchClass(scale[(index + step) % 7]!) - rootPc));
  const typeId = (size === 3 ? TRIAD_TYPES : SEVENTH_TYPES)[above.join(',')];
  if (!typeId) throw new Error(`No chord type for ${above.join(',')} above ${root.letter}`);
  return makeChord(root, typeId);
}

function degreeChord(chord: Chord, key: Key): DegreeChord {
  return { chord, numeral: romanNumeral(chord, key) };
}

/** Triads and 7th chords on each degree of a key, with numerals. */
function degreeChords(key: Key): { note: Note; triad: DegreeChord; seventh: DegreeChord }[] {
  const scale = keyScale(key);
  return scale.map((note, i) => ({
    note,
    triad: degreeChord(stackedChord(scale, i, 3), key),
    seventh: degreeChord(stackedChord(scale, i, 4), key),
  }));
}

function isInKey(chord: Chord, keySet: PitchClassSet): boolean {
  return pcSetIsSubset(chordStructurePcSet(chord), keySet);
}

/**
 * V7 of each major or minor degree chord. The tonic's V7 is included only
 * when the mode doesn't have it: V7/i from harmonic minor in Aeolian, Dorian
 * and Phrygian, V7 from the major scale in Lydian and Mixolydian. Locrian's
 * diminished tonic gets none, like the other diminished chords.
 */
function secondaryDominants(key: Key, degrees: readonly DiatonicDegree[]): SecondaryDominant[] {
  const keySet = keyPcSet(key);
  return degrees
    .filter((d) => d.triad.chord.type.family === 'major' || d.triad.chord.type.family === 'minor')
    .flatMap((target): SecondaryDominant[] => {
      const chord = makeChord(transpose(target.note, '5'), '7');
      const inKey = isInKey(chord, keySet);
      if (target.degree !== 1) return [{ chord, numeral: `V7/${target.triad.numeral}`, target, inKey, source: null }];
      if (inKey) return [];
      const minor = target.triad.chord.type.family === 'minor';
      return [{ chord, numeral: minor ? 'V7/i' : 'V7', target, inKey, source: minor ? 'harmonicMinor' : 'major' }];
    });
}

function borrowSources(key: Key): BorrowSource[] {
  const keySet = keyPcSet(key);
  const type = getScaleType(key.mode).tonicTriad === 'major' ? 'major' : 'minor';
  const common = DEFAULT_BORROW_SOURCES[type].map((m) => (m === key.mode ? DEFAULT_BORROW_REPLACEMENTS[type] : m));
  const others = MODE_IDS.filter((m) => m !== key.mode && !common.includes(m));
  const distance = (m: ModeId) => pcSetSize(keySet ^ keyPcSet({ tonic: key.tonic, mode: m })) / 2;
  const ordered = [...common, ...others.sort((a, b) => distance(a) - distance(b) || MODE_IDS.indexOf(a) - MODE_IDS.indexOf(b))];

  return ordered.map((mode) => {
    const source: Key = { tonic: key.tonic, mode };
    const borrowed = (size: 'triad' | 'seventh') =>
      degreeChords(source).flatMap((d, i) =>
        isInKey(d[size].chord, keySet) ? [] : [{ degree: i + 1, chord: d[size].chord, numeral: d[size].numeral }],
      );
    return { key: source, common: common.includes(mode), triads: borrowed('triad'), sevenths: borrowed('seventh') };
  });
}

/** Everything the Harmonize view shows for a key. */
export function diatonicChords(key: Key): DiatonicChords {
  const functions = HARMONIC_FUNCTIONS[key.mode];
  const characteristicDegree = CHARACTERISTIC_DEGREES[key.mode] ?? null;
  const degrees: DiatonicDegree[] = degreeChords(key).map((d, i) => ({
    degree: i + 1,
    ...d,
    function: functions?.[i] ?? null,
    characteristic: characteristicDegree === i + 1,
  }));
  return {
    key,
    scale: keyScale(key),
    degrees,
    characteristicDegree,
    secondaryDominants: secondaryDominants(key, degrees),
    borrowed: borrowSources(key),
  };
}
