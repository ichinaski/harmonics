// Chord vocabulary, building spelled chords, naming, and the chord symbol parser.

import { intervalBetween, intervalDegree, transpose, type IntervalName } from './intervals';
import {
  LETTERS,
  defaultSpelling,
  formatNote,
  naturalLetter,
  noteEquals,
  parseNote,
  pcSetOfNotes,
  pitchClass,
  respell,
  simplifyNote,
  spellPitchClass,
  type AccidentalStyle,
  type Note,
  type PitchClass,
  type PitchClassSet,
} from './notes';

export type QualityFamily =
  | 'major'
  | 'minor'
  | 'dominant'
  | 'diminished'
  | 'augmented'
  | 'suspended'
  | 'power';

export const QUALITY_FAMILIES: readonly QualityFamily[] = [
  'major',
  'minor',
  'dominant',
  'diminished',
  'augmented',
  'suspended',
  'power',
];

export type ChordTier = 'common' | 'extended';

export interface ChordType {
  id: string;
  /** ASCII symbol shown after the root: 'm7b5', 'dim', '' for a major triad. */
  symbol: string;
  /** Display symbol with ♭, ♯ and °: 'm7♭5', '°'. */
  display: string;
  /** Extra spellings accepted by the parser, beyond the major/minor marker variants. */
  aliases: readonly string[];
  intervals: readonly IntervalName[];
  /** Root, 3rd (or the suspended note) and 5th, as present in the chord. */
  core: readonly IntervalName[];
  family: QualityFamily;
  /** 'half-diminished 7th'. */
  qualityName: string;
  tier: ChordTier;
  /** Higher is more complex; used to rank results and pick names (C < Cadd9 < C6/9). */
  complexity: number;
  /** Tones that may be left out in an "omitted" match: the 5th of 7th chords and up, the 9th of 13ths, the root for rootless voicings. 13th chords are defined without the 11th (1 3 5 b7 9 13). */
  omittable: readonly IntervalName[];
}

type ChordTypeSpec = Omit<ChordType, 'display' | 'aliases' | 'omittable'> &
  Partial<Pick<ChordType, 'display' | 'aliases' | 'omittable'>>;

const T = ['1', '3', '5'] as const;
const MINOR_T = ['1', 'b3', '5'] as const;

