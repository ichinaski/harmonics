import { describe, expect, it } from 'vitest';
import type { Bar, Row, SheetIssue } from '../src/sheet/model';
import { formatSheetIssue } from '../src/sheet/model';
import { parseSheet } from '../src/sheet/parse';
import { chordName } from '../src/theory';

/**
 * A bar's content in short: 'Cm7 F7', 'C:3 G:1' with beat slashes, '%', '' for empty; chords the chord table
 * doesn't know as '~name', slashes continuing the previous chord as '/', invalid tokens as '!text'.
 */
function content(bar: Bar): string {
  if (bar.content.kind === 'empty') return '';
  if (bar.content.kind === 'repeatPrevious') return '%';
  const withBeats = bar.content.items.some((i) => i.beats > 1);
  return bar.content.items
    .map((i) => {
      const text =
        i.kind === 'chord'
          ? i.chord
            ? chordName(i.chord, 'ascii')
            : `~${i.name}`
          : i.kind === 'noChord'
            ? 'N.C.'
            : i.kind === 'continue'
              ? '/'
              : `!${i.text}`;
      return withBeats ? `${text}:${i.beats}` : text;
    })
    .join(' ');
}

const rows = (text: string): Row[] => parseSheet(text).song.sections.flatMap((s) => s.rows);
const bars = (text: string): string[][] => rows(text).map((r) => r.bars.map(content));
const allBars = (text: string): Bar[] => rows(text).flatMap((r) => r.bars);
const lines = (text: string) => allBars(text).map((b) => [b.start, b.end]);
const issues = (text: string): string[] => parseSheet(text).issues.map(formatSheetIssue);
const issueList = (text: string): SheetIssue[] => parseSheet(text).issues;

const AUTUMN_LEAVES = `Title: Autumn Leaves
Artist: Joseph Kosma

[A]
|: Cm7 | F7 | Bbmaj7 | Ebmaj7 |
| Am7b5 | D7 | 1. Gm | % :|
| 2. Gm | Gm ||

[B]
| Am7b5 | D7 | Gm | % |
| Cm7 F7 | Bbmaj7 | Am7b5 D7 | Gm |
"Solos over AAB, then head out"

[Outro]
C Am F G`;

describe('parseSheet: the example song', () => {
  const { song, issues: found } = parseSheet(AUTUMN_LEAVES);

  it('reads the header, sections and rows with no issues', () => {
    expect(found).toEqual([]);
    expect(song.title).toBe('Autumn Leaves');
    expect(song.artist).toBe('Joseph Kosma');
    expect(song.sections.map((s) => [s.name, s.line, s.rows.length])).toEqual([
      ['A', 4, 3],
      ['B', 9, 2],
      ['Outro', 14, 1],
    ]);
    expect(bars(AUTUMN_LEAVES)).toEqual([
      ['Cm7', 'F7', 'Bbmaj7', 'Ebmaj7'],
      ['Am7b5', 'D7', 'Gm', '%'],
      ['Gm', 'Gm'],
      ['Am7b5', 'D7', 'Gm', '%'],
      ['Cm7 F7', 'Bbmaj7', 'Am7b5 D7', 'Gm'],
      ['C', 'Am', 'F', 'G'],
    ]);
  });

  it('keeps bar lines, the repeat, both endings and the note', () => {
    const [a, b, outro] = song.sections;
    expect(a!.rows[0]!.bars[0]!.start).toBe('repeatStart');
    expect(a!.rows[1]!.bars[3]!.end).toBe('repeatEnd');
    expect(a!.rows[1]!.bars.map((bar) => bar.ending)).toEqual([
      null,
      null,
      { numbers: [1], label: '1.', isStart: true, isEnd: false },
      { numbers: [1], label: '1.', isStart: false, isEnd: true },
    ]);
    expect(a!.rows[2]!.bars.map((bar) => bar.ending)).toEqual([
      { numbers: [2], label: '2.', isStart: true, isEnd: false },
      { numbers: [2], label: '2.', isStart: false, isEnd: true },
    ]);
    expect(a!.rows[2]!.bars[1]!.end).toBe('double');
    expect(b!.rows[1]!.notes).toEqual([{ text: 'Solos over AAB, then head out', fromTextLine: false }]);
    expect(outro!.rows[0]!.bars.map((bar) => bar.end)).toEqual(['single', 'single', 'single', 'final']);
  });

  it('keeps chord spellings as typed', () => {
    const first = song.sections[0]!.rows[0]!.bars[2]!.content;
    expect(first.kind === 'items' && first.items[0]).toMatchObject({ kind: 'chord', text: 'Bbmaj7', span: { line: 5, column: 15, length: 6 } });
    if (first.kind === 'items' && first.items[0]!.kind === 'chord') expect(first.items[0]!.name).toBe('B♭maj7');
  });
});

