import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_SETS, sampleNotes } from '../src/audio/sampleSets';
import { sampleUrls } from '../src/audio/sampler';
import type { InstrumentBackend } from '../src/audio/engine';

describe('sample sets', () => {
  it('keeps one sample every minor third, C2..C6', () => {
    const notes = sampleNotes(SAMPLE_SETS.piano);
    expect(notes).toHaveLength(17);
    expect(notes.slice(0, 5)).toEqual(['C2', 'Eb2', 'Gb2', 'A2', 'C3']);
    expect(notes[notes.length - 1]).toBe('C6');
  });

  it('puts the bass an octave lower, C1..C5', () => {
    const notes = sampleNotes(SAMPLE_SETS.bass);
    expect(notes[0]).toBe('C1');
    expect(notes[notes.length - 1]).toBe('C5');
    expect(notes).toHaveLength(17);
  });

  it('has one folder per sampled instrument', () => {
    expect(Object.keys(SAMPLE_SETS)).toEqual(['piano', 'electricGuitar', 'acousticGuitar', 'bass']);
    const folders = Object.values(SAMPLE_SETS).map((s) => s.folder);
    expect(new Set(folders).size).toBe(folders.length);
  });
});

describe('sampleUrls', () => {
  it('builds URLs from the base, never from /samples', () => {
    const urls = sampleUrls('electricGuitar', '/harmonics/');
    expect(urls.Eb3).toBe('/harmonics/samples/electric-guitar/Eb3.mp3');
    expect(Object.keys(urls)).toEqual(sampleNotes(SAMPLE_SETS.electricGuitar));
    expect(sampleUrls('bass', '/').C1).toBe('/samples/bass/C1.mp3');
  });
});

// The engine with a fake Web Audio environment and a controllable sampler load.
describe('engine instrument loading', () => {
  const loads: { id: string; resolve: (b: InstrumentBackend) => void; reject: (e: Error) => void }[] = [];

  class FakeParam {
    value = 0;
    setValueAtTime() {}
    linearRampToValueAtTime() {}
    setTargetAtTime() {}
    cancelScheduledValues() {}
  }
  class FakeNode {
    gain = new FakeParam();
    frequency = new FakeParam();
    threshold = new FakeParam();
    knee = new FakeParam();
    ratio = new FakeParam();
    attack = new FakeParam();
    release = new FakeParam();
    type = '';
    onended: (() => void) | null = null;
    connect<T>(node: T): T {
      return node;
    }
    disconnect() {}
    start() {}
    stop() {}
  }
  class FakeAudioContext {
    state = 'running';
    currentTime = 0;
    destination = new FakeNode();
    createGain = () => new FakeNode();
    createOscillator = () => new FakeNode();
    createDynamicsCompressor = () => new FakeNode();
    addEventListener() {}
    resume = () => Promise.resolve();
  }

  beforeEach(() => {
    vi.resetModules();
    loads.length = 0;
    vi.stubGlobal('window', {});
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('document', { addEventListener() {}, visibilityState: 'visible' });
    vi.stubGlobal('navigator', { audioSession: { type: '' } });
    vi.doMock('../src/audio/sampler', () => ({
      loadSampledInstrument: (_context: unknown, _destination: unknown, id: string) =>
        new Promise<InstrumentBackend>((resolve, reject) => loads.push({ id, resolve, reject })),
    }));
  });

  afterEach(() => {
    vi.doUnmock('../src/audio/sampler');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const fakeBackend = () => ({ start: vi.fn(), stopAll: vi.fn() });
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('loads a sampled instrument on unlock, plays the synth meanwhile, then the samples (bass an octave down)', async () => {
    const engine = await import('../src/audio/engine');
    const statuses: string[] = [];
    engine.onInstrumentStatus((id, status) => statuses.push(`${id}:${status}`));
    engine.setInstrument('bass');
    expect(engine.instrumentStatus('bass')).toBe('idle');
    engine.unlockAudio();
    expect(loads.map((l) => l.id)).toEqual(['bass']);
    expect(engine.instrumentStatus('bass')).toBe('loading');
    expect(engine.playChord([48, 52, 55])).toHaveLength(3); // the synth plays

    const bass = fakeBackend();
    loads[0]!.resolve(bass);
    await flush();
    expect(statuses).toEqual(['bass:loading', 'bass:ready']);
    engine.playChord([48, 52, 55]);
    expect(bass.start.mock.calls.map(([n]) => n.midi)).toEqual([36, 40, 43]);
    engine.stopAll();
    expect(bass.stopAll).toHaveBeenCalled();
    // Loaded once.
    engine.setInstrument('synth');
    engine.setInstrument('bass');
    expect(loads).toHaveLength(1);
  });

  it('guitars strum through the samples', async () => {
    const engine = await import('../src/audio/engine');
    engine.unlockAudio();
    engine.setInstrument('acousticGuitar');
    const guitar = fakeBackend();
    loads[0]!.resolve(guitar);
    await flush();
    engine.playChord([48, 52, 55]);
    const times = guitar.start.mock.calls.map(([n]) => n.time);
    expect(times[1]! - times[0]!).toBeCloseTo(0.015);
  });

  it('falls back to the synth when loading fails, and retries when selected again', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const engine = await import('../src/audio/engine');
    engine.unlockAudio();
    engine.setInstrument('piano');
    loads[0]!.reject(new Error('404'));
    await flush();
    expect(engine.instrumentStatus('piano')).toBe('failed');
    expect(warn).toHaveBeenCalled();
    expect(engine.playNote(60)).toHaveLength(1); // still plays, on the synth
    engine.setInstrument('synth');
    engine.setInstrument('piano');
    expect(loads).toHaveLength(2);
    expect(engine.instrumentStatus('piano')).toBe('loading');
  });

  it('doesn’t download anything for the synth or before audio is unlocked', async () => {
    const engine = await import('../src/audio/engine');
    engine.setInstrument('piano');
    expect(loads).toHaveLength(0);
    engine.setInstrument('synth');
    engine.unlockAudio();
    expect(loads).toHaveLength(0);
    expect(engine.instrumentStatus('synth')).toBe('ready');
  });
});