const CHORD_TYPE_SPECS: readonly ChordTypeSpec[] = [
  // Common
  { id: 'maj', symbol: '', aliases: ['maj', 'M'], intervals: T, core: T, family: 'major', qualityName: 'major', tier: 'common', complexity: 0 },
  { id: 'm', symbol: 'm', aliases: ['min', '-'], intervals: MINOR_T, core: MINOR_T, family: 'minor', qualityName: 'minor', tier: 'common', complexity: 0 },
  { id: 'dim', symbol: 'dim', display: '°', aliases: ['°', 'o'], intervals: ['1', 'b3', 'b5'], core: ['1', 'b3', 'b5'], family: 'diminished', qualityName: 'diminished', tier: 'common', complexity: 1 },
  { id: 'aug', symbol: 'aug', aliases: ['+'], intervals: ['1', '3', '#5'], core: ['1', '3', '#5'], family: 'augmented', qualityName: 'augmented', tier: 'common', complexity: 1 },
  { id: 'sus2', symbol: 'sus2', aliases: ['2'], intervals: ['1', '2', '5'], core: ['1', '2', '5'], family: 'suspended', qualityName: 'suspended 2nd', tier: 'common', complexity: 2 },
  { id: 'sus4', symbol: 'sus4', aliases: ['sus'], intervals: ['1', '4', '5'], core: ['1', '4', '5'], family: 'suspended', qualityName: 'suspended 4th', tier: 'common', complexity: 1 },
  { id: '5', symbol: '5', intervals: ['1', '5'], core: ['1', '5'], family: 'power', qualityName: 'power chord', tier: 'common', complexity: 0 },
  { id: '6', symbol: '6', aliases: ['maj6'], intervals: ['1', '3', '5', '6'], core: T, family: 'major', qualityName: 'major 6th', tier: 'common', complexity: 1 },
  { id: 'm6', symbol: 'm6', intervals: ['1', 'b3', '5', '6'], core: MINOR_T, family: 'minor', qualityName: 'minor 6th', tier: 'common', complexity: 2 },
  { id: '7', symbol: '7', intervals: ['1', '3', '5', 'b7'], core: T, family: 'dominant', qualityName: 'dominant 7th', tier: 'common', complexity: 1, omittable: ['5'] },
  { id: 'maj7', symbol: 'maj7', aliases: ['Δ7'], intervals: ['1', '3', '5', '7'], core: T, family: 'major', qualityName: 'major 7th', tier: 'common', complexity: 1, omittable: ['5'] },
  { id: 'm7', symbol: 'm7', intervals: ['1', 'b3', '5', 'b7'], core: MINOR_T, family: 'minor', qualityName: 'minor 7th', tier: 'common', complexity: 1, omittable: ['5'] },
  { id: 'm7b5', symbol: 'm7b5', aliases: ['ø', 'ø7', 'h', 'h7'], intervals: ['1', 'b3', 'b5', 'b7'], core: ['1', 'b3', 'b5'], family: 'diminished', qualityName: 'half-diminished 7th', tier: 'common', complexity: 1 },
  { id: 'dim7', symbol: 'dim7', display: '°7', aliases: ['°7', 'o7'], intervals: ['1', 'b3', 'b5', 'bb7'], core: ['1', 'b3', 'b5'], family: 'diminished', qualityName: 'diminished 7th', tier: 'common', complexity: 2 },
  { id: '9', symbol: '9', intervals: ['1', '3', '5', 'b7', '9'], core: T, family: 'dominant', qualityName: 'dominant 9th', tier: 'common', complexity: 2, omittable: ['1', '5'] },
  { id: 'maj9', symbol: 'maj9', aliases: ['Δ9'], intervals: ['1', '3', '5', '7', '9'], core: T, family: 'major', qualityName: 'major 9th', tier: 'common', complexity: 2, omittable: ['1', '5'] },
  { id: 'm9', symbol: 'm9', intervals: ['1', 'b3', '5', 'b7', '9'], core: MINOR_T, family: 'minor', qualityName: 'minor 9th', tier: 'common', complexity: 2, omittable: ['1', '5'] },
  { id: 'add9', symbol: 'add9', intervals: ['1', '3', '5', '9'], core: T, family: 'major', qualityName: 'added 9th', tier: 'common', complexity: 2 },
  { id: 'madd9', symbol: 'madd9', intervals: ['1', 'b3', '5', '9'], core: MINOR_T, family: 'minor', qualityName: 'minor added 9th', tier: 'common', complexity: 2 },
  { id: '7sus4', symbol: '7sus4', aliases: ['7sus'], intervals: ['1', '4', '5', 'b7'], core: ['1', '4', '5'], family: 'suspended', qualityName: 'dominant 7th suspended 4th', tier: 'common', complexity: 2, omittable: ['5'] },

  // Extended
  { id: '6/9', symbol: '6/9', aliases: ['69'], intervals: ['1', '3', '5', '6', '9'], core: T, family: 'major', qualityName: 'six-nine', tier: 'extended', complexity: 3, omittable: ['5'] },
  { id: 'm6/9', symbol: 'm6/9', aliases: ['m69'], intervals: ['1', 'b3', '5', '6', '9'], core: MINOR_T, family: 'minor', qualityName: 'minor six-nine', tier: 'extended', complexity: 3, omittable: ['5'] },
  { id: 'mMaj7', symbol: 'm(maj7)', aliases: ['mMaj7'], intervals: ['1', 'b3', '5', '7'], core: MINOR_T, family: 'minor', qualityName: 'minor-major 7th', tier: 'extended', complexity: 2, omittable: ['5'] },
  { id: 'aug7', symbol: '+7', aliases: ['aug7'], intervals: ['1', '3', '#5', 'b7'], core: ['1', '3', '#5'], family: 'augmented', qualityName: 'augmented 7th', tier: 'extended', complexity: 2 },
  { id: 'augMaj7', symbol: '+maj7', aliases: ['augMaj7', 'maj7#5'], intervals: ['1', '3', '#5', '7'], core: ['1', '3', '#5'], family: 'augmented', qualityName: 'augmented major 7th', tier: 'extended', complexity: 3 },
  { id: '11', symbol: '11', intervals: ['1', '3', '5', 'b7', '9', '11'], core: T, family: 'dominant', qualityName: 'dominant 11th', tier: 'extended', complexity: 3, omittable: ['1', '5'] },
  { id: 'm11', symbol: 'm11', intervals: ['1', 'b3', '5', 'b7', '9', '11'], core: MINOR_T, family: 'minor', qualityName: 'minor 11th', tier: 'extended', complexity: 3, omittable: ['1', '5'] },
  { id: 'maj7#11', symbol: 'maj7#11', intervals: ['1', '3', '5', '7', '#11'], core: T, family: 'major', qualityName: 'major 7th ♯11', tier: 'extended', complexity: 3, omittable: ['1', '5'] },
  { id: '13', symbol: '13', intervals: ['1', '3', '5', 'b7', '9', '13'], core: T, family: 'dominant', qualityName: 'dominant 13th', tier: 'extended', complexity: 3, omittable: ['1', '5', '9'] },
  { id: 'm13', symbol: 'm13', intervals: ['1', 'b3', '5', 'b7', '9', '13'], core: MINOR_T, family: 'minor', qualityName: 'minor 13th', tier: 'extended', complexity: 3, omittable: ['1', '5', '9'] },
  { id: 'maj13', symbol: 'maj13', intervals: ['1', '3', '5', '7', '9', '13'], core: T, family: 'major', qualityName: 'major 13th', tier: 'extended', complexity: 3, omittable: ['1', '5', '9'] },
  { id: '7b5', symbol: '7b5', intervals: ['1', '3', 'b5', 'b7'], core: ['1', '3', 'b5'], family: 'dominant', qualityName: 'dominant 7th ♭5', tier: 'extended', complexity: 3 },
  { id: '7#5', symbol: '7#5', intervals: ['1', '3', '#5', 'b7'], core: ['1', '3', '#5'], family: 'dominant', qualityName: 'dominant 7th ♯5', tier: 'extended', complexity: 3 },
  { id: '7b9', symbol: '7b9', intervals: ['1', '3', '5', 'b7', 'b9'], core: T, family: 'dominant', qualityName: 'dominant 7th ♭9', tier: 'extended', complexity: 3, omittable: ['1', '5'] },
  { id: '7#9', symbol: '7#9', intervals: ['1', '3', '5', 'b7', '#9'], core: T, family: 'dominant', qualityName: 'dominant 7th ♯9', tier: 'extended', complexity: 3, omittable: ['1', '5'] },
  { id: '7#11', symbol: '7#11', intervals: ['1', '3', '5', 'b7', '#11'], core: T, family: 'dominant', qualityName: 'dominant 7th ♯11', tier: 'extended', complexity: 3, omittable: ['1', '5'] },
  { id: '7b13', symbol: '7b13', intervals: ['1', '3', '5', 'b7', 'b13'], core: T, family: 'dominant', qualityName: 'dominant 7th ♭13', tier: 'extended', complexity: 3, omittable: ['1', '5'] },
  { id: '7alt', symbol: '7alt', aliases: ['alt'], intervals: ['1', '3', 'b7', 'b9', '#9', '#11', 'b13'], core: ['1', '3'], family: 'dominant', qualityName: 'altered dominant', tier: 'extended', complexity: 4, omittable: ['1'] },
  { id: '9sus4', symbol: '9sus4', aliases: ['9sus'], intervals: ['1', '4', '5', 'b7', '9'], core: ['1', '4', '5'], family: 'suspended', qualityName: 'dominant 9th suspended 4th', tier: 'extended', complexity: 3, omittable: ['5'] },
  { id: 'add11', symbol: 'add11', intervals: ['1', '3', '5', '11'], core: T, family: 'major', qualityName: 'added 11th', tier: 'extended', complexity: 2 },
  { id: '13sus4', symbol: '13sus4', aliases: ['13sus'], intervals: ['1', '4', '5', 'b7', '9', '13'], core: ['1', '4', '5'], family: 'suspended', qualityName: 'dominant 13th suspended 4th', tier: 'extended', complexity: 4, omittable: ['5'] },
];