describe('parseSheet: header and sections', () => {
  it('reads Title and Artist lines at the top, in any case, with blank lines before', () => {
    const { song } = parseSheet('\n  title : So What\nARTIST: Miles Davis\n| Dm7 |');
    expect([song.title, song.artist]).toEqual(['So What', 'Miles Davis']);
  });

  it('has an empty title and artist without header lines', () => {
    expect(parseSheet('| C |').song).toMatchObject({ title: '', artist: '' });
  });

  it('flags header lines below the song', () => {
    expect(issues('| C |\nTitle: Late')).toEqual(['Line 2: header line "Title:" should be at the top']);
    expect(parseSheet('| C |\nTitle: Late').song.title).toBe('');
  });

  it('puts rows before the first section in an unnamed section', () => {
    const { song } = parseSheet('C G\n[Verse]\nAm F');
    expect(song.sections.map((s) => s.name)).toEqual([null, 'Verse']);
    expect(song.sections[0]!.line).toBeNull();
  });

  it('keeps a section with no rows, and warns about an empty name', () => {
    const { song } = parseSheet('[Intro]\n[]\n| C |');
    expect(song.sections.map((s) => [s.name, s.rows.length])).toEqual([
      ['Intro', 0],
      [null, 1],
    ]);
    expect(issueList('[]\n| C |')).toMatchObject([{ severity: 'warning', line: 1, message: 'section has no name' }]);
  });

  it('reads bars after a section name as its first row', () => {
    expect(issues('[A] | C |')).toEqual([]);
    expect(bars('[A] | C |')).toEqual([['C']]);
  });

  it('is empty for empty text', () => {
    expect(parseSheet('')).toEqual({ song: { title: '', artist: '', sections: [] }, issues: [] });
    expect(parseSheet('\n\n  \n').song.sections).toEqual([]);
  });
});

describe('parseSheet: rows and bars', () => {
  it('makes one row per line and marks blank lines as space', () => {
    const r = rows('| C |\n| G |\n\n\n| Am |\n[B]\n\n| F |');
    expect(r.map((row) => [row.line, row.spaceBefore])).toEqual([
      [1, false],
      [2, false],
      [5, true],
      [8, false],
    ]);
  });

  it('reads bars between bar lines, with or without spaces', () => {
    expect(bars('| C | Am | F | G |')).toEqual([['C', 'Am', 'F', 'G']]);
    expect(bars('|C|Am|F|G|')).toEqual([['C', 'Am', 'F', 'G']]);
    expect(bars('C | Am | F')).toEqual([['C', 'Am', 'F']]);
  });

  it('makes each chord a bar on a line with no bar lines', () => {
    expect(bars('C Am F G')).toEqual([['C', 'Am', 'F', 'G']]);
    expect(bars('C % N.C. G')).toEqual([['C', '%', 'N.C.', 'G']]);
  });

  it('splits a bar evenly between several chords', () => {
    const [bar] = allBars('| Cm7 F7 |');
    expect(content(bar!)).toBe('Cm7 F7');
    expect(bar!.content.kind === 'items' && bar!.content.items.map((i) => i.beats)).toEqual([1, 1]);
  });

  it('reads a standalone / as one more beat of the chord before it', () => {
    expect(bars('| C / / G |')).toEqual([['C:3 G:1']]);
    expect(bars('| C/E / Am / |')).toEqual([['C/E:2 Am:2']]);
  });

  it('reads %, N.C., NC and empty bars', () => {
    expect(bars('| C | % | N.C. | NC | n.c. | |')).toEqual([['C', '%', 'N.C.', 'N.C.', 'N.C.', '']]);
    expect(bars('| | |')).toEqual([['', '']]);
    expect(bars('| C N.C. |')).toEqual([['C N.C.']]);
  });

  it('skips lines with bar lines and nothing else', () => {
    expect(rows('|\n||\n| C |')).toHaveLength(1);
  });

  it('keeps source positions of bars and items', () => {
    const [first, second] = allBars('| C  | Dm7 G7 |');
    expect(first!.span).toEqual({ line: 1, column: 3, length: 1 });
    expect(second!.content.kind === 'items' && second!.content.items.map((i) => i.span.column)).toEqual([8, 12]);
  });

  it('reads chords with the app parser, including the chart aliases', () => {
    expect(bars('C^ C^7 Ch7 Co Co7 F#m7b5 C-7 C6/9/E')).toEqual([['Cmaj7', 'Cmaj7', 'Cm7b5', 'Cdim', 'Cdim7', 'F#m7b5', 'Cm7', 'C6/9/E']]);
  });
});

