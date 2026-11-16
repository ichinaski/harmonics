import { describe, expect, it } from 'vitest';
import { SYNTH_ENVELOPE, envelopePlan, midiToFrequency } from '../src/audio/synth';

describe('midiToFrequency', () => {
  it('uses A4 = 440 Hz', () => {
    expect(midiToFrequency(69)).toBe(440);
    expect(midiToFrequency(81)).toBe(880);
    expect(midiToFrequency(60)).toBeCloseTo(261.626, 3);
  });
});

describe('envelopePlan', () => {
  const env = { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.4 };

  it('ramps from silence to the peak, decays to sustain, then releases after the duration', () => {
    const plan = envelopePlan(2, 1, 0.2, env);
    expect(plan.steps).toEqual([
      { kind: 'set', time: 2, value: 0 },
      { kind: 'linear', time: expect.closeTo(2.01), value: 0.2 },
      { kind: 'target', time: expect.closeTo(2.01), value: 0.1, timeConstant: expect.closeTo(0.1) },
      { kind: 'target', time: 3, value: 0, timeConstant: expect.closeTo(0.08) },
    ]);
    expect(plan.stopTime).toBeCloseTo(3.4);
  });

  it('never releases before the attack has finished', () => {
    const plan = envelopePlan(0, 0.001, 1, env);
    expect(plan.steps[3]!.time).toBe(env.attack);
    expect(plan.stopTime).toBeCloseTo(env.attack + env.release);
  });

  it('has a sensible default envelope', () => {
    expect(SYNTH_ENVELOPE.attack).toBeLessThan(0.02);
    expect(SYNTH_ENVELOPE.sustain).toBeGreaterThan(0);
    expect(SYNTH_ENVELOPE.sustain).toBeLessThan(1);
  });
});
