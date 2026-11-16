// Chord finder: selected pitch classes (and an optional bass) → scored chord
// matches in three groups (exact, exact with one omission, contains).
//
// Matching works on pitch classes. Every root and chord type in the enabled
// tiers is tried; chords that hold every selected note are kept. When a bass
// is set, a second pass matches the other notes with the bass outside the
// chord (F/G, D/E, B♭/C). Chords with identical notes (C6 = Am7, the four
// names of a dim7) collapse into one result with alternative names.

import {
  chordPcSet,
  chordRootSpelling,
  chordSeventh,
  chordThird,
  chordTones,
  chordTypePcSet,
  chordTypesForTiers,
  hasNonChordBass,
  makeChord,
  readableNote,
  spellBassFromRoot,
  type Chord,
  type ChordTone,
  type ChordType,
  type QualityFamily,
} from './chords';
import { intervalDegree, type IntervalName } from './intervals';
import {
  defaultSpelling,
  mod12,
  pcSetHas,
  pcSetIsSubset,
  pcSetTranspose,
  pitchClass,
  type Note,
  type PitchClass,
  type PitchClassSet,
} from './notes';
import { diatonicFit } from './keyFinder';
import { keyPcSet, keyScale, spellInKey, type Key } from './scales';

export type MatchGroup = 'exact' | 'omitted' | 'contains';

/** Exact shows only the exact group; partial shows all three. */
export type MatchMode = 'exact' | 'partial';

export type MatchNoteState = 'selected' | 'missing' | 'omitted';

export interface MatchNote {
  note: Note;
  pc: PitchClass;
  /** The chord interval, or null for a bass that isn't a chord tone. */
  interval: IntervalName | null;
  state: MatchNoteState;
}

export interface ChordMatch {
  /** The main name; `bass` is set for inversions and slash chords. */
  chord: Chord;
  group: MatchGroup;
  /** 0..100, never higher than any result of an earlier group. */
  score: number;
  /** A bass outside the chord first (F/G), then the chord tones in interval order. */
  notes: MatchNote[];
  /** The tone left out in the 'omitted' group. */
  omitted: IntervalName | null;
  /** The bass isn't a chord tone (F/G). */
  nonChordBass: boolean;
  /** The chord fits the selected key (false when no key is set). */
  diatonic: boolean;
  /**
   * Other names for the same notes, best first (C6 = Am7). Names whose bass
   * isn't one of their chord tones are left out (Cmaj7 is not also Em/C).
   */
  alternates: Chord[];
}

export interface ChordFinderOptions {
  /** Pitch class of the bass; ignored unless it's one of the selected notes. */
  bass?: PitchClass | null;
  root?: PitchClass | null;
  family?: QualityFamily | null;
  /** Adds extended and altered chords. */
  extended?: boolean;
  /** Marks and favours chords that fit the key, and spells roots in it. */
  key?: Key | null;
  mode?: MatchMode;
}

export const MIN_MATCH_NOTES = 2;

/** Score weights, tuned with the fixed cases in tests/chordFinder.test.ts. */
export const CHORD_SCORE_WEIGHTS = {
  groupBase: { exact: 40, omitted: 30, contains: 15 } satisfies Record<MatchGroup, number>,
  /** Times the share of selected notes that are core tones, each weighted by its role. */
  coreShare: 30,
  /** The 3rd says most about a chord, then the root, the 5th, and a suspended note (C G is more likely C than Gsus4). */
  coreRole: { third: 1, root: 0.9, fifth: 0.8, suspended: 0.7 },
  /** Times the share of the chord's tones that were selected. */
  toneShare: 15,
  /** Per missing tone that isn't a core tone (an extension you didn't select). */
  missingTone: -5,
  /** A missing added 6th costs less: C6 is the closest relative of a C triad. */
  missingSixth: -4,
  /** A missing 7th that makes the chord a dominant costs more: it changes the chord's function. */
  missingDominantSeventh: -6,
  /** Per complexity point (C beats Cadd9 beats C6/9). */
  complexity: -2,
  bassIsRoot: 10,
  /** Bass on the 3rd (or suspended note), 5th or 7th: a normal inversion. */
  bassIsChordTone: 5,
  /** Bass outside the chord (F/G) or on an extension (Fadd9/G). */
  bassOutside: -10,
  diatonic: 5,
} as const;