describe('parseSheet: bar lines', () => {
  it('reads single, double, repeat and final bar lines', () => {
    expect(lines('|: C | D || E |. F :| G |')).toEqual([
      ['repeatStart', 'single'],
      ['single', 'double'],
      ['single', 'final'],
      ['single', 'repeatEnd'],
      ['single', 'final'],
    ]);
  });

  it('merges bar lines with nothing between them into one place', () => {
    expect(lines('|: C :| |: D :|')).toEqual([
      ['repeatStart', 'repeatEnd'],
      ['repeatStart', 'repeatEnd'],
    ]);
    expect(lines('| C || |: D :|')).toEqual([
      ['single', 'double'],
      ['repeatStart', 'repeatEnd'],
    ]);
  });

  it('starts a row with a double bar line when written', () => {
    expect(lines('|| C | D |')[0]).toEqual(['double', 'single']);
  });

  it('reads a repeat count after :|', () => {
    expect(allBars('|: C | G :| x3').map((b) => b.repeatTimes)).toEqual([null, 3]);
    expect(allBars('|: C | G :|x4').map((b) => b.repeatTimes)).toEqual([null, 4]);
    expect(allBars('|: C | G :|').map((b) => b.repeatTimes)).toEqual([null, null]);
  });

  it('flags a repeat count that is too small or out of place', () => {
    expect(issues('|: C :| x1')).toEqual(['Line 1: repeat count "x1" should be x2 or more']);
    expect(issues('| C x3 |')).toEqual(['Line 1: "x3" is ignored: a repeat count goes right after ":|"']);
  });

  it('gives the last bar of the song a final bar line, unless it ends a repeat', () => {
    expect(lines('| C | G |')).toEqual([
      ['single', 'single'],
      ['single', 'final'],
    ]);
    expect(lines('| C | G ||').at(-1)).toEqual(['single', 'final']);
    expect(lines('| C | G |.').at(-1)).toEqual(['single', 'final']);
    expect(lines('|: C | G :|').at(-1)).toEqual(['single', 'repeatEnd']);
    expect(lines('| C |\n[B]\nG A\n"fine"').at(-1)).toEqual(['single', 'final']);
  });

  it('flags bar lines on the wrong side of a row', () => {
    expect(issues(':| C |')).toEqual(['Line 1: ":|" should come after a bar']);
    expect(issues('|. C |')).toEqual(['Line 1: "|." should come after a bar']);
    expect(issues('|: C :| |:')).toEqual(['Line 1: "|:" should come before a bar']);
  });

  it('flags a stray colon', () => {
    expect(issues('|: C :|: D |')).toEqual(['Line 1: stray ":" (repeat signs are "|:" and ":|")']);
  });
});

