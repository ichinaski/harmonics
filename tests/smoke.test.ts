import { describe, expect, it } from 'vitest';
import * as theory from '../src/theory';

describe('theory index', () => {
  it('exposes the core API', () => {
    expect(theory.formatNote(theory.note('B', -1))).toBe('B♭');
    expect(theory.CHORD_TYPES.length).toBeGreaterThan(0);
    expect(theory.SCALE_TYPES.length).toBe(12);
  });
});