const GROUP_ORDER: Readonly<Record<MatchGroup, number>> = { exact: 0, omitted: 1, contains: 2 };

interface Candidate {
  chord: Chord;
  rootPc: PitchClass;
  type: ChordType;
  typeIndex: number;
  group: MatchGroup;
  omitted: IntervalName | null;
  nonChordBass: boolean;
  diatonic: boolean;
  raw: number;
  /** Chord tones plus the bass: candidates with equal sets collapse. */
  pcSet: PitchClassSet;
  notes: MatchNote[];
}

interface MatchContext {
  /** Selected pitch classes in selection order (the lowest note first). */
  order: readonly PitchClass[];
  selected: PitchClassSet;
  bass: PitchClass | null;
  key: Key | null;
  /** The key's pitch classes, its spelled scale, and each pitch class spelled in the key (computed once per search). */
  keySet: PitchClassSet;
  keyScale: readonly Note[];
  keySpellings: readonly Note[];
  types: readonly ChordType[];
}

/**
 * Spells a chord root: in the key when one is set (else the default
 * spelling), switching to the enharmonic root when that avoids double
 * accidentals on a chromatic root (F♭m in D♭ major is Em) or triple ones on
 * a scale root. Chromatic roots are never E♯, B♯, F♭ or C♭ (E in D♭ major,
 * not F♭); scale roots keep the key's letters (C♭ in G♭ major).
 */
export function spellChordRoot(pc: PitchClass, type: ChordType, key: Key | null = null): Note {
  if (!key) return chordRootSpelling(defaultSpelling(pc), type);
  if (pcSetHas(keyPcSet(key), pc)) return chordRootSpelling(spellInKey(pc, key), type, 3);
  return chordRootSpelling(readableNote(spellInKey(pc, key)), type);
}

function spellRootInContext(ctx: MatchContext, pc: PitchClass, type: ChordType): Note {
  if (!ctx.key) return chordRootSpelling(defaultSpelling(pc), type);
  if (pcSetHas(ctx.keySet, pc)) return chordRootSpelling(ctx.keySpellings[pc]!, type, 3);
  return chordRootSpelling(readableNote(ctx.keySpellings[pc]!), type);
}

/**
 * Spells the bass of a chord (a pitch class): as the chord tone, else by its
 * interval from the root (F/G), then readable (readableNote) in the key:
 * E7alt/G (not F𝄪), C♯/F without a key, C♯/E♯ in C♯ major.
 */
export function spellChordBass(root: Note, type: ChordType, bassPc: PitchClass, key: Key | null = null): Note {
  const tone = chordTones({ root, type }).find((t) => t.pc === mod12(bassPc));
  return readableNote(tone?.note ?? spellBassFromRoot(root, mod12(bassPc)), key ? keyScale(key) : []);
}

/** The role of a core tone, or null for tones outside the core. */
function coreRole(type: ChordType, interval: IntervalName): keyof typeof CHORD_SCORE_WEIGHTS.coreRole | null {
  if (!type.core.includes(interval)) return null;
  const degree = intervalDegree(interval);
  if (degree === 1) return 'root';
  if (degree === 5) return 'fifth';
  return degree === 3 ? 'third' : 'suspended';
}

/** Fits the key, counting the harmonic minor V, V7, vii° and vii°7 in minor keys, as the key finder does. */
function isDiatonic(chord: Pick<Chord, 'root' | 'type'>, key: Key | null, keySet?: PitchClassSet): boolean {
  return key !== null && diatonicFit(chord, key, keySet) !== null;
}