describe('parseSheet: repeats and endings', () => {
  it('flags a repeat that is never closed', () => {
    expect(issueList('|: C | G |')).toMatchObject([{ severity: 'error', line: 1, column: 1, token: '|:', message: 'repeat "|:" is never closed with ":|"' }]);
    expect(issues('|: C | G |\n|: D | A :|')).toEqual(['Line 1: repeat "|:" is never closed with ":|"']);
  });

  it('closes a repeat on a later row or section', () => {
    expect(issues('[A]\n|: C | G |\n[B]\n| D | A :|')).toEqual([]);
  });

  it('warns when :| has no |: before it, and still renders', () => {
    expect(issueList('| C | G :|')).toMatchObject([
      { severity: 'warning', line: 1, column: 9, token: ':|', message: '":|" has no "|:" before it, so it repeats from the start' },
    ]);
    expect(lines('| C | G :|').at(-1)).toEqual(['single', 'repeatEnd']);
  });

  it('accepts endings that close or follow a repeat, including a third ending', () => {
    expect(issues('|: C | 1. G :| 2. F :| 3. Am |')).toEqual([]);
    expect(allBars('|: C | 1. G :| 2. F :| 3. Am |').map((b) => b.ending?.numbers[0] ?? null)).toEqual([null, 1, 2, 3]);
  });

  it('runs an ending bracket to the next non-single bar line, within its row', () => {
    const marks = allBars('|: C | 1. D | E | F :| 2. G | A || B |').map((b) => b.ending);
    expect(marks).toEqual([
      null,
      { numbers: [1], label: '1.', isStart: true, isEnd: false },
      { numbers: [1], label: '1.', isStart: false, isEnd: false },
      { numbers: [1], label: '1.', isStart: false, isEnd: true },
      { numbers: [2], label: '2.', isStart: true, isEnd: false },
      { numbers: [2], label: '2.', isStart: false, isEnd: true },
      null,
    ]);
    expect(allBars('|: C | 1. D :| 2. E | F\n| G |').map((b) => b.ending?.numbers[0] ?? null)).toEqual([null, 1, 2, 2, null]);
  });

  it('reads an ending stuck to its chord, and endings on lines with no bar lines', () => {
    expect(allBars('|: C | 1.G :| 2.F |').map((b) => b.ending?.numbers[0] ?? null)).toEqual([null, 1, 2]);
    expect(bars('|: C | 1.G :| 2.F |')).toEqual([['C', 'G', 'F']]);
    expect(allBars('|: C | D :|\n2. E F').map((b) => b.ending?.isEnd ?? null)).toEqual([null, null, false, true]);
    expect(issues('|: C | D :|\n2. E F')).toEqual([]);
  });

  it('flags an ending outside a repeat', () => {
    expect(issueList('| C | 1. G | F |')).toMatchObject([
      { severity: 'error', line: 1, column: 7, token: '1.', message: 'ending "1." is not in a repeat (end it with ":|", or put it after one)' },
    ]);
    expect(allBars('| C | 1. G | F |')[1]!.ending).toEqual({ numbers: [1], label: '1.', isStart: true, isEnd: false });
  });

  it('flags misplaced or doubled endings', () => {
    expect(issues('|: C 1. G :|')).toEqual(['Line 1: ending "1." should come before the first chord of the bar']);
    expect(bars('|: C 1. G :|')).toEqual([['C !1. G']]);
    expect(issues('|: C | 1. 2. G :|')).toEqual(['Line 1: bar has a second ending "2."']);
    expect(issues('|: C :| 0. G |')).toEqual(['Line 1: ending "0." should be numbered from 1']);
  });
});

describe('parseSheet: time signatures', () => {
  it('reads a time signature at the start of a bar, with no default', () => {
    const [first, second, third] = allBars('| 3/4 C | D | 6/8 E |');
    expect(first!.timeSignature).toEqual({ text: '3/4', upper: 3, lower: 4 });
    expect(second!.timeSignature).toBeNull();
    expect(third!.timeSignature).toEqual({ text: '6/8', upper: 6, lower: 8 });
    expect(allBars('3/4 C D')[0]!.timeSignature?.text).toBe('3/4');
  });

  it('reads it together with an ending, in either order', () => {
    const [, a] = allBars('|: C | 1. 3/4 G :| 3/4 2. F |');
    expect([a!.ending?.numbers, a!.timeSignature?.text]).toEqual([[1], '3/4']);
    expect(issues('|: C | 1. 3/4 G :| 3/4 2. F |')).toEqual([]);
  });

  it('allows a bar with only a time signature', () => {
    expect(bars('| 4/4 | C |')).toEqual([['', 'C']]);
  });

  it('flags misplaced, doubled and unknown time signatures', () => {
    expect(issues('| C 3/4 |')).toEqual(['Line 1: time signature "3/4" should be at the start of the bar']);
    expect(bars('| C 3/4 |')).toEqual([['C !3/4']]);
    expect(issues('| 3/4 4/4 C |')).toEqual(['Line 1: bar has a second time signature "4/4"']);
    expect(issues('| 3/5 C |')).toEqual(['Line 1: unknown time signature "3/5"']);
    expect(issues('C D 3/4')).toEqual(['Line 1: time signature "3/4" has no chord after it']);
  });
});

