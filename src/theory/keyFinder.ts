// Key finder: a chord progression → every candidate key, ranked, with roman
// numerals and an explanation per chord.
//
// A chord fits a key when its root, 3rd, 5th and 7th are in the scale
// (tensions don't count). Minor keys also accept the harmonic minor V, V7 and
// vii°(7). Chords that don't fit are explained as a secondary dominant, a
// chord borrowed from a parallel mode, or chromatic. Fit alone can't tell
// relative keys apart (C major, A minor and D Dorian share their notes), so
// the score adds a tonic emphasis term: how often the tonic chord appears,
// whether it opens or closes, and cadences that land on it.

import {
  CHORD_TYPES,
  chordName,
  chordPcSet,
  chordSeventh,
  chordStructurePcSet,
  chordThird,
  chordTypePcSet,
  getChordType,
  hasNonChordBass,
  makeChord,
  type Chord,
  type ChordType,
} from './chords';
import { CHROMATIC_DEGREE_NAMES, intervalSemitones, parseInterval } from './intervals';
import {
  formatAccidental,
  mod12,
  pcSetIsSubset,
  pcSetRemove,
  pitchClass,
  type AccidentalStyle,
  type Note,
  type PitchClass,
  type PitchClassSet,
} from './notes';
import {
  MODE_IDS,
  getScaleType,
  keyNameWithEnharmonic,
  keyPcSet,
  keyScale,
  makeKey,
  scalePcSet,
  spellInKey,
  type Key,
  type ModeId,
} from './scales';

// ---------------------------------------------------------------------------
// Roman numerals

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'] as const;

/** Numeral suffixes that differ from the chord symbol. */
const NUMERAL_SUFFIX: Readonly<Record<string, { unicode: string; ascii: string }>> = {
  dim: { unicode: '°', ascii: 'o' },
  dim7: { unicode: '°7', ascii: 'o7' },
  m7b5: { unicode: 'ø7', ascii: 'm7b5' },
  aug: { unicode: '+', ascii: '+' },
  aug7: { unicode: '+7', ascii: '+7' },
  augMaj7: { unicode: '+maj7', ascii: '+maj7' },
  mMaj7: { unicode: 'maj7', ascii: 'maj7' },
};

function numeralSuffix(type: ChordType, style: AccidentalStyle): string {
  const special = NUMERAL_SUFFIX[type.id];
  if (special) return special[style];
  const symbol = style === 'unicode' ? type.display : type.symbol;
  return type.family === 'minor' && symbol.startsWith('m') ? symbol.slice(1) : symbol;
}

/**
 * The diatonic chord a diminished-family chord (°, °7, ø7) leads to as its
 * leading-tone chord: the major or minor triad a semitone above its root.
 */
function leadingToneTarget(rootPc: PitchClass, type: ChordType, key: Key): DegreeTriad | undefined {
  if (type.family !== 'diminished') return undefined;
  return degreeTriads(key).find(
    (t) => t.rootPc === mod12(rootPc + 1) && (t.quality === 'major' || t.quality === 'minor'),
  );
}

/**
 * The major-relative degree of a chord root in a key: scale roots use their
 * scale degree (C Dorian E♭ is ♭3, C Lydian F♯ is ♯4); chromatic roots use
 * b2 b3 #4 b6 b7, except leading-tone diminished chords, which use the raised
 * degree below their target (C♯°7 in C major is ♯1, leading to ii). Works on
 * pitch classes, so the chord's own spelling never matters (A in D♭ major is
 * ♭6, not ♯5).
 */
function rootDegree(rootPc: PitchClass, type: ChordType, key: Key): { degree: number; alteration: number } {
  const tonicPc = pitchClass(key.tonic);
  const semis = mod12(rootPc - tonicPc);
  const scaleIntervals = getScaleType(key.mode).intervals;
  const degreeOf = (pc: PitchClass) => scaleIntervals.find((i) => mod12(intervalSemitones(i)) === mod12(pc - tonicPc));
  const inScale = degreeOf(rootPc);
  if (inScale) return parseInterval(inScale)!;
  const target = leadingToneTarget(rootPc, type, key);
  if (target) {
    const degree = ((parseInterval(degreeOf(target.rootPc)!)!.degree + 5) % 7) + 1;
    return { degree, alteration: semis - intervalSemitones(String(degree)) };
  }
  return parseInterval(CHROMATIC_DEGREE_NAMES[semis]!)!;
}