/** The match group for a chord whose tones hold the matched notes, or null if it can't be one. */
function matchGroup(
  type: ChordType,
  tones: readonly ChordTone[],
  matched: PitchClassSet,
  matchedCount: number,
): { group: MatchGroup; omitted: IntervalName | null } {
  const missing = tones.filter((t) => !(matched & (1 << t.pc)));
  if (missing.length === 0) return { group: 'exact', omitted: null };
  const only = missing.length === 1 ? missing[0]! : null;
  if (only && type.omittable.includes(only.interval)) {
    // Rootless voicings need 4+ notes with the 3rd and 7th, so 3 notes don't match dozens of rootless chords.
    if (only.interval !== '1') return { group: 'omitted', omitted: only.interval };
    const third = chordThird(type);
    const seventh = chordSeventh(type);
    const has = (interval: IntervalName | undefined) =>
      interval !== undefined && tones.some((t) => t.interval === interval && matched & (1 << t.pc));
    if (matchedCount >= 4 && has(third) && has(seventh)) return { group: 'omitted', omitted: '1' };
  }
  return { group: 'contains', omitted: null };
}

function bassTerm(type: ChordType, tones: readonly ChordTone[], bass: PitchClass): number {
  const w = CHORD_SCORE_WEIGHTS;
  const tone = tones.find((t) => t.pc === bass);
  if (!tone) return w.bassOutside;
  if (tone.interval === '1') return w.bassIsRoot;
  const degree = intervalDegree(tone.interval);
  if (type.core.includes(tone.interval) || degree === 3 || degree === 5 || degree === 7) return w.bassIsChordTone;
  return w.bassOutside;
}

function scoreCandidate(
  ctx: MatchContext,
  type: ChordType,
  tones: readonly ChordTone[],
  group: MatchGroup,
  omitted: IntervalName | null,
  diatonic: boolean,
): number {
  const w = CHORD_SCORE_WEIGHTS;
  let coreSum = 0;
  for (const pc of ctx.order) {
    const tone = tones.find((t) => t.pc === pc);
    const role = tone ? coreRole(type, tone.interval) : null;
    if (role) coreSum += w.coreRole[role];
  }
  const selectedTones = tones.filter((t) => ctx.selected & (1 << t.pc)).length;
  let raw = w.groupBase[group] + (w.coreShare * coreSum) / ctx.order.length + (w.toneShare * selectedTones) / tones.length;
  for (const t of tones) {
    if (ctx.selected & (1 << t.pc) || t.interval === omitted || type.core.includes(t.interval)) continue;
    const degree = intervalDegree(t.interval);
    if (degree === 6) raw += w.missingSixth;
    else if (degree === 7 && type.family === 'dominant') raw += w.missingDominantSeventh;
    else raw += w.missingTone;
  }
  raw += w.complexity * type.complexity;
  if (ctx.bass !== null) raw += bassTerm(type, tones, ctx.bass);
  if (diatonic) raw += w.diatonic;
  return raw;
}

/**
 * One matching pass. `matched` are the notes the chord must hold; with
 * `outsideBass` the bass must not be a chord tone and only exact and omitted
 * matches count (the non-chord-bass pass, F/G).
 */
function matchPass(ctx: MatchContext, matched: PitchClassSet, matchedCount: number, outsideBass: boolean): Candidate[] {
  const out: Candidate[] = [];
  ctx.types.forEach((type, typeIndex) => {
    // A power chord over an outside bass is just the triad (C5/E = C/E).
    if (outsideBass && type.id === '5') return;
    const typeSet = chordTypePcSet(0, type);
    for (let rootPc = 0; rootPc < 12; rootPc++) {
      // Pitch classes first: spelling is only worth it for chords that hold the notes.
      const toneSet = pcSetTranspose(typeSet, rootPc);
      if (!pcSetIsSubset(matched, toneSet)) continue;
      const root = spellRootInContext(ctx, rootPc, type);
      const tones = chordTones({ root, type });
      const bassInChord = ctx.bass !== null && (toneSet & (1 << ctx.bass)) !== 0;
      if (outsideBass && bassInChord) continue;
      const { group, omitted } = matchGroup(type, tones, matched, matchedCount);
      if (outsideBass && group === 'contains') continue;

      const bassNote =
        ctx.bass === null
          ? undefined
          : readableNote(tones.find((t) => t.pc === ctx.bass)?.note ?? spellBassFromRoot(root, ctx.bass), ctx.keyScale);
      const chord = makeChord(root, type, bassNote);
      const diatonic = isDiatonic(chord, ctx.key, ctx.keySet);
      const notes: MatchNote[] = tones.map((t) => ({
        note: t.note,
        pc: t.pc,
        interval: t.interval,
        state: ctx.selected & (1 << t.pc) ? 'selected' : t.interval === omitted ? 'omitted' : 'missing',
      }));
      if (outsideBass && bassNote) notes.unshift({ note: bassNote, pc: ctx.bass!, interval: null, state: 'selected' });
      out.push({
        chord,
        rootPc,
        type,
        typeIndex,
        group,
        omitted,
        nonChordBass: outsideBass,
        diatonic,
        raw: scoreCandidate(ctx, type, tones, group, omitted, diatonic),
        pcSet: ctx.bass === null ? toneSet : toneSet | (1 << ctx.bass),
        notes,
      });
    }
  });
  return out;
}