describe('parseSheet: notes', () => {
  it('attaches a note after bar content to that bar', () => {
    const [c, g] = allBars('| C "rit." | G |');
    expect(c!.notes).toEqual(['rit.']);
    expect(g!.notes).toEqual([]);
    expect(allBars('C "rit." G')[0]!.notes).toEqual(['rit.']);
  });

  it('keeps notes outside the bar lines with the nearest bar', () => {
    const b = allBars('"Intro" | C | G | "x2"');
    expect(b.map((bar) => bar.notes)).toEqual([['Intro'], ['x2']]);
  });

  it('makes an empty bar for a note alone between bar lines', () => {
    expect(allBars('| C | "tacet" |').map((b) => [content(b), b.notes])).toEqual([
      ['C', []],
      ['', ['tacet']],
    ]);
  });

  it('puts a note line under the previous row', () => {
    const r = rows('| C |\n"Slowly"\n"Twice"');
    expect(r).toHaveLength(1);
    expect(r[0]!.notes.map((n) => n.text)).toEqual(['Slowly', 'Twice']);
  });

  it('makes a row of notes only when no row comes before in the section', () => {
    const { song } = parseSheet('| C |\n[B]\n"Drums only"\n| G |');
    expect(song.sections[1]!.rows.map((r) => [r.bars.length, r.notes.map((n) => n.text)])).toEqual([
      [0, ['Drums only']],
      [1, []],
    ]);
  });

  it('flags a stray quote and ends the note at the next bar line, keeping the bars after it', () => {
    expect(issueList('| C | G "rit. |')).toMatchObject([
      { severity: 'error', line: 1, column: 9, token: '"rit.', message: 'note has no closing quote: "rit.' },
    ]);
    expect(allBars('| C | G "rit. |').map((b) => b.notes)).toEqual([[], ['rit.']]);
    expect(bars('| C | "unclosed note | G |')).toEqual([['C', '', 'G']]);
    expect(allBars('| C | "unclosed note | G |').map((b) => b.notes)).toEqual([[], ['unclosed note'], []]);
    expect(allBars('|: C "rit. :| D |').map((b) => [content(b), b.end, b.notes])).toEqual([
      ['C', 'repeatEnd', ['rit.']],
      ['D', 'final', []],
    ]);
    expect(allBars('| C "to the end').map((b) => b.notes)).toEqual([['to the end']]);
  });
});

describe('parseSheet: errors', () => {
  it('flags unknown chords, keeps them as typed and still renders', () => {
    expect(issues('| C |\n| Dm7 |\n\n| Cmaj8 | G |')).toEqual(['Line 4: unknown chord "Cmaj8"']);
    expect(issueList('| Cmaj8 |')).toMatchObject([{ severity: 'error', line: 1, column: 3, token: 'Cmaj8' }]);
    expect(bars('| Cmaj8 | G |')).toEqual([['!Cmaj8', 'G']]);
    expect(bars('C Hm F')).toEqual([['C', '!Hm', 'F']]);
  });

  it('flags slashes at the start of the song, with no chord to continue', () => {
    expect(issueList('| / G | C |')).toMatchObject([{ line: 1, column: 3, token: '/', message: '"/" has no chord before it' }]);
    expect(issues('| N.C. | / / |')).toEqual([]);
  });

  it('flags beat slashes on a line with no bar lines', () => {
    expect(issues('C / G')).toEqual(['Line 1: beat slashes need bar lines around them: "| C / G |"']);
    expect(bars('C / G')).toEqual([['C', '!/', 'G']]);
  });


  it('flags a % among chords and a % with nothing to repeat', () => {
    expect(issues('| C % |')).toEqual(['Line 1: "%" should be alone in its bar']);
    expect(issues('| % | C |')).toEqual(['Line 1: "%" has no bar before it to repeat']);
  });

  it('sorts issues by line and column', () => {
    const found = issueList('| Xx | Yy |\n| Cmaj8 |');
    expect(found.map((i) => [i.line, i.column])).toEqual([
      [1, 3],
      [1, 8],
      [2, 3],
    ]);
  });
});