/**
 * Roman numeral of a chord in a key, relative to the major scale everywhere
 * (C Dorian: i ii ♭III IV v vi° ♭VII), so the same chord always gets the same
 * numeral. Minor and diminished chords are lowercase. Chromatic roots use
 * ♭II ♭III ♯IV ♭VI ♭VII, and leading-tone diminished chords the raised degree
 * (♯i°7, ♯ii°7, ♯iv°7, ♯v°7). The bass of a slash chord is ignored.
 */
export function romanNumeral(chord: Pick<Chord, 'root' | 'type'>, key: Key, style: AccidentalStyle = 'unicode'): string {
  const { degree, alteration } = rootDegree(pitchClass(chord.root), chord.type, key);
  const lower = chord.type.family === 'minor' || chord.type.family === 'diminished';
  const numeral = ROMAN[degree - 1]!;
  return formatAccidental(alteration, style) + (lower ? numeral.toLowerCase() : numeral) + numeralSuffix(chord.type, style);
}

// ---------------------------------------------------------------------------
// Chord analysis in a key

export type ChordFunctionKind = 'diatonic' | 'secondaryDominant' | 'leadingTone' | 'borrowed' | 'chromatic';

export interface ChordInKey {
  chord: Chord;
  /**
   * Set when a slash chord is read as the chord built on its bass, because
   * that fits this key at least as well (F/G as G9sus4, a V in C major). The
   * numeral and explanation then describe this chord.
   */
  reading?: Chord;
  /** 'V7', '♭VII', or 'V7/ii' for a secondary dominant. */
  numeral: string;
  kind: ChordFunctionKind;
  /** Short explanation: 'diatonic', 'harmonic minor', 'secondary dominant', 'leading-tone diminished to ii', 'borrowed from C minor', 'chromatic'. */
  explanation: string;
  /** The parallel mode a borrowed chord comes from. */
  borrowedFrom?: Key;
  /** Numeral of a secondary dominant's or leading-tone chord's target ('ii'), and whether the next chord is it. */
  target?: { numeral: string; resolved: boolean };
  /** This chord's contribution to the key's fit, 0..1. */
  fit: number;
}

export interface KeyResult {
  key: Key;
  /** 0..100. */
  score: number;
  /** Mean chord fit, 0..1. */
  fit: number;
  /** Tonic emphasis, 0..1. */
  tonicEmphasis: number;
  chords: ChordInKey[];
}

export interface KeyFinderOptions {
  /** Adds Dorian, Phrygian, Lydian, Mixolydian and Locrian to major and minor. */
  modes?: boolean;
}

/** Weights, tuned with the fixed cases in tests/keyFinder.test.ts. */
export const KEY_SCORE_WEIGHTS = {
  /** Final score: weighted mean of fit and tonic emphasis. */
  fit: 0.65,
  tonicEmphasis: 0.35,
  /** Subtracted for the church modes (not major or minor): they are rarer, so they need a slightly stronger case. */
  modePrior: 0.03,
  /** Per-chord fit. */
  chordFit: { diatonic: 1, secondaryDominant: 0.5, resolvedSecondaryDominant: 0.75, borrowed: 0.25, chromatic: 0 },
  /** Tonic emphasis terms (they add up to 1). */
  tonic: { frequency: 0.35, first: 0.25, last: 0.2, cadence: 0.2 },
  /** How much a chord over the tonic in the bass (a tonic pedal, D/C in C Lydian) counts as the tonic chord. */
  tonicPedal: 0.5,
  /** Cadence strength by the chord before the tonic. */
  cadence: { dominant: 1, subdominant: 0.6, subtonic: 0.6 },
} as const;

const MAJOR_AND_MINOR: readonly ModeId[] = ['ionian', 'aeolian'];

/** The most common sources of borrowed chords, checked first. */
const COMMON_BORROW_SOURCES: Readonly<Record<'major' | 'minor' | 'diminished', readonly ModeId[]>> = {
  major: ['mixolydian', 'aeolian'],
  minor: ['ionian', 'dorian'],
  diminished: ['phrygian', 'aeolian'],
};

/** Triad on each degree of a key's scale: root pitch class and quality. */
interface DegreeTriad {
  rootPc: PitchClass;
  quality: 'major' | 'minor' | 'diminished' | 'augmented';
}

