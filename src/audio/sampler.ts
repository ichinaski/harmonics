// Sampled instruments (piano, guitars, bass) with smplr's Sampler and a
// note → URL map of the self-hosted FluidR3_GM mp3s (see docs/decisions.md).
// smplr is imported lazily, so it is a separate chunk that only downloads with
// the first sampled instrument. The mp3s are fetched and decoded here rather
// than by smplr, so a missing or broken file rejects the load (smplr only
// logs a warning) and the engine can fall back to the synth.

import type { InstrumentBackend, ScheduledNote } from './engine';
import { SAMPLE_SETS, sampleNotes, type SampledInstrumentId } from './sampleSets';

/**
 * Output gain per instrument, so a chord is about as loud as on the synth.
 * smplr's Sampler adds no gain of its own (Soundfont adds 5x) and the FluidR3
 * sets differ in level. Measured as the RMS over the first second of C3 E3 G3
 * C4 at velocity 0.8, rendered offline, relative to the synth.
 */
export const SAMPLER_GAIN: Readonly<Record<SampledInstrumentId, number>> = {
  piano: 6.4,
  electricGuitar: 4.2,
  acousticGuitar: 5.2,
  bass: 4.1,
};

/** Note name → sample URL, built from BASE_URL so it works under /harmonics/ on GitHub Pages and at / locally. */
export function sampleUrls(id: SampledInstrumentId, base: string = import.meta.env.BASE_URL): Record<string, string> {
  const set = SAMPLE_SETS[id];
  return Object.fromEntries(sampleNotes(set).map((note) => [note, `${base}samples/${set.folder}/${note}.mp3`]));
}

async function loadBuffer(context: BaseAudioContext, url: string): Promise<AudioBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return context.decodeAudioData(await response.arrayBuffer());
}

/** Loads one sampled instrument into `destination`. Rejects if smplr or any sample fails to load. */
export async function loadSampledInstrument(
  context: AudioContext,
  destination: AudioNode,
  id: SampledInstrumentId,
): Promise<InstrumentBackend> {
  const urls = sampleUrls(id);
  const [{ Sampler }, buffers] = await Promise.all([
    import('smplr'),
    Promise.all(Object.entries(urls).map(async ([note, url]) => [note, await loadBuffer(context, url)] as const)),
  ]);

  const output = context.createGain();
  output.gain.value = SAMPLER_GAIN[id];
  output.connect(destination);
  const sampler = Sampler(context, {
    buffers: Object.fromEntries(buffers),
    destination: output,
    // smplr 1.2.0 copies these into the preset defaults even when undefined,
    // which gives a NaN detune on the first note; pass smplr's own defaults.
    detune: 0,
    decayTime: 0.3,
    lpfCutoffHz: 20000,
  });
  await sampler.ready;

  return {
    start: ({ midi, time, duration, velocity }: ScheduledNote) =>
      void sampler.start({ note: midi, time, duration, velocity: Math.round(velocity * 127) }),
    stopAll: () => void sampler.stop(),
  };
}