/** Ties after score: simplicity, the root that comes first in the selection, and the chord table order. */
function compareTies(ctx: MatchContext, a: Candidate, b: Candidate): number {
  const position = (pc: PitchClass) => {
    const i = ctx.order.indexOf(pc);
    return i < 0 ? ctx.order.length : i;
  };
  return (
    a.type.complexity - b.type.complexity ||
    position(a.rootPc) - position(b.rootPc) ||
    a.typeIndex - b.typeIndex ||
    a.rootPc - b.rootPc
  );
}

/**
 * Order among chords with the same notes, to pick the main name: the best
 * group, then (with a bass) the chord rooted on the bass, then score and the
 * ties. Symmetric chords (°7, aug) so take their name from the bass, or else
 * the lowest selected note.
 */
function compareNames(ctx: MatchContext, a: Candidate, b: Candidate): number {
  return (
    GROUP_ORDER[a.group] - GROUP_ORDER[b.group] ||
    (ctx.bass === null ? 0 : Number(b.rootPc === ctx.bass) - Number(a.rootPc === ctx.bass)) ||
    b.raw - a.raw ||
    compareTies(ctx, a, b)
  );
}

/** Order of the results: by group, then strictly by score, so a bar never goes up the list. */
function compareResults(ctx: MatchContext, a: Candidate, b: Candidate): number {
  return GROUP_ORDER[a.group] - GROUP_ORDER[b.group] || b.raw - a.raw || compareTies(ctx, a, b);
}

/**
 * Finds chords for the selected pitch classes, best first. Pass them in
 * selection order (lowest note first): it breaks ties between equal names,
 * so C Eb Gb A gives Cdim7 and A C Eb Gb gives Adim7. Needs at least
 * MIN_MATCH_NOTES distinct notes.
 */
