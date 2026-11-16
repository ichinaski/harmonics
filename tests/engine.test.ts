import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ARPEGGIO_STEP,
  CHORD_DURATION,
  INSTRUMENTS,
  STRUM_STEP,
  arpeggioEvents,
  chordEvents,
  instrumentInfo,
  isInstrumentId,
  playArpeggio,
  playChord,
  playNote,
  playProgression,
  playScale,
  progressionStepSeconds,
  scaleEvents,
  silentWav,
  stopAll,
} from '../src/audio/engine';

describe('instruments', () => {
  it('lists the five instruments with their chord style and transposition', () => {
    expect(INSTRUMENTS.map((i) => i.label)).toEqual(['Synth', 'Piano', 'Electric guitar', 'Acoustic guitar', 'Bass']);
    expect(INSTRUMENTS.map((i) => i.shortLabel)).toEqual(['Synth', 'Piano', 'E. guitar', 'A. guitar', 'Bass']);
    expect(instrumentInfo('electricGuitar').chordStyle).toBe('strum');
    expect(instrumentInfo('acousticGuitar').chordStyle).toBe('strum');
    expect(instrumentInfo('piano').chordStyle).toBe('block');
    expect(instrumentInfo('synth').chordStyle).toBe('block');
    expect(instrumentInfo('bass').chordStyle).toBe('block');
    expect(instrumentInfo('bass').transpose).toBe(-12);
    expect(instrumentInfo('piano').transpose).toBe(0);
  });

  it('validates instrument ids', () => {
    expect(isInstrumentId('piano')).toBe(true);
    expect(isInstrumentId('organ')).toBe(false);
    expect(isInstrumentId(undefined)).toBe(false);
  });
});

describe('chordEvents', () => {
  it('plays a block chord with all notes at once, sorted and deduplicated', () => {
    const events = chordEvents([55, 48, 52, 48], 'block');
    expect(events.map((e) => e.midi)).toEqual([48, 52, 55]);
    expect(events.every((e) => e.offset === 0 && e.duration === CHORD_DURATION)).toBe(true);
  });

  it('strums low to high 15 ms apart and releases all notes together', () => {
    const events = chordEvents([64, 40, 45, 50, 55, 59], 'strum');
    expect(STRUM_STEP).toBe(0.015);
    expect(events.map((e) => e.midi)).toEqual([40, 45, 50, 55, 59, 64]);
    events.forEach((e, i) => expect(e.offset).toBeCloseTo(i * 0.015));
    for (const e of events) expect(e.offset + e.duration).toBeCloseTo(CHORD_DURATION);
  });

  it('plays dense chords a little softer', () => {
    expect(chordEvents([48, 52, 55], 'block')[0]!.velocity).toBeGreaterThan(chordEvents([48, 52, 55, 59, 62], 'block')[0]!.velocity);
  });
});

describe('arpeggioEvents', () => {
  it('plays notes one by one and lets them ring to a common end', () => {
    const events = arpeggioEvents([55, 48, 52]);
    expect(events.map((e) => e.midi)).toEqual([48, 52, 55]);
    expect(events.map((e) => e.offset)).toEqual([0, ARPEGGIO_STEP, 2 * ARPEGGIO_STEP]);
    const ends = events.map((e) => e.offset + e.duration);
    for (const end of ends) expect(end).toBeCloseTo(ends[0]!);
  });

  it('handles an empty chord', () => {
    expect(arpeggioEvents([])).toEqual([]);
  });
});

describe('scaleEvents', () => {
  it('keeps the given order, evenly spaced, with a longer last note', () => {
    const events = scaleEvents([60, 62, 64, 72], 0.25);
    expect(events.map((e) => e.midi)).toEqual([60, 62, 64, 72]);
    expect(events.map((e) => e.offset)).toEqual([0, 0.25, 0.5, 0.75]);
    expect(events[0]!.duration).toBeGreaterThan(0.25);
    expect(events[3]!.duration).toBeGreaterThan(events[0]!.duration);
  });
});

describe('playback without Web Audio', () => {
  it('has no sound gate, and plays nothing without an AudioContext (node)', () => {
    expect(playNote(60)).toEqual([]);
    expect(playChord([60, 64, 67], 'block')).toEqual([]);
    expect(playArpeggio([60, 64, 67])).toEqual([]);
    expect(playScale([60, 62, 64])).toEqual([]);
  });
});

describe('playProgression', () => {
  afterEach(() => {
    stopAll();
    vi.useRealTimers();
  });

  it('plays about one chord a second by default', () => {
    expect(progressionStepSeconds()).toBe(1);
    expect(progressionStepSeconds(120)).toBe(0.5);
  });

  it('steps through the chords in order, one per beat, then ends', () => {
    vi.useFakeTimers();
    const steps: number[] = [];
    let ended = 0;
    playProgression([[57, 60, 64], [53, 57, 60], [48, 52, 55]], { onStep: (i) => steps.push(i), onEnd: () => ended++ });
    vi.advanceTimersByTime(0);
    expect(steps).toEqual([0]);
    vi.advanceTimersByTime(1000);
    expect(steps).toEqual([0, 1]);
    vi.advanceTimersByTime(1000);
    expect(steps).toEqual([0, 1, 2]);
    expect(ended).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(ended).toBe(1);
  });

  it('follows the bpm option', () => {
    vi.useFakeTimers();
    const steps: number[] = [];
    playProgression([[60], [62], [64]], { bpm: 120, onStep: (i) => steps.push(i) });
    vi.advanceTimersByTime(1000);
    expect(steps).toEqual([0, 1, 2]);
  });

  it('stops with its handle, with stopAll, or when another progression starts', () => {
    vi.useFakeTimers();
    const run = () => {
      const log = { steps: [] as number[], ended: 0 };
      const handle = playProgression([[60], [62], [64]], { onStep: (i) => log.steps.push(i), onEnd: () => log.ended++ });
      return { log, handle };
    };

    const first = run();
    vi.advanceTimersByTime(500);
    first.handle.stop();
    vi.advanceTimersByTime(5000);
    expect(first.log).toEqual({ steps: [0], ended: 1 });

    const second = run();
    vi.advanceTimersByTime(1500);
    stopAll();
    vi.advanceTimersByTime(5000);
    expect(second.log).toEqual({ steps: [0, 1], ended: 1 });

    const third = run();
    vi.advanceTimersByTime(500);
    const fourth = run();
    expect(third.log.ended).toBe(1);
    third.handle.stop(); // stale handle: leaves the new progression alone
    vi.advanceTimersByTime(5000);
    expect(third.log.steps).toEqual([0]);
    expect(fourth.log).toEqual({ steps: [0, 1, 2], ended: 1 });
  });
});

describe('silentWav', () => {
  it('is a valid 8-bit mono PCM WAV of silence', () => {
    const bytes = silentWav(8000, 400);
    const text = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
    const view = new DataView(bytes.buffer);
    expect(bytes.length).toBe(444);
    expect(text(0, 4)).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(436);
    expect(text(8, 16)).toBe('WAVEfmt ');
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(8000);
    expect(view.getUint16(34, true)).toBe(8);
    expect(text(36, 40)).toBe('data');
    expect(view.getUint32(40, true)).toBe(400);
    expect(bytes.slice(44).every((b) => b === 128)).toBe(true);
  });
});