function degreeTriads(key: Key): DegreeTriad[] {
  const pcs = keyScale(key).map(pitchClass);
  return pcs.map((rootPc, i) => {
    const third = mod12(pcs[(i + 2) % 7]! - rootPc);
    const fifth = mod12(pcs[(i + 4) % 7]! - rootPc);
    const quality = third === 4 ? (fifth === 8 ? 'augmented' : 'major') : fifth === 6 ? 'diminished' : 'minor';
    return { rootPc, quality };
  });
}

const TRIAD_TYPE_IDS: Readonly<Record<DegreeTriad['quality'], string>> = {
  major: 'maj',
  minor: 'm',
  diminished: 'dim',
  augmented: 'aug',
};

function rootInterval(chord: Chord, key: Key): number {
  return mod12(pitchClass(chord.root) - pitchClass(key.tonic));
}

/** A major triad or any dominant-family chord: something that can act as a dominant. */
function isDominantShaped(type: ChordType): boolean {
  return type.id === 'maj' || type.family === 'dominant';
}

function countDifferences(a: PitchClassSet, b: PitchClassSet): number {
  let n = 0;
  for (let s = (a ^ b) & 0xfff; s; s &= s - 1) n++;
  return n / 2;
}

/** The parallel mode a chord can be borrowed from: common sources first, then the closest scale. */
function borrowSource(structure: PitchClassSet, key: Key): ModeId | null {
  const own = keyPcSet(key);
  const common = COMMON_BORROW_SOURCES[getScaleType(key.mode).tonicTriad];
  const fits = (mode: ModeId) => mode !== key.mode && pcSetIsSubset(structure, scalePcSet(key.tonic, mode));
  const closest = (modes: readonly ModeId[]) =>
    modes
      .filter(fits)
      .sort((a, b) => countDifferences(own, scalePcSet(key.tonic, a)) - countDifferences(own, scalePcSet(key.tonic, b)))[0] ?? null;
  return closest(common) ?? closest(MODE_IDS);
}

/**
 * How a chord belongs to a key, if it does: 'diatonic' when its root, 3rd, 5th
 * and 7th are in the scale, 'harmonicMinor' for the V, V7, vii° and vii°7 of
 * harmonic minor in a minor (Aeolian) key, else null.
 */
export function diatonicFit(
  chord: Pick<Chord, 'root' | 'type'>,
  key: Key,
  keySet: PitchClassSet = keyPcSet(key),
): 'diatonic' | 'harmonicMinor' | null {
  const structure = chordStructurePcSet(chord);
  if (pcSetIsSubset(structure, keySet)) return 'diatonic';
  const degree = mod12(pitchClass(chord.root) - pitchClass(key.tonic));
  if (key.mode === 'aeolian' && (degree === 7 || degree === 11) && pcSetIsSubset(structure, scalePcSet(key.tonic, 'harmonicMinor'))) {
    return 'harmonicMinor';
  }
  return null;
}

/**
 * A slash chord whose bass isn't a chord tone, read as the chord built on
 * its bass, when all its notes make one: exactly, or with one tone left out
 * that the chord type allows (the 5th of G9sus4). F/G is G9sus4, Am/F is
 * Fmaj7, C/D is D9sus4. Exact matches first, then the simplest. Null for
 * other chords, or when no chord on the bass has these notes (D/C, C/B♭).
 */
export function bassChordReading(chord: Chord): Chord | null {
  if (!chord.bass || !hasNonChordBass(chord)) return null;
  const bassPc = pitchClass(chord.bass);
  const notes = chordPcSet(chord);
  let best: { type: ChordType; omitted: boolean } | null = null;
  for (const type of CHORD_TYPES) {
    const tones = chordTypePcSet(bassPc, type);
    const exact = tones === notes;
    const omitted =
      !exact &&
      type.omittable.some((i) => i !== '1' && pcSetRemove(tones, bassPc + intervalSemitones(i)) === notes);
    if (!exact && !omitted) continue;
    const better =
      best === null ||
      (best.omitted && exact) ||
      (best.omitted === omitted && type.complexity < best.type.complexity);
    if (better) best = { type, omitted };
  }
  return best ? makeChord(chord.bass, best.type) : null;
}

