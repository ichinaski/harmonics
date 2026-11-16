// The self-hosted sample sets of the sampled instruments: which FluidR3_GM
// instrument each one comes from, its folder under public/samples/, and the
// notes kept (one every minor third, so smplr pitch-shifts any note by at most
// a semitone). Shared by src/audio/sampler.ts and scripts/fetch-samples.ts, so
// it imports nothing.

export interface SampleSet {
  /** Folder under public/samples/. */
  folder: string;
  /** Instrument name in gleitz/midi-js-soundfonts FluidR3_GM. */
  soundfont: string;
  /** First sample is C of this octave, last is C of `toOctave`. */
  fromOctave: number;
  toOctave: number;
}

/** Note names of the samples within an octave (gleitz names notes with flats). */
export const SAMPLE_PITCHES = ['C', 'Eb', 'Gb', 'A'] as const;

/**
 * Keyed by the sampled instrument ids of the audio engine. The bass plays
 * everything an octave lower (see INSTRUMENTS in engine.ts), so its set is an
 * octave lower too.
 */
export const SAMPLE_SETS = {
  piano: { folder: 'piano', soundfont: 'acoustic_grand_piano', fromOctave: 2, toOctave: 6 },
  electricGuitar: { folder: 'electric-guitar', soundfont: 'electric_guitar_clean', fromOctave: 2, toOctave: 6 },
  acousticGuitar: { folder: 'acoustic-guitar', soundfont: 'acoustic_guitar_steel', fromOctave: 2, toOctave: 6 },
  bass: { folder: 'bass', soundfont: 'electric_bass_finger', fromOctave: 1, toOctave: 5 },
} as const satisfies Record<string, SampleSet>;

export type SampledInstrumentId = keyof typeof SAMPLE_SETS;

/** 'C2', 'Eb2', 'Gb2', 'A2', ..., 'C6': 17 notes for a 4-octave set. */
export function sampleNotes(set: SampleSet): string[] {
  const notes: string[] = [];
  for (let octave = set.fromOctave; octave < set.toOctave; octave++) {
    for (const pitch of SAMPLE_PITCHES) notes.push(`${pitch}${octave}`);
  }
  notes.push(`C${set.toOctave}`);
  return notes;
}
