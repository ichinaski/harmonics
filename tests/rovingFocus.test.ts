import { describe, expect, it } from 'vitest';
import { rovingTarget } from '../src/components/rovingFocus';

describe('rovingTarget', () => {
  it('moves with the arrow keys and jumps with Home and End', () => {
    expect(rovingTarget('ArrowRight', 3, 12)).toBe(4);
    expect(rovingTarget('ArrowUp', 3, 12)).toBe(4);
    expect(rovingTarget('ArrowLeft', 3, 12)).toBe(2);
    expect(rovingTarget('ArrowDown', 3, 12)).toBe(2);
    expect(rovingTarget('Home', 3, 12)).toBe(0);
    expect(rovingTarget('End', 3, 12)).toBe(11);
  });

  it('can go past the ends (the piano shifts an octave there)', () => {
    expect(rovingTarget('ArrowLeft', 0, 12)).toBe(-1);
    expect(rovingTarget('ArrowRight', 11, 12)).toBe(12);
  });

  it('ignores other keys, so Enter and Space still press the button', () => {
    expect(rovingTarget('Enter', 3, 12)).toBeNull();
    expect(rovingTarget(' ', 3, 12)).toBeNull();
    expect(rovingTarget('Tab', 3, 12)).toBeNull();
  });
});