function analyseChord(chord: Chord, next: Chord | undefined, key: Key, triads: readonly DegreeTriad[]): Omit<ChordInKey, 'chord'> {
  const w = KEY_SCORE_WEIGHTS.chordFit;
  const numeral = romanNumeral(chord, key);
  const structure = chordStructurePcSet(chord);
  const fit = diatonicFit(chord, key);
  if (fit === 'diatonic') return { numeral, kind: 'diatonic', explanation: 'diatonic', fit: w.diatonic };
  // Minor keys: V, V7 and vii°(7) from harmonic minor.
  if (fit === 'harmonicMinor') return { numeral, kind: 'diatonic', explanation: 'harmonic minor', fit: w.diatonic };

  // Leading-tone diminished chord: an applied chord like a secondary dominant (C♯°7 to Dm in C major).
  const leadingTo = leadingToneTarget(pitchClass(chord.root), chord.type, key);
  if (leadingTo) {
    const targetNumeral = romanNumeral(
      { root: spellInKey(leadingTo.rootPc, key), type: getChordType(TRIAD_TYPE_IDS[leadingTo.quality]) },
      key,
    );
    const resolved = next !== undefined && pitchClass(next.root) === leadingTo.rootPc;
    return {
      numeral,
      kind: 'leadingTone',
      explanation: `leading-tone diminished to ${targetNumeral}`,
      target: { numeral: targetNumeral, resolved },
      fit: resolved ? w.resolvedSecondaryDominant : w.secondaryDominant,
    };
  }

  // Secondary dominant: a dominant-shaped chord a 5th above a major or minor
  // diatonic chord other than the tonic.
  const targetPc = mod12(pitchClass(chord.root) - 7);
  const target = triads.find((t) => t.rootPc === targetPc);
  const isSecondary =
    isDominantShaped(chord.type) &&
    target !== undefined &&
    targetPc !== pitchClass(key.tonic) &&
    (target.quality === 'major' || target.quality === 'minor');
  const resolved = isSecondary && next !== undefined && pitchClass(next.root) === targetPc;
  const source = borrowSource(structure, key);

  // An unresolved plain triad that a common source explains reads as borrowed (G in D minor is IV from Dorian).
  const preferBorrowed =
    source !== null && !resolved && chord.type.id === 'maj' && COMMON_BORROW_SOURCES[getScaleType(key.mode).tonicTriad].includes(source);

  if (isSecondary && !preferBorrowed) {
    const targetNumeral = romanNumeral(
      { root: spellInKey(targetPc, key), type: getChordType(TRIAD_TYPE_IDS[target!.quality]) },
      key,
    );
    const dominantNumeral = 'V' + numeralSuffix(chord.type, 'unicode');
    return {
      numeral: `${dominantNumeral}/${targetNumeral}`,
      kind: 'secondaryDominant',
      explanation: 'secondary dominant',
      target: { numeral: targetNumeral, resolved },
      fit: resolved ? w.resolvedSecondaryDominant : w.secondaryDominant,
    };
  }
  if (source !== null) {
    const borrowedFrom: Key = { tonic: key.tonic, mode: source };
    return { numeral, kind: 'borrowed', explanation: `borrowed from ${keyNameWithEnharmonic(borrowedFrom)}`, borrowedFrom, fit: w.borrowed };
  }
  return { numeral, kind: 'chromatic', explanation: 'chromatic', fit: w.chromatic };
}

// ---------------------------------------------------------------------------
// Tonic emphasis

/**
 * How much a chord counts as the key's tonic chord: 1 with the mode's 3rd,
 * 0.5 without a 3rd (sus, power), else 0. Another chord over the tonic in
 * the bass (`bass`, the bass as written) is a tonic pedal and counts
 * tonicPedal.
 */
function tonicWeight(chord: Chord, key: Key, bass: Note | undefined): number {
  if (rootInterval(chord, key) !== 0) {
    return bass !== undefined && pitchClass(bass) === pitchClass(key.tonic) ? KEY_SCORE_WEIGHTS.tonicPedal : 0;
  }
  const third = chordThird(chord.type);
  if (third === undefined) return 0.5;
  const tonicTriad = getScaleType(key.mode).tonicTriad;
  const wanted = tonicTriad === 'major' ? 4 : 3;
  if (intervalSemitones(third) !== wanted) return 0;
  return tonicTriad === 'diminished' && chord.type.family !== 'diminished' ? 0 : 1;
}