describe('parseSheet: chord symbols the chord table does not know', () => {
  /** Display names of a one-bar-per-chord line, and its issues. */
  const names = (text: string) => ({
    names: allBars(text).map((b) => (b.content.kind === 'items' && b.content.items[0]!.kind === 'chord' ? b.content.items[0]!.name : '!')),
    issues: issues(text),
  });

  it('accepts the jazz chords testers wrote, with normalised display names', () => {
    expect(
      names('Cmi7 Cma7 C7b9b13 C13b9 C9#11 C13#11 Bb13#11 C7#9b13 C7b9#11 C7#9#5 C7#5#9 C7b9b5 Cmaj9#11 C7sus4b9 A7(#5,#9) C7+ C9+ Em(b5) Am7-5 Aadd2 Bbm9(11)/F'),
    ).toEqual({
      names: [
        'Cm7', 'Cmaj7', 'C7♭9♭13', 'C13♭9', 'C9♯11', 'C13♯11', 'B♭13♯11', 'C7♯9♭13', 'C7♭9♯11', 'C7♯9♯5', 'C7♯5♯9', 'C7♭9♭5', 'Cmaj9♯11',
        'C7sus4♭9', 'A7(♯5,♯9)', 'C7♯5', 'C9♯5', 'Em(♭5)', 'Am7♭5', 'Aadd2', 'B♭m9(11)/F',
      ],
      issues: [],
    });
  });

  it('normalises qualities the way known chords are shown', () => {
    expect(names('C-9b5 Cmin11b13 CMaj9#11 CΔ13 C^9#11 Cdim9 Co11 Caug9 Ch9 Cø11 F#-7b5/E').names).toEqual([
      'Cm9♭5', 'Cm11♭13', 'Cmaj9♯11', 'Cmaj13', 'Cmaj9♯11', 'C°9', 'C°11', 'C+9', 'Cø9', 'Cø11', 'F♯m7♭5/E',
    ]);
    expect(names('CmMaj9 C-Δ9 Cm(maj9)').names).toEqual(['Cm(maj9)', 'Cm(maj9)', 'Cm(maj9)']);
    expect(names('C+7 Cmaj7#5 C-maj7').names).toEqual(['C+7', 'C+maj7', 'Cm(maj7)']);
  });

  it('keeps chords the table knows as table chords, and the spelling of note names', () => {
    const [known, unknown] = allBars('| Cmi7 | Db7b9b13 |').map((b) => (b.content.kind === 'items' ? b.content.items[0] : null));
    expect(known).toMatchObject({ kind: 'chord', name: 'Cm7' });
    expect(known!.kind === 'chord' && known!.chord?.type.id).toBe('m7');
    expect(unknown).toMatchObject({ kind: 'chord', chord: null, name: 'D♭7♭9♭13' });
    expect(names('C#7b9b13 Db7b9b13').names).toEqual(['C♯7♭9♭13', 'D♭7♭9♭13']);
  });

  it('still flags symbols that are not well formed', () => {
    for (const bad of ['Cmaj8', 'Hm7', 'C/X', 'C7b', 'Cm+', 'Cxyz', 'Bob']) {
      expect(issues(`| ${bad} |`), bad).toEqual([`Line 1: unknown chord "${bad}"`]);
    }
  });
});

describe('parseSheet: beat slashes', () => {
  it('reads C/// as C / / /, also on a line with no bar lines', () => {
    expect(bars('| C/// | C// G |')).toEqual([['C:4', 'C:3 G:1']]);
    expect(issues('| C/// | C// G |')).toEqual([]);
    expect(bars('C/// G///')).toEqual([['C:4', 'G:4']]);
    expect(bars('| C/E/ Am |')).toEqual([['C/E:2 Am:1']]);
    expect(bars('| C // G |')).toEqual([['C:3 G:1']]);
  });

  it('continues the previous chord in a bar that starts with slashes', () => {
    expect(bars('| C | / / G / |')).toEqual([['C', '/:2 G:2']]);
    expect(issues('| C | / / G / |')).toEqual([]);
    const [, bar] = allBars('| C | / / |');
    expect(bar!.content).toMatchObject({ kind: 'items', items: [{ kind: 'continue', beats: 2 }] });
  });

  it('still flags a standalone slash on a line with no bar lines', () => {
    expect(issues('C / G')).toEqual(['Line 1: beat slashes need bar lines around them: "| C / G |"']);
  });
});

