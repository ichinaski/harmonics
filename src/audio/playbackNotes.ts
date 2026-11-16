// MIDI notes to play for a scale: the scale going up with the octave on top,
// and its tonic arpeggio. Chords are voiced by theory/voicings.ts
// (chordVoicingMidi), so they sound the way the Chord notes view lists them.

import { mod12, pitchClass, type Note } from '../theory';

/** A scale played upwards from a tonic in `octave` (4 → C4..B4), each note above the previous, ending on the tonic an octave up. */
export function scalePlaybackMidi(notes: readonly Note[], octave = 4): number[] {
  if (notes.length === 0) return [];
  const first = 12 * (octave + 1) + pitchClass(notes[0]!);
  const out = [first];
  for (const n of notes.slice(1)) {
    const prev = out[out.length - 1]!;
    out.push(prev + (mod12(pitchClass(n) - prev) || 12));
  }
  out.push(first + 12);
  return out;
}

/**
 * The tonic arpeggio of a scale: tonic, 3rd, 5th and the octave, using the
 * scale's own 3rd (minor or major) and 5th (perfect, else diminished), so C
 * Locrian gives C E♭ G♭ C. Notes the scale lacks are skipped.
 */
export function scaleArpeggioMidi(notes: readonly Note[], octave = 4): number[] {
  const scale = scalePlaybackMidi(notes, octave);
  if (scale.length === 0) return [];
  const tonic = scale[0]!;
  const above = (...semitones: number[]) => semitones.map((s) => tonic + s).find((m) => scale.includes(m));
  const third = above(4, 3);
  const fifth = above(7, 6);
  return [tonic, ...(third === undefined ? [] : [third]), ...(fifth === undefined ? [] : [fifth]), tonic + 12];
}
