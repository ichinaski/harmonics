// Polyphonic Web Audio synth: per voice a triangle at the note's frequency and
// a quieter sine an octave up, through an ADSR gain envelope. No downloads, so
// it is the default instrument and the fallback while samples load.

import type { InstrumentBackend, ScheduledNote } from './engine';

export interface Envelope {
  /** Seconds from 0 to peak. */
  attack: number;
  /** Time constant scale: seconds to fall most of the way from peak to sustain. */
  decay: number;
  /** Sustain level as a fraction of the peak, 0..1. */
  sustain: number;
  /** Seconds to fade out after the note's duration ends. */
  release: number;
}

export const SYNTH_ENVELOPE: Envelope = { attack: 0.006, decay: 0.35, sustain: 0.3, release: 0.4 };

/** Peak gain of one voice at velocity 1; the master limiter catches dense chords. */
const VOICE_PEAK = 0.22;
const SINE_LEVEL = 0.3;
const MAX_VOICES = 32;
/** Release time used when a voice is cut short (voice stealing, stopAll). */
const FAST_RELEASE = 0.03;

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** One gain automation step, in AudioParam terms. */
export type EnvelopeStep =
  | { kind: 'set'; time: number; value: number }
  | { kind: 'linear'; time: number; value: number }
  | { kind: 'target'; time: number; value: number; timeConstant: number };

export interface EnvelopePlan {
  steps: EnvelopeStep[];
  /** When the oscillators can stop: the release has faded below about 1%. */
  stopTime: number;
}

/**
 * Gain automation for a note starting at `start` and released after `duration`
 * seconds. Exponential segments use setTargetAtTime, so a release that starts
 * during the decay continues smoothly from the current level.
 */
export function envelopePlan(start: number, duration: number, peak: number, env: Envelope = SYNTH_ENVELOPE): EnvelopePlan {
  const releaseAt = start + Math.max(duration, env.attack);
  return {
    steps: [
      { kind: 'set', time: start, value: 0 },
      { kind: 'linear', time: start + env.attack, value: peak },
      { kind: 'target', time: start + env.attack, value: peak * env.sustain, timeConstant: env.decay / 3 },
      { kind: 'target', time: releaseAt, value: 0, timeConstant: env.release / 5 },
    ],
    stopTime: releaseAt + env.release,
  };
}

function applyEnvelope(param: AudioParam, plan: EnvelopePlan): void {
  for (const step of plan.steps) {
    if (step.kind === 'set') param.setValueAtTime(step.value, step.time);
    else if (step.kind === 'linear') param.linearRampToValueAtTime(step.value, step.time);
    else param.setTargetAtTime(step.value, step.time, step.timeConstant);
  }
}

interface Voice {
  gain: GainNode;
  oscillators: OscillatorNode[];
  stopTime: number;
}

export function createSynth(context: BaseAudioContext, destination: AudioNode): InstrumentBackend {
  const voices: Voice[] = [];

  function release(voice: Voice, time: number): void {
    voice.gain.gain.cancelScheduledValues(time);
    voice.gain.gain.setTargetAtTime(0, time, FAST_RELEASE / 3);
    const stopAt = time + FAST_RELEASE * 2;
    if (stopAt < voice.stopTime) {
      voice.stopTime = stopAt;
      for (const osc of voice.oscillators) osc.stop(stopAt);
    }
  }

  function start({ midi, time, duration, velocity }: ScheduledNote): void {
    if (voices.length >= MAX_VOICES) release(voices.shift()!, Math.max(time, context.currentTime));

    const frequency = midiToFrequency(midi);
    const gain = context.createGain();
    const plan = envelopePlan(time, duration, VOICE_PEAK * velocity);
    applyEnvelope(gain.gain, plan);
    gain.connect(destination);

    const triangle = context.createOscillator();
    triangle.type = 'triangle';
    triangle.frequency.value = frequency;
    triangle.connect(gain);

    const sine = context.createOscillator();
    sine.type = 'sine';
    sine.frequency.value = frequency * 2;
    const sineGain = context.createGain();
    sineGain.gain.value = SINE_LEVEL;
    sine.connect(sineGain).connect(gain);

    const voice: Voice = { gain, oscillators: [triangle, sine], stopTime: plan.stopTime };
    for (const osc of voice.oscillators) {
      osc.start(time);
      osc.stop(plan.stopTime);
    }
    triangle.onended = () => {
      gain.disconnect();
      const i = voices.indexOf(voice);
      if (i >= 0) voices.splice(i, 1);
    };
    voices.push(voice);
  }

  function stopAll(): void {
    const now = context.currentTime;
    for (const voice of voices) release(voice, now);
  }

  return { start, stopAll };
}
