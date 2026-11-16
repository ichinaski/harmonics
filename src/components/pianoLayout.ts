// Key geometry for Piano.svelte, in units of one white key width.

import { mod12 } from '../theory';

export interface PianoKey {
  midi: number;
  pc: number;
  black: boolean;
  /** Left edge, in white key widths from the first key. */
  left: number;
  /** Width in white key widths. */
  width: number;
}

const BLACK_PCS = new Set([1, 3, 6, 8, 10]);
const BLACK_WIDTH = 0.62;
/** Black keys sit slightly off the gap between white keys, like a real keyboard. */
const BLACK_NUDGE: Readonly<Record<number, number>> = { 1: -0.08, 3: 0.08, 6: -0.1, 8: 0, 10: 0.1 };

export function isBlackKey(midi: number): boolean {
  return BLACK_PCS.has(mod12(midi));
}

/** Keys from `start` (a white key) for `count` semitones. White keys first, then black keys, so black ones draw on top. */
export function pianoKeys(start: number, count: number): PianoKey[] {
  const whites: PianoKey[] = [];
  const blacks: PianoKey[] = [];
  let whiteIndex = 0;
  for (let midi = start; midi < start + count; midi++) {
    const pc = mod12(midi);
    if (BLACK_PCS.has(pc)) {
      blacks.push({ midi, pc, black: true, left: whiteIndex - BLACK_WIDTH / 2 + BLACK_NUDGE[pc]!, width: BLACK_WIDTH });
    } else {
      whites.push({ midi, pc, black: false, left: whiteIndex, width: 1 });
      whiteIndex++;
    }
  }
  return [...whites, ...blacks];
}

export function whiteKeyCount(start: number, count: number): number {
  let n = 0;
  for (let midi = start; midi < start + count; midi++) if (!isBlackKey(midi)) n++;
  return n;
}

/** 'C4' style octave name of a MIDI note (C4 = 60). */
export function octaveOf(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

/**
 * A keyboard range that fits the notes with a little room: from the C or F at
 * or below the lowest note to the E or B at or above the highest, so a voicing
 * never starts or ends on a cut-off key group.
 */
export function pianoRangeFor(midis: readonly number[]): { start: number; end: number } {
  if (midis.length === 0) return { start: 48, end: 59 };
  let start = Math.min(...midis);
  while (mod12(start) !== 0 && mod12(start) !== 5) start--;
  let end = Math.max(...midis);
  while (mod12(end) !== 4 && mod12(end) !== 11) end++;
  return { start, end };
}
