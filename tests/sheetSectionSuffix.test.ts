import { describe, expect, it } from 'vitest';
import { parseSheet } from '../src/sheet/parse';

const parse = (body: string) => parseSheet(body);

describe('section lines with text after the name', () => {
  it('keeps a repeat note as part of the label', () => {
    const song = parse('[Verse 1] (x2)\n| C | G |').song;
    expect(song.sections.map((s) => s.name)).toEqual(['Verse 1 (x2)']);
    expect(song.sections[0]!.rows[0]!.bars).toHaveLength(2);
  });

  it('accepts xN and quoted text after the name', () => {
    expect(parse('[Solo] x4\n| C |').song.sections[0]!.name).toBe('Solo x4');
    expect(parse('[Coda] "fade"\n| C |').song.sections[0]!.name).toBe('Coda fade');
  });

  it('reads chords after the name as the first row, with columns kept', () => {
    const result = parse('[Intro] C G Cmaj8 F');
    const section = result.song.sections[0]!;
    expect(section.name).toBe('Intro');
    expect(section.rows[0]!.bars).toHaveLength(4);
    const issue = result.issues.find((i) => i.token === 'Cmaj8');
    expect(issue?.column).toBe('[Intro] C G '.length + 1);
  });
});