describe('parseSheet: lyric and text lines', () => {
  const LYRIC_WARNING = 'is shown as a note because it looks like lyrics';

  it('shows a line of mostly non-chords as a note, with one warning', () => {
    const text = '| C | G |\nHey there, this is a lyric line';
    expect(issueList(text)).toMatchObject([{ severity: 'warning', line: 2, column: 1, message: LYRIC_WARNING, wholeLine: true }]);
    expect(issues(text)).toEqual([`Line 2 ${LYRIC_WARNING}`]);
    expect(rows(text)).toHaveLength(1);
    expect(rows(text)[0]!.notes).toEqual([{ text: 'Hey there, this is a lyric line', fromTextLine: true }]);
  });

  it('leaves real chord lines alone, even all-repeated or with a few words that look like chords', () => {
    expect(issues('A E F#m D')).toEqual([]);
    expect(bars('A E F#m D')).toEqual([['A', 'E', 'F#m', 'D']]);
    expect(issues('Am Am Am Am')).toEqual([]);
    expect(bars('Am Am Am Am')).toEqual([['Am', 'Am', 'Am', 'Am']]);
    expect(issues('Dm7 G7 Cmaj7 Xx')).toEqual(['Line 1: unknown chord "Xx"']);
    expect(issues('| hello there my | friend |')).toHaveLength(4);
  });

  it('needs 3 or more words', () => {
    expect(issues('Hello there')).toEqual(['Line 1: unknown chord "Hello"', 'Line 1: unknown chord "there"']);
  });

  it('turns a pasted chords-over-lyrics chart into rows with lyric notes', () => {
    const chart = `[Verse]
        A                E/G#
I heard that you're settled down
        F#m                  D
That you found a girl and you're married now`;
    const { song, issues: found } = parseSheet(chart);
    expect(found.map((i) => [i.line, i.severity])).toEqual([
      [3, 'warning'],
      [5, 'warning'],
    ]);
    expect(song.sections[0]!.rows.map((r) => [r.bars.map(content), r.notes.map((n) => n.text)])).toEqual([
      [['A', 'E/G#'], ['I heard that you’re settled down'.replace('’', "'")]],
      [['F#m', 'D'], ["That you found a girl and you're married now"]],
    ]);
  });

  it('makes a notes-only row for a text line with no row before it', () => {
    const { song } = parseSheet('[Intro]\nDrums and bass only here\n| C |');
    expect(song.sections[0]!.rows.map((r) => [r.bars.length, r.notes.map((n) => n.fromTextLine)])).toEqual([
      [0, [true]],
      [1, []],
    ]);
  });
});

describe('parseSheet: multi-number endings', () => {
  it('reads 1.2. as a list and 1.-3. as a range', () => {
    expect(allBars('|: C | 1.2. E :| 3. F |').map((b) => b.ending && [b.ending.numbers, b.ending.label])).toEqual([null, [[1, 2], '1., 2.'], [[3], '3.']]);
    expect(issues('|: C | 1.2. E :| 3. F |')).toEqual([]);
    expect(allBars('|: C | 1.-3. E :| 4. F |').map((b) => b.ending && [b.ending.numbers, b.ending.label])).toEqual([null, [[1, 2, 3], '1.–3.'], [[4], '4.']]);
    expect(allBars('|: C | 1.2.E :|').map((b) => [content(b), b.ending?.label ?? null])).toEqual([
      ['C', null],
      ['E', '1., 2.'],
    ]);
  });

  it('flags endings out of order', () => {
    expect(issues('|: C | 2.1. E :|')).toEqual(['Line 1: ending "2.1." should list its numbers in order']);
    expect(issues('|: C | 3.-1. E :|')).toEqual(['Line 1: ending "3.-1." should go from a lower number to a higher one']);
  });
});

