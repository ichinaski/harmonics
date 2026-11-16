import { describe, expect, it } from 'vitest';
import {
  CHROMATIC_DEGREE_NAMES,
  intervalBetween,
  intervalDegree,
  intervalSemitones,
  intervalSteps,
  parseInterval,
  transpose,
} from '../src/theory/intervals';
import { formatNote, note, parseNote } from '../src/theory/notes';

const up = (root: string, interval: string) => formatNote(transpose(parseNote(root)!, interval), 'ascii');

describe('parseInterval', () => {
  it.each([
    ['1', 0, 0, 1],
    ['b2', 1, 1, 2],
    ['2', 2, 1, 2],
    ['b3', 3, 2, 3],
    ['3', 4, 2, 3],
    ['4', 5, 3, 4],
    ['#4', 6, 3, 4],
    ['b5', 6, 4, 5],
    ['5', 7, 4, 5],
    ['#5', 8, 4, 5],
    ['b6', 8, 5, 6],
    ['6', 9, 5, 6],
    ['bb7', 9, 6, 7],
    ['b7', 10, 6, 7],
    ['7', 11, 6, 7],
    ['b9', 13, 8, 9],
    ['9', 14, 8, 9],
    ['#9', 15, 8, 9],
    ['11', 17, 10, 11],
    ['#11', 18, 10, 11],
    ['b13', 20, 12, 13],
    ['13', 21, 12, 13],
  ])('%s is %i semitones, %i letter steps, degree %i', (name, semitones, steps, degree) => {
    expect(intervalSemitones(name)).toBe(semitones);
    expect(intervalSteps(name)).toBe(steps);
    expect(intervalDegree(name)).toBe(degree);
  });

  it.each(['', '0', '16', 'b', '3b', 'x3', 'bbb3'])('rejects %j', (name) => {
    expect(parseInterval(name)).toBeNull();
  });

  it('throws from the strict helpers on unknown names', () => {
    expect(() => intervalSemitones('x')).toThrow();
  });
});

describe('transpose', () => {
  it('spells chord tones from the root by letter', () => {
    expect(up('Db', '3')).toBe('F');
    expect(up('C#', '3')).toBe('E#');
    expect(up('C', 'b3')).toBe('Eb');
    expect(up('C', '#4')).toBe('F#');
    expect(up('C', 'b5')).toBe('Gb');
    expect(up('C', 'bb7')).toBe('Bbb');
    expect(up('F#', 'b7')).toBe('E');
    expect(up('G#', '#5')).toBe('D##');
    expect(up('Gb', 'b2')).toBe('Abb');
    expect(up('B', '9')).toBe('C#');
    expect(up('Eb', '13')).toBe('C');
    expect(up('A', 'b9')).toBe('Bb');
  });
});

describe('intervalBetween', () => {
  const between = (a: string, b: string) => intervalBetween(parseNote(a)!, parseNote(b)!);

  it('names the simple interval by letter distance', () => {
    expect(between('C', 'C')).toBe('1');
    expect(between('C', 'Eb')).toBe('b3');
    expect(between('C', 'D#')).toBe('#2');
    expect(between('C', 'F#')).toBe('#4');
    expect(between('C', 'Gb')).toBe('b5');
    expect(between('C', 'Bbb')).toBe('bb7');
    expect(between('A', 'C')).toBe('b3');
    expect(between('G', 'F')).toBe('b7');
    expect(between('B', 'A#')).toBe('7');
    expect(between('C#', 'E#')).toBe('3');
  });

  it('inverts transpose for every chromatic degree name', () => {
    for (const root of [note('C'), note('E', -1), note('F', 1)]) {
      for (const name of CHROMATIC_DEGREE_NAMES) {
        expect(intervalBetween(root, transpose(root, name))).toBe(name);
      }
    }
  });
});
