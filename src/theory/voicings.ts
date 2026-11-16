// The voicing of a chord as exact MIDI notes, bottom to top, with the bass at
// the bottom: root position by default, the inversion when the bass is a
// chord tone (C/E: E G C), and a bass that isn't a chord tone below the root
// position chord (F/G: G F A C). This is how every chord in the app sounds and
// how the Chord notes view lists it. Also names the inversion and lists the
// chord's notes with their intervals and alternative names.

import { chordAlternates } from './chordFinder';
import { CHORD_TYPES, chordName, chordPcSet, chordTones, chordTypePcSet, hasNonChordBass, makeChord, type Chord } from './chords';
import { intervalDegree, parseInterval, type IntervalName } from './intervals';
import { formatAccidental, mod12, pitchClass, type Note } from './notes';

export interface VoicingNote {
  note: Note;
  midi: number;
  /** Interval above the root, or null for a slash bass that isn't a chord tone. */
  interval: IntervalName | null;
}

/** Lowest chord tone of every voicing: C3 (MIDI 48) to B3. A bass outside the chord sits below it. */
const LOWEST_FLOOR = 48;

/**
 * Voices a chord bottom to top. Chord tones are stacked in interval order,
 * starting from the bass when it's a chord tone (an inversion), each the
 * nearest note above the previous one, so the lowest tone falls in C3..B3.
 * A bass that isn't a chord tone goes below, within an octave.
 */
export function chordVoicing(chord: Chord): VoicingNote[] {
  const tones = chordTones(chord);
  const bassPc = chord.bass ? pitchClass(chord.bass) : null;
  const start = Math.max(0, tones.findIndex((t) => t.pc === bassPc));
  const ordered = [...tones.slice(start), ...tones.slice(0, start)];
  const midis: number[] = [];
  for (const t of ordered) {
    const prev = midis[midis.length - 1];
    midis.push(prev === undefined ? LOWEST_FLOOR + t.pc : prev + (mod12(t.pc - prev) || 12));
  }
  const notes: VoicingNote[] = ordered.map((t, i) => ({ note: t.note, midi: midis[i]!, interval: t.interval }));
  if (chord.bass && hasNonChordBass(chord)) {
    const lowest = midis[0]!;
    notes.unshift({ note: chord.bass, midi: lowest - (mod12(lowest - pitchClass(chord.bass)) || 12), interval: null });
  }
  return notes;
}

/** MIDI notes of a chord's voicing, bottom to top: what Play and Arpeggio sound. */
export function chordVoicingMidi(chord: Chord): number[] {
  return chordVoicing(chord).map((n) => n.midi);
}

export type InversionName =
  | 'Root position'
  | '1st inversion'
  | '2nd inversion'
  | '3rd inversion'
  | `Bass on the ${string}`
  | 'Bass not in chord';

/** A bass outside the chord this many semitones above the root reads as the chord's 6th, ♭7 or 7th. */
const SIXTH_OR_SEVENTH_LABELS: Readonly<Record<number, string>> = { 9: '6', 10: '♭7', 11: '7' };

/**
 * The 7th or 6th chord on the same root with the same notes, for a slash
 * chord whose bass is the chord's 6th, ♭7 or 7th: C/B♭ is C7/B♭, Am/G is
 * Am7/G, C/A is C6/A. The simplest such chord (common ones first), or null.
 */
export function sixthOrSeventhChord(chord: Chord): Chord | null {
  if (!chord.bass || !hasNonChordBass(chord)) return null;
  const rootPc = pitchClass(chord.root);
  const above = mod12(pitchClass(chord.bass) - rootPc);
  if (!(above in SIXTH_OR_SEVENTH_LABELS)) return null;
  const pcSet = chordPcSet(chord);
  const type = CHORD_TYPES.filter((t) => chordTypePcSet(rootPc, t) === pcSet)
    .filter((t) => t.intervals.some((i) => intervalDegree(i) >= 6 && intervalDegree(i) <= 7 && mod12(parseInterval(i)!.semitones) === above))
    .sort((a, b) => (a.tier === b.tier ? 0 : a.tier === 'common' ? -1 : 1) || a.complexity - b.complexity)[0];
  return type ? makeChord(chord.root, type, chord.bass) : null;
}

/**
 * Names the inversion from the bass: the 3rd (or the suspended note) is the
 * 1st inversion, the 5th the 2nd, the 7th (or the 6th of 6th chords) the 3rd.
 * A bass on an extension is 'Bass on the 9th' ('Bass on the ♯11' for altered
 * ones). A bass outside the chord on its 6th, ♭7 or 7th names the chord
 * with the same notes: C/B♭ is 'Bass on the ♭7 (same notes as C7, 3rd
 * inversion)'. Any other bass outside the chord (F/G) is 'Bass not in chord'.
 */
export function inversionName(chord: Chord): InversionName {
  if (!chord.bass) return 'Root position';
  const bassPc = pitchClass(chord.bass);
  const tone = chordTones(chord).find((t) => t.pc === bassPc);
  if (!tone) {
    const same = sixthOrSeventhChord(chord);
    if (!same) return 'Bass not in chord';
    const label = SIXTH_OR_SEVENTH_LABELS[mod12(bassPc - pitchClass(chord.root))]!;
    return `Bass on the ${label} (same notes as ${chordName({ root: same.root, type: same.type })}, ${inversionName(same)})`;
  }
  if (tone.interval === '1') return 'Root position';
  const degree = intervalDegree(tone.interval);
  if (degree === 5) return '2nd inversion';
  if (degree === 6 || degree === 7) return '3rd inversion';
  if (chord.type.core.includes(tone.interval)) return '1st inversion';
  const alteration = parseInterval(tone.interval)!.alteration;
  return alteration === 0 ? `Bass on the ${degree}th` : `Bass on the ${formatAccidental(alteration)}${degree}`;
}

/** Display form of an interval: '1', '3', '♭7', '♯11'. */
export function intervalLabel(interval: IntervalName): string {
  const parsed = parseInterval(interval)!;
  return formatAccidental(parsed.alteration) + parsed.degree;
}

export interface ChordNoteDetail extends VoicingNote {
  /** '♭7', or 'bass' for a slash bass that isn't a chord tone. */
  label: string;
}

export interface ChordNoteDetails {
  /** The voicing bottom to top, each note with its interval label. */
  notes: ChordNoteDetail[];
  inversion: InversionName;
  /**
   * Other names for the same notes, best first (C6: Am7/C), spelled like the
   * chord. A slash chord with its 6th or 7th in the bass lists that 6th or
   * 7th chord first (C/B♭: C7/B♭).
   */
  alternates: Chord[];
}

/** Everything the Chord notes view shows about a chord. */
export function chordNoteDetails(chord: Chord): ChordNoteDetails {
  const same = sixthOrSeventhChord(chord);
  const others = chordAlternates(chord);
  const sameName = same && chordName(same);
  return {
    notes: chordVoicing(chord).map((n) => ({ ...n, label: n.interval === null ? 'bass' : intervalLabel(n.interval) })),
    inversion: inversionName(chord),
    alternates: same ? [same, ...others.filter((c) => chordName(c) !== sameName)] : others,
  };
}
