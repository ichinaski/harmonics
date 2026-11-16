import { describe, expect, it } from 'vitest';
import { isBlackKey, octaveOf, pianoKeys, pianoRangeFor, whiteKeyCount } from '../src/components/pianoLayout';

describe('pianoKeys', () => {
  it('lays out one octave: 7 white keys then 5 black keys on the gaps', () => {
    const keys = pianoKeys(48, 12);
    expect(keys).toHaveLength(12);
    const whites = keys.filter((k) => !k.black);
    const blacks = keys.filter((k) => k.black);
    expect(whites.map((k) => k.pc)).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(whites.map((k) => k.left)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(blacks.map((k) => k.pc)).toEqual([1, 3, 6, 8, 10]);
    // Each black key straddles the gap after its white neighbour.
    for (const [black, gap] of blacks.map((k, i) => [k, [1, 2, 4, 5, 6][i]!] as const)) {
      expect(black.left).toBeLessThan(gap);
      expect(black.left + black.width).toBeGreaterThan(gap);
    }
    expect(keys.slice(0, 7).every((k) => !k.black)).toBe(true);
  });

  it('spans two octaves from C3 to B4', () => {
    const keys = pianoKeys(48, 24);
    expect(Math.min(...keys.map((k) => k.midi))).toBe(48);
    expect(Math.max(...keys.map((k) => k.midi))).toBe(71);
    expect(whiteKeyCount(48, 24)).toBe(14);
  });

  it('knows black keys and octaves', () => {
    expect([60, 61, 63, 66, 68, 70].map(isBlackKey)).toEqual([false, true, true, true, true, true]);
    expect(octaveOf(60)).toBe(4);
    expect(octaveOf(48)).toBe(3);
    expect(octaveOf(59)).toBe(3);
  });
});

describe('pianoRangeFor', () => {
  it('runs from the C or F below the lowest note to the E or B above the highest', () => {
    expect(pianoRangeFor([48, 52, 55])).toEqual({ start: 48, end: 59 });
    expect(pianoRangeFor([52, 55, 60])).toEqual({ start: 48, end: 64 });
    expect(pianoRangeFor([43, 53, 57, 60])).toEqual({ start: 41, end: 64 });
    expect(pianoRangeFor([53])).toEqual({ start: 53, end: 59 });
  });

  it('defaults to one octave from C3', () => {
    expect(pianoRangeFor([])).toEqual({ start: 48, end: 59 });
  });
});