/** Strength of a cadence from `prev` onto the tonic: V(7)–I (also V7sus4, V9sus4), IV–I (and iv–I), ♭VII–I. */
function cadenceStrength(prev: Chord, key: Key): number {
  const c = KEY_SCORE_WEIGHTS.cadence;
  const degree = rootInterval(prev, key);
  const third = chordThird(prev.type);
  const major = third !== undefined && intervalSemitones(third) === 4;
  const susDominant = prev.type.family === 'suspended' && chordSeventh(prev.type) === 'b7';
  if (degree === 7 && (major || prev.type.family === 'dominant' || susDominant)) return c.dominant;
  if (degree === 5 && (prev.type.family === 'major' || prev.type.family === 'minor')) return c.subdominant;
  if (degree === 10 && major) return c.subtonic;
  return 0;
}

/** Tonic emphasis of the chords as read in the key; `basses` are the basses as written, for tonic pedals. */
function tonicEmphasis(chords: readonly Chord[], basses: readonly (Note | undefined)[], key: Key): number {
  const t = KEY_SCORE_WEIGHTS.tonic;
  const weights = chords.map((c, i) => tonicWeight(c, key, basses[i]));
  const frequency = weights.reduce((a, b) => a + b, 0) / chords.length;
  let cadence = 0;
  for (let i = 1; i < chords.length; i++) {
    if (weights[i]! > 0) cadence = Math.max(cadence, cadenceStrength(chords[i - 1]!, key) * weights[i]!);
  }
  return t.frequency * frequency + t.first * weights[0]! + t.last * weights[weights.length - 1]! + t.cadence * cadence;
}

// ---------------------------------------------------------------------------
// Ranking

/**
 * Analyses a progression in one key. A slash chord with a bass reading
 * (bassChordReading) is analysed both ways and takes the reading that fits
 * the key better. On a tie the chord on the bass wins (F/G before C is
 * V9sus4, Am/F in C is IVmaj7), unless the written chord is the tonic chord:
 * F/G in F major stays I.
 */
function analyse(chords: readonly Chord[], readings: readonly (Chord | null)[], key: Key): KeyResult {
  const w = KEY_SCORE_WEIGHTS;
  const triads = degreeTriads(key);
  const analysed: ChordInKey[] = chords.map((chord, i) => {
    const own = analyseChord(chord, chords[i + 1], key, triads);
    const reading = readings[i];
    if (!reading) return { chord, ...own };
    const asBass = analyseChord(reading, chords[i + 1], key, triads);
    const ownIsTonic = mod12(pitchClass(chord.root) - pitchClass(key.tonic)) === 0;
    if (asBass.fit < own.fit || (asBass.fit === own.fit && ownIsTonic)) return { chord, ...own };
    return { chord, reading, ...asBass, explanation: `${asBass.explanation}, as ${chordName(reading)}` };
  });
  const fit = chords.length ? analysed.reduce((sum, c) => sum + c.fit, 0) / chords.length : 0;
  const emphasis = chords.length
    ? tonicEmphasis(
        analysed.map((c) => c.reading ?? c.chord),
        chords.map((c) => c.bass),
        key,
      )
    : 0;
  const prior = key.mode === 'ionian' || key.mode === 'aeolian' ? 0 : w.modePrior;
  const score = Math.round(100 * Math.max(0, Math.min(1, w.fit * fit + w.tonicEmphasis * emphasis - prior)));
  return { key, score, fit, tonicEmphasis: emphasis, chords: analysed };
}

/** Analyses a progression in one key. */
export function analyseInKey(chords: readonly Chord[], key: Key): KeyResult {
  return analyse(chords, chords.map(bassChordReading), key);
}

/**
 * Every candidate key for a progression, best first (never filtered out):
 * 12 tonics in major and minor, plus the other modes with `modes`. Ties go to
 * the stronger tonic emphasis, then major, minor and the modes in order.
 */
export function findKeys(chords: readonly Chord[], options: KeyFinderOptions = {}): KeyResult[] {
  if (chords.length === 0) return [];
  const modes = options.modes ? MODE_IDS : MAJOR_AND_MINOR;
  const modeOrder = (m: ModeId) => (m === 'ionian' ? 0 : m === 'aeolian' ? 1 : 2 + MODE_IDS.indexOf(m));
  const readings = chords.map(bassChordReading);
  const results: KeyResult[] = [];
  for (const mode of modes) {
    for (let pc = 0; pc < 12; pc++) results.push(analyse(chords, readings, makeKey(pc, mode)));
  }
  return results.sort(
    (a, b) =>
      b.score - a.score ||
      b.tonicEmphasis - a.tonicEmphasis ||
      modeOrder(a.key.mode) - modeOrder(b.key.mode) ||
      pitchClass(a.key.tonic) - pitchClass(b.key.tonic),
  );
}