/** Display form of an ASCII symbol: flats and sharps before a number become ♭ and ♯. */
function displaySymbol(symbol: string): string {
  return symbol.replace(/b(?=\d)/g, '♭').replace(/#/g, '♯');
}

export const CHORD_TYPES: readonly ChordType[] = CHORD_TYPE_SPECS.map((spec) => ({
  ...spec,
  display: spec.display ?? displaySymbol(spec.symbol),
  aliases: spec.aliases ?? [],
  omittable: spec.omittable ?? [],
}));

const CHORD_TYPES_BY_ID = new Map<string, ChordType>(CHORD_TYPES.map((t) => [t.id, t]));

export function getChordType(id: string): ChordType {
  const type = CHORD_TYPES_BY_ID.get(id);
  if (!type) throw new Error(`Unknown chord type "${id}"`);
  return type;
}

/** Common types, plus extended and altered ones when `includeExtended` is set. */
export function chordTypesForTiers(includeExtended: boolean): ChordType[] {
  return CHORD_TYPES.filter((t) => includeExtended || t.tier === 'common');
}

/** The chord's 3rd ('3' or 'b3'), or undefined for sus and power chords. */
export function chordThird(type: ChordType): IntervalName | undefined {
  return type.intervals.find((i) => i === '3' || i === 'b3');
}

/** The chord's 7th ('7', 'b7' or 'bb7'), or undefined. */
export function chordSeventh(type: ChordType): IntervalName | undefined {
  return type.intervals.find((i) => intervalDegree(i) === 7);
}

// ---------------------------------------------------------------------------
// Building and naming chords

export interface Chord {
  root: Note;
  type: ChordType;
  /** Set only when the bass differs from the root (inversions and slash chords). */
  bass?: Note;
}

export interface ChordTone {
  interval: IntervalName;
  note: Note;
  pc: PitchClass;
}

/**
 * A note as it reads in a chord name (a root or a bass): double accidentals
 * become the simplest spelling, and so do E♯, B♯, F♭ and C♭ unless `scale`
 * (the key's spelled scale) has that very note. C♯/E♯ is C♯/F without a key
 * and stays C♯/E♯ in F♯ major; Cdim7/B𝄫 is Cdim7/A.
 */
export function readableNote(n: Note, scale: readonly Note[] = []): Note {
  if (Math.abs(n.acc) >= 2) return simplifyNote(n);
  if (n.acc !== 0 && naturalLetter(pitchClass(n)) !== undefined && !scale.some((s) => noteEquals(s, n))) {
    return simplifyNote(n);
  }
  return n;
}

/**
 * Builds a chord. A bass given as a pitch class is spelled as the matching
 * chord tone, or by its interval from the root when it isn't one (F/G), and
 * made readable (readableNote: C♯/F, not C♯/E♯). A bass given as a note
 * keeps its spelling. A bass equal to the root is dropped.
 */
export function makeChord(root: Note, type: ChordType | string, bass?: Note | PitchClass): Chord {
  const chordType = typeof type === 'string' ? getChordType(type) : type;
  if (bass === undefined) return { root, type: chordType };
  const bassPc = typeof bass === 'number' ? bass : pitchClass(bass);
  if (bassPc === pitchClass(root)) return { root, type: chordType };
  const bassNote =
    typeof bass === 'number'
      ? readableNote(chordTones({ root, type: chordType }).find((t) => t.pc === bassPc)?.note ?? spellBassFromRoot(root, bassPc))
      : bass;
  return { root, type: chordType, bass: bassNote };
}

/** Simple intervals that read naturally above a root; on a tie, a bass at one of these wins (F/E♭, a ♭7, over F/D♯, a ♯6). */
const COMMON_BASS_INTERVALS: ReadonlySet<IntervalName> = new Set(['2', 'b2', 'b3', '3', '4', '#4', 'b5', '5', 'b6', '6', 'b7', '7']);

/**
 * Spells a bass that isn't a chord tone by its interval from the root: the
 * spelling with the fewest accidentals, then the least altered interval, then
 * a common interval. F♯/G♯ (a 2nd, not F♯/A♭), C♯/D♯, F/G, B♭/C, D/E.
 */
export function spellBassFromRoot(root: Note, bassPc: PitchClass): Note {
  const cost = (n: Note) => {
    const interval = intervalBetween(root, n);
    const alteration = /^[#b]*/.exec(interval)![0].length;
    return Math.abs(n.acc) * 10 + alteration * 2 + (COMMON_BASS_INTERVALS.has(interval) ? 0 : 1);
  };
  return LETTERS.map((l) => respell(bassPc, l))
    .filter((n) => Math.abs(n.acc) <= 2)
    .sort((a, b) => cost(a) - cost(b))[0]!;
}

/** Ranks a chord's spelling: the largest accidental, then how many tones need a double one, then the total. Lower reads better. */
function spellingCost(root: Note, type: ChordType): [number, number, number] {
  const accs = chordNotes({ root, type }).map((n) => Math.abs(n.acc));
  return [Math.max(...accs), accs.filter((a) => a >= 2).length, accs.reduce((a, b) => a + b, 0)];
}

function compareCost(a: readonly number[], b: readonly number[]): number {
  return a[0]! - b[0]! || a[1]! - b[1]! || a[2]! - b[2]!;
}

/**
 * Spells a chord root so the chord reads well. The given spelling is kept
 * unless a tone would need `limit` or more accidentals and the plain sharp or
 * flat spelling of the root needs fewer: C♯ E G B♭ stays C♯°7 (not D♭°7 with
 * C𝄫), G♯ B D F is G♯°7 rather than A♭°7, B♯ aug becomes C aug, F♭m becomes Em.
 * Natural roots never turn into B♯, E♯, F♭ or C♭, so Cdim7 keeps its B𝄫. Use
 * limit 2 for chromatic roots (avoid double accidentals) and 3 for a key's own
 * scale roots, which keep their letters unless a tone would need a triple
 * accidental.
 */
export function chordRootSpelling(root: Note, type: ChordType, limit: 2 | 3 = 2): Note {
  const own = spellingCost(root, type);
  if (own[0] < limit) return root;
  const pc = pitchClass(root);
  let best = { root, cost: own };
  for (const candidate of [spellPitchClass(pc, 'sharp'), spellPitchClass(pc, 'flat')]) {
    const cost = spellingCost(candidate, type);
    if (compareCost(cost, best.cost) < 0) best = { root: candidate, cost };
  }
  return best.root;
}

/**
 * Chord tones spelled from the root by interval, in interval order. Tensions
 * (9, 11, 13 and altered ones) that would need a double accidental take the
 * simplest spelling instead: E7alt has G for the ♯9, not F𝄪. So do tensions
 * that land on a white key with an accidental: A7♯9 has C, not B♯, and E♭7♭9
 * has E, not F♭. Chord tones up to the 7th keep their letters (C°7 has B𝄫).
 */
export function chordTones(chord: Pick<Chord, 'root' | 'type'>): ChordTone[] {
  return chord.type.intervals.map((interval) => {
    const spelled = transpose(chord.root, interval);
    const awkward = Math.abs(spelled.acc) >= 2 || (spelled.acc !== 0 && simplifyNote(spelled).acc === 0);
    const n = awkward && intervalDegree(interval) > 7 ? simplifyNote(spelled) : spelled;
    return { interval, note: n, pc: pitchClass(n) };
  });
}

export function chordNotes(chord: Pick<Chord, 'root' | 'type'>): Note[] {
  return chordTones(chord).map((t) => t.note);
}

/** Pitch classes of a chord type on a root, without spelling (for matching). */
export function chordTypePcSet(rootPc: PitchClass, type: ChordType): PitchClassSet {
  return pcSetOfNotes(chordNotes({ root: defaultSpelling(rootPc), type }));
}

/**
 * Pitch classes of the chord's structural tones: root, 3rd (or suspended
 * note), 5th, 6th and 7th. Tensions (9, 11, 13 and altered ones) are left
 * out, so G7♭9 fits C major like G7 does. Used to decide if a chord fits a key.
 */
export function chordStructurePcSet(chord: Pick<Chord, 'root' | 'type'>): PitchClassSet {
  return pcSetOfNotes(chordTones(chord).filter((t) => intervalDegree(t.interval) <= 7).map((t) => t.note));
}

/** Pitch classes of a chord, including a bass that isn't a chord tone. */
export function chordPcSet(chord: Chord): PitchClassSet {
  const tones = pcSetOfNotes(chordNotes(chord));
  return chord.bass ? tones | (1 << pitchClass(chord.bass)) : tones;
}

/** True for slash chords whose bass isn't a chord tone (F/G), false for inversions (C/E). */
export function hasNonChordBass(chord: Chord): boolean {
  return chord.bass !== undefined && !chordTones(chord).some((t) => t.pc === pitchClass(chord.bass!));
}

export function chordTypeSymbol(type: ChordType, style: AccidentalStyle = 'unicode'): string {
  return style === 'unicode' ? type.display : type.symbol;
}

/** 'B♭m7♭5/D♭' (unicode, default) or 'Bbm7b5/Db' (ascii). */
export function chordName(chord: Chord, style: AccidentalStyle = 'unicode'): string {
  const base = formatNote(chord.root, style) + chordTypeSymbol(chord.type, style);
  return chord.bass ? `${base}/${formatNote(chord.bass, style)}` : base;
}

// ---------------------------------------------------------------------------
// Chord symbol parser
//
// Root: a letter, then #/♯ or b/♭. Major marker: nothing, maj, M, Δ or ^
// (^ reads like Δ, as in iReal Pro charts). Minor marker: m, min or -. Case
// matters (M major, m minor). ° / o / dim, ø / h / m7b5, + / aug, C2 = Csus2. The last '/' followed by a note name is the
// bass, but 6/9 and m6/9 are matched as chord types first.

/**
 * Normalises a quality string so marker variants compare equal:
 * ♭/♯ → b/#, spaces and parentheses removed, every major marker → 'maj',
 * a leading minor marker → 'm'. A bare Δ (or ^) means maj7, as in jazz charts.
 */
function normalizeQuality(text: string): string {
  let q = text.replace(/♭/g, 'b').replace(/♯/g, '#').replace(/[\s()]/g, '');
  if (q === 'Δ' || q === '△' || q === '^') return 'maj7';
  q = q.replace(/Maj|MAJ|M|Δ|△|\^/g, 'maj');
  q = q.replace(/^(min|-)/, 'm');
  return q;
}

const CHORD_TYPES_BY_SPELLING: ReadonlyMap<string, ChordType> = (() => {
  const map = new Map<string, ChordType>();
  for (const type of CHORD_TYPES) {
    for (const spelling of [type.symbol, type.display, ...type.aliases]) {
      const key = normalizeQuality(spelling);
      const existing = map.get(key);
      if (existing && existing !== type) {
        throw new Error(`Chord spelling "${spelling}" is ambiguous: ${existing.id} and ${type.id}`);
      }
      map.set(key, type);
    }
  }
  return map;
})();

/** Looks up the chord type for the text after the root ('m7', '-7', 'Δ7', 'ø'). */
export function parseChordQuality(text: string): ChordType | null {
  return CHORD_TYPES_BY_SPELLING.get(normalizeQuality(text)) ?? null;
}

export type ChordParseResult = { ok: true; chord: Chord } | { ok: false; error: string };

const ROOT_RE = /^([A-Ga-g])(#|♯|b|♭)?/u;

export function parseChord(text: string): ChordParseResult {
  const input = text.trim();
  const rootMatch = ROOT_RE.exec(input);
  if (!rootMatch) return { ok: false, error: `"${input}" should start with a note name (A to G)` };
  const root = parseNote(rootMatch[0])!;
  const rest = input.slice(rootMatch[0].length);

  // Whole-string chord types first, so C6/9 is a chord and not C6 over 9.
  const type = parseChordQuality(rest);
  if (type) return { ok: true, chord: makeChord(root, type) };

  const slash = rest.lastIndexOf('/');
  if (slash < 0) return { ok: false, error: `Unknown chord quality "${rest}"` };
  const qualityText = rest.slice(0, slash);
  const bassText = rest.slice(slash + 1);
  const slashType = parseChordQuality(qualityText);
  if (!slashType) return { ok: false, error: `Unknown chord quality "${qualityText}"` };
  if (!bassText) return { ok: false, error: 'Missing bass note after "/"' };
  const bass = parseNote(bassText);
  if (!bass) return { ok: false, error: `Unknown bass note "${bassText}"` };
  return { ok: true, chord: makeChord(root, slashType, bass) };
}

export interface ChordToken {
  text: string;
  /** Offsets of the token in the input, for inline errors. */
  start: number;
  end: number;
  result: ChordParseResult;
}

export interface ProgressionParseResult {
  tokens: ChordToken[];
  /** The chords of the valid tokens, in order. */
  chords: Chord[];
}

/** Parses 'Am F C/E G7'. Tokens are separated by spaces, commas or bar lines; each gets its own result. */
export function parseProgression(text: string): ProgressionParseResult {
  const tokens: ChordToken[] = [];
  for (const match of text.matchAll(/[^\s,|]+/g)) {
    const start = match.index;
    tokens.push({ text: match[0], start, end: start + match[0].length, result: parseChord(match[0]) });
  }
  const chords = tokens.flatMap((t) => (t.result.ok ? [t.result.chord] : []));
  return { tokens, chords };
}
