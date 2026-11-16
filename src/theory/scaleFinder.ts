// Scale finder: selected melody notes (and an optional tonic) → the scales
// that contain them, exact matches first, then by fewest extra notes.
//
// Without a tonic, the 7 modes of one major scale all match together (they
// share their notes), so results are grouped by parent scale: "C major
// family: C Ionian, D Dorian, ...". Major and minor pentatonic share notes the
// same way. The member whose tonic is the first (lowest) selected note goes on
// top, and the whole group is spelled from it so every member uses the same
// letters.

import { formatNote, mod12, pcSetHas, pcSetIsSubset, pitchClass, toPcSet, type Note, type PitchClass, type PitchClassSet } from './notes';
import {
  MODE_IDS,
  SCALE_TYPES,
  getScaleType,
  isMode,
  keyTonicSpelling,
  scalePcSet,
  spellScale,
  type Key,
  type ScaleId,
  type ScaleType,
} from './scales';

export interface ScaleMatch {
  tonic: Note;
  scale: ScaleType;
  /** The scale, spelled from the tonic. */
  notes: Note[];
  /** Scale notes that aren't selected (nor the chosen tonic). */
  extra: Note[];
  exact: boolean;
}

export interface ScaleGroup {
  /** 'C major family', 'C major pentatonic family', or the scale's name for scales without relatives ('A harmonic minor'). */
  name: string;
  /** Top member first (tonic on the first selected note), then the rest in parent order. */
  matches: ScaleMatch[];
  exact: boolean;
  extraCount: number;
}

export interface ScaleFinderOptions {
  /**
   * Only scales on this tonic, all spelled from it (as shown in the tonic
   * picker) unless that gives a theoretical key: E♭ Phrygian, but D♯ Locrian.
   */
  tonic?: Note | null;
}

/** Tie-break order between scales with the same number of extra notes: the more common first. */
export const SCALE_POPULARITY: readonly ScaleId[] = [
  'ionian',
  'aeolian',
  'dorian',
  'mixolydian',
  'majorPentatonic',
  'minorPentatonic',
  'blues',
  'harmonicMinor',
  'melodicMinor',
  'lydian',
  'phrygian',
  'locrian',
];

/** Scales that share their notes with relatives, in parent order (the parent first). */
const FAMILIES: readonly (readonly ScaleId[])[] = [MODE_IDS, ['majorPentatonic', 'minorPentatonic']];

/** Group name after the parent's tonic: 'C major family'. */
const FAMILY_NAMES: Readonly<Partial<Record<ScaleId, string>>> = {
  ionian: 'major family',
  majorPentatonic: 'major pentatonic family',
};

function familyOf(id: ScaleId): readonly ScaleId[] {
  return FAMILIES.find((f) => f.includes(id)) ?? [id];
}

/** 'D Dorian', 'C Ionian', 'A harmonic minor', 'C major pentatonic'. Mode names are capitalised, other scale names lowercase. */
export function scaleName(tonic: Note, scale: ScaleType | ScaleId): string {
  const type = typeof scale === 'string' ? getScaleType(scale) : scale;
  const name = isMode(type.id) ? type.name : type.name[0]!.toLowerCase() + type.name.slice(1);
  return `${formatNote(tonic)} ${name}`;
}

/** The key of a mode match, for linking to the Harmonize tab; null for other scales. */
export function scaleMatchKey(match: ScaleMatch): Key | null {
  return isMode(match.scale.id) ? { tonic: match.tonic, mode: match.scale.id } : null;
}

interface Candidate {
  tonicPc: PitchClass;
  scale: ScaleType;
  pcSet: PitchClassSet;
}

function candidates(selected: PitchClassSet, tonic: PitchClass | null): Candidate[] {
  const out: Candidate[] = [];
  for (const scale of SCALE_TYPES) {
    for (let pc = 0; pc < 12; pc++) {
      if (tonic !== null && pc !== tonic) continue;
      const pcSet = scalePcSet(pc, scale);
      if (pcSetIsSubset(selected, pcSet)) out.push({ tonicPc: pc, scale, pcSet });
    }
  }
  return out;
}

function toMatch(tonic: Note, scale: ScaleType, wanted: PitchClassSet): ScaleMatch {
  const notes = spellScale(tonic, scale);
  const extra = notes.filter((n) => !pcSetHas(wanted, pitchClass(n)));
  return { tonic, scale, notes, extra, exact: extra.length === 0 };
}

function compareMatches(a: ScaleMatch, b: ScaleMatch, first: PitchClass): number {
  return (
    Number(b.exact) - Number(a.exact) ||
    a.extra.length - b.extra.length ||
    SCALE_POPULARITY.indexOf(a.scale.id) - SCALE_POPULARITY.indexOf(b.scale.id) ||
    mod12(pitchClass(a.tonic) - first) - mod12(pitchClass(b.tonic) - first)
  );
}

/**
 * Scales on every tonic (or only `tonic`) that contain all selected notes,
 * best first. Pass the notes lowest first. A chosen tonic counts as selected.
 */
export function findScales(selected: readonly PitchClass[], options: ScaleFinderOptions = {}): ScaleMatch[] {
  const order = [...new Set(selected.map(mod12))];
  if (order.length === 0) return [];
  const tonic = options.tonic ?? null;
  const tonicPc = tonic === null ? null : pitchClass(tonic);
  const wanted = toPcSet(tonicPc === null ? order : [...order, tonicPc]);
  return candidates(wanted, tonicPc)
    .map((c) => toMatch(keyTonicSpelling(c.tonicPc, c.scale.keyMode, tonic ?? undefined), c.scale, wanted))
    .sort((a, b) => compareMatches(a, b, order[0]!));
}

/**
 * Scales that contain all selected notes, grouped by parent scale, best group
 * first (exact, then fewest extra notes, then the more common top scale).
 * Pass the notes lowest first: the first note decides the top member.
 */
export function findScaleGroups(selected: readonly PitchClass[]): ScaleGroup[] {
  const order = [...new Set(selected.map(mod12))];
  if (order.length === 0) return [];
  const first = order[0]!;
  const wanted = toPcSet(order);

  const byFamily = new Map<string, Candidate[]>();
  for (const c of candidates(wanted, null)) {
    const id = `${familyOf(c.scale.id)[0]}:${c.pcSet}`;
    const members = byFamily.get(id);
    if (members) members.push(c);
    else byFamily.set(id, [c]);
  }

  const groups: ScaleGroup[] = [];
  for (const members of byFamily.values()) {
    const family = familyOf(members[0]!.scale.id);
    members.sort((a, b) => family.indexOf(a.scale.id) - family.indexOf(b.scale.id));
    const top = members.find((m) => m.tonicPc === first) ?? members[0]!;
    const topMatch = toMatch(keyTonicSpelling(top.tonicPc, top.scale.keyMode), top.scale, wanted);
    const spelled = (m: Candidate) => topMatch.notes.find((n) => pitchClass(n) === m.tonicPc)!;
    const matches = [topMatch, ...members.filter((m) => m !== top).map((m) => toMatch(spelled(m), m.scale, wanted))];
    const parent = matches.find((m) => m.scale.id === family[0])!;
    const familyName = FAMILY_NAMES[parent.scale.id];
    const name = familyName ? `${formatNote(parent.tonic)} ${familyName}` : scaleName(parent.tonic, parent.scale);
    groups.push({ name, matches, exact: topMatch.exact, extraCount: topMatch.extra.length });
  }
  return groups.sort((a, b) => compareMatches(a.matches[0]!, b.matches[0]!, first));
}