export function findChords(selected: readonly PitchClass[], options: ChordFinderOptions = {}): ChordMatch[] {
  const order = [...new Set(selected.map(mod12))];
  if (order.length < MIN_MATCH_NOTES) return [];
  const selectedSet = order.reduce((set, pc) => set | (1 << pc), 0);
  const bass = options.bass != null && order.includes(mod12(options.bass)) ? mod12(options.bass) : null;
  const key = options.key ?? null;
  const ctx: MatchContext = {
    order,
    selected: selectedSet,
    bass,
    key,
    keySet: key ? keyPcSet(key) : 0,
    keyScale: key ? keyScale(key) : [],
    keySpellings: key ? Array.from({ length: 12 }, (_, pc) => spellInKey(pc, key)) : [],
    types: chordTypesForTiers(options.extended ?? false),
  };

  const candidates = matchPass(ctx, selectedSet, order.length, false);
  if (bass !== null && order.length - 1 >= MIN_MATCH_NOTES) {
    candidates.push(...matchPass(ctx, selectedSet & ~(1 << bass), order.length - 1, true));
  }

  const bySet = new Map<PitchClassSet, Candidate[]>();
  for (const c of candidates) {
    const members = bySet.get(c.pcSet);
    if (members) members.push(c);
    else bySet.set(c.pcSet, [c]);
  }

  const passes = (c: Candidate) =>
    (options.root == null || c.rootPc === mod12(options.root)) && (options.family == null || c.type.family === options.family);

  const results: { main: Candidate; alternates: Candidate[] }[] = [];
  for (const members of bySet.values()) {
    members.sort((a, b) => compareNames(ctx, a, b));
    const main = members.find(passes);
    if (!main) continue;
    if (options.mode === 'exact' && main.group !== 'exact') continue;
    results.push({ main, alternates: members.filter((m) => m !== main && !m.nonChordBass) });
  }

  results.sort((a, b) => compareResults(ctx, a.main, b.main));

  // Scores never go up the list: a group's scores stay at or below the previous group's lowest.
  let ceiling = 100;
  let currentGroup: MatchGroup | null = null;
  let groupLowest = 100;
  return results.map(({ main, alternates }) => {
    if (main.group !== currentGroup) {
      if (currentGroup !== null) ceiling = groupLowest;
      currentGroup = main.group;
    }
    const score = Math.round(Math.max(0, Math.min(ceiling, main.raw)));
    groupLowest = Math.min(groupLowest, score);
    return {
      chord: main.chord,
      group: main.group,
      score,
      notes: main.notes,
      omitted: main.omitted,
      nonChordBass: main.nonChordBass,
      diatonic: main.diatonic,
      alternates: alternates.map((a) => a.chord),
    };
  });
}

/**
 * The chords of one root and quality family, simplest first: what the finder
 * shows when a root and family are set with fewer than MIN_MATCH_NOTES notes.
 */
export function chordsForRootAndFamily(
  root: PitchClass,
  family: QualityFamily,
  options: Pick<ChordFinderOptions, 'extended' | 'key'> = {},
): Chord[] {
  return chordTypesForTiers(options.extended ?? false)
    .filter((t) => t.family === family)
    .sort((a, b) => a.complexity - b.complexity)
    .map((t) => makeChord(spellChordRoot(mod12(root), t, options.key ?? null), t));
}

/** True when the chord's root, 3rd, 5th and 7th are in the key's scale, or it's a harmonic minor V, V7, vii° or vii°7 in a minor key. */
export function chordFitsKey(chord: Pick<Chord, 'root' | 'type'>, key: Key): boolean {
  return isDiatonic(chord, key);
}

/**
 * Other names for a chord's notes, bass included, best first: the finder's
 * exact matches with the chord's bass (or root) as the bass, so C6 gives
 * Am7/C and C°7 gives D♯°7/C. Names whose bass isn't one of their chord
 * tones are left out (Cmaj7 gives no Em/C). Roots and basses are spelled like the chord's
 * own notes, so D♭6 gives B♭m7/D♭ and Caug gives Eaug/C (not Eaug/B♯).
 */
export function chordAlternates(chord: Chord): Chord[] {
  const tones = chordTones(chord);
  const bassPc = pitchClass(chord.bass ?? chord.root);
  const spelled = new Map<PitchClass, Note>(tones.map((t) => [t.pc, t.note]));
  if (chord.bass) spelled.set(bassPc, chord.bass);
  const pcSet = chordPcSet(chord);
  const match = findChords([bassPc, ...tones.map((t) => t.pc)], { bass: bassPc, extended: true, mode: 'exact' }).find(
    (m) => chordPcSet(m.chord) === pcSet,
  );
  if (!match) return [];
  const bassOf = (c: Chord) => (c.bass ? pitchClass(c.bass) : null);
  const isSelf = (c: Chord) =>
    pitchClass(c.root) === pitchClass(chord.root) && c.type.id === chord.type.id && bassOf(c) === bassOf(chord);
  return [match.chord, ...match.alternates]
    .filter((c) => !isSelf(c) && !hasNonChordBass(c))
    .map((c) => {
      const root = chordRootSpelling(readableNote(spelled.get(pitchClass(c.root)) ?? c.root), c.type);
      const bass = bassOf(c);
      return bass === null ? makeChord(root, c.type) : makeChord(root, c.type, readableNote(spelled.get(bass) ?? c.bass!));
    });
}