describe('parseSheet: words are not chords (second tester round, item 8)', () => {
  const sections = (text: string) => parseSheet(text).song.sections.map((s) => [s.name, s.rows.map((r) => r.bars.map(content))]);
  const SECTION_HINT = (name: string) => `is read as the section "${name}"; write [${name}] for a section`;

  it('rejects words as chord symbols', () => {
    for (const word of ['CHORUS', 'Verse', 'Intro:', '(Chorus)', 'Bridge', 'Chorus,']) {
      expect(issues(`| ${word} | C |`), word).toEqual([`Line 1: unknown chord "${word}"`]);
    }
  });

  it('reads section-like lines as sections, with a hint', () => {
    for (const [line, name] of [
      ['CHORUS', 'CHORUS'],
      ['Verse', 'Verse'],
      ['Intro:', 'Intro'],
      ['(Chorus)', 'Chorus'],
      ['Verse 1:', 'Verse 1'],
      ['  Guitar Solo', 'Guitar Solo'],
      ['Pre-Chorus:', 'Pre-Chorus'],
    ] as const) {
      const text = `${line}\n| C | G |`;
      expect(sections(text), line).toEqual([[name, [['C', 'G']]]]);
      expect(issueList(text), line).toMatchObject([{ severity: 'warning', line: 1, token: line.trim(), message: SECTION_HINT(name), wholeLine: true }]);
    }
    expect(issues('Verse 1:\n| C |')).toEqual(['Line 1 is read as the section "Verse 1"; write [Verse 1] for a section']);
  });

  it('reads the chords after a section label as its first row, with their own columns', () => {
    const text = '| D |\nIntro: C G Am F\nIntro: | C | Cmaj8 |';
    expect(sections(text)).toEqual([
      [null, [['D']]],
      ['Intro', [['C', 'G', 'Am', 'F']]],
      ['Intro', [['C', '!Cmaj8']]],
    ]);
    expect(issueList(text)).toMatchObject([
      { line: 2, column: 1, token: 'Intro:', severity: 'warning' },
      { line: 3, column: 1, token: 'Intro:', severity: 'warning' },
      { line: 3, column: 14, token: 'Cmaj8', severity: 'error' },
    ]);
  });

  it('needs a section word, so other labels and chord lines are left alone', () => {
    expect(issues('Key: G')).toEqual(['Line 1: unknown chord "Key:"']);
    expect(issues('Hello there')).toEqual(['Line 1: unknown chord "Hello"', 'Line 1: unknown chord "there"']);
    expect(sections('(Am)')).toEqual([[null, [['!(Am)']]]]);
    for (const line of ['A E F#m D', 'Am Am Am Am', 'C2 Dsus', 'Verse C G']) {
      expect(parseSheet(line).song.sections.map((s) => s.name), line).toEqual([null]);
    }
    expect(issues('A E F#m D\nAm Am Am Am\nC2 Dsus')).toEqual([]);
    expect(bars('C2 Dsus')).toEqual([['Csus2', 'Dsus4']]);
  });

  it('flags dashes between chords once per line', () => {
    expect(issues('C - G - Am - F')).toEqual(['Line 1: "-" isn\'t a bar line; use | between bars (3 times)']);
    expect(issueList('C - G - Am - F')).toMatchObject([{ column: 3, token: '-', count: 3 }]);
  });

  it('ignores a repeat count with no repeat sign, with a warning', () => {
    expect(bars('C G Am F x2')).toEqual([['C', 'G', 'Am', 'F']]);
    expect(issueList('C G Am F x2')).toMatchObject([{ severity: 'warning', column: 10, message: '"x2" is ignored: a repeat count goes right after ":|"' }]);
    expect(bars('| C | G | Am | F | x2')).toEqual([['C', 'G', 'Am', 'F']]);
    expect(issues('| C | G | Am | F | x2')).toEqual(['Line 1: "x2" is ignored: a repeat count goes right after ":|"']);
    expect(bars('| C | x2 | G |')).toEqual([['C', 'G']]);
    expect(allBars('|: C :| x2')[0]!.repeatTimes).toBe(2);
  });

  it('reads lookalike bar lines as bar lines, with one warning per character and line', () => {
    for (const ch of ['¦', '│', '｜']) {
      const text = `${ch} C ${ch} G ${ch} Am ${ch} F ${ch}`;
      expect(bars(text), ch).toEqual([['C', 'G', 'Am', 'F']]);
      expect(issueList(text), ch).toMatchObject([{ severity: 'warning', column: 1, token: ch, message: `"${ch}" is read as the bar line "|"`, count: 1 }]);
    }
    expect(allBars('¦: C :¦')[0]).toMatchObject({ start: 'repeatStart', end: 'repeatEnd' });
    expect(allBars('| C "a¦b" |')[0]!.notes).toEqual(['a¦b']);
  });

  it('flags an unclosed parenthesis in a chord', () => {
    expect(issues('| Bb7(b9 | C |')).toEqual(['Line 1: chord "Bb7(b9" has no closing ")"']);
    expect(issues('| C7(b9, |')).toEqual(['Line 1: chord "C7(b9," has no closing ")"']);
    expect(bars('| Bb7(b9) |')).toEqual([['Bb7b9']]);
  });

  it('suggests % % for the two-bar repeat %%', () => {
    expect(issues('| C | G | %% |')).toEqual(['Line 1: the two-bar repeat "%%" isn\'t supported yet; write % % (a % in each bar)']);
  });

  it('merges identical messages on one line, but not across lines or different tokens', () => {
    expect(issues('/ C / G /')).toEqual(['Line 1: beat slashes need bar lines around them: "| C / G |" (3 times)']);
    expect(issues('| Xx | Xx |\n| Xx |')).toEqual(['Line 1: unknown chord "Xx" (2 times)', 'Line 2: unknown chord "Xx"']);
    expect(issues('| Xx | Yy |')).toEqual(['Line 1: unknown chord "Xx"', 'Line 1: unknown chord "Yy"']);
  });

  it('reads the tester\'s section styles input', () => {
    const text = 'Verse 1:\n| C | G | Am | F |\n(Chorus)\n| F | C | G | G |\nIntro: C G Am F\nCHORUS\n| F | C |';
    expect(sections(text).map(([name]) => name)).toEqual(['Verse 1', 'Chorus', 'Intro', 'CHORUS']);
    expect(issueList(text).every((i) => i.severity === 'warning')).toBe(true);
  });
});
