import { describe, expect, it } from 'vitest';
import { scaleArpeggioMidi, scalePlaybackMidi } from '../src/audio/playbackNotes';
import { note, spellScale } from '../src/theory';

describe('scalePlaybackMidi', () => {
  it('plays upwards from the tonic and ends an octave up', () => {
    expect(scalePlaybackMidi(spellScale(note('C'), 'ionian'))).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
    expect(scalePlaybackMidi(spellScale(note('A'), 'minorPentatonic'), 3)).toEqual([57, 60, 62, 64, 67, 69]);
    expect(scalePlaybackMidi(spellScale(note('G'), 'mixolydian'))).toEqual([67, 69, 71, 72, 74, 76, 77, 79]);
  });

  it('is empty for no notes', () => {
    expect(scalePlaybackMidi([])).toEqual([]);
  });
});

describe('scaleArpeggioMidi', () => {
  it('plays the tonic, the scale’s 3rd and 5th, and the octave', () => {
    expect(scaleArpeggioMidi(spellScale(note('C'), 'ionian'))).toEqual([60, 64, 67, 72]);
    expect(scaleArpeggioMidi(spellScale(note('A'), 'aeolian'), 3)).toEqual([57, 60, 64, 69]);
    expect(scaleArpeggioMidi(spellScale(note('B'), 'locrian'), 3)).toEqual([59, 62, 65, 71]);
    expect(scaleArpeggioMidi(spellScale(note('C'), 'minorPentatonic'))).toEqual([60, 63, 67, 72]);
  });

  it('is empty for no notes', () => {
    expect(scaleArpeggioMidi([])).toEqual([]);
  });
});
