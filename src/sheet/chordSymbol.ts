// Chord symbols on the Sheet: any well-formed symbol is valid, even when the
// app's chord table (theory/chords.ts) doesn't know it. A symbol is read with
// a small grammar: root, quality, number, alterations and additions (also in
// parentheses, with commas) and a bass. The grammar's normalised spelling is
// looked up in the chord table first, so `Cmi7` is the table's Cm7 and
// `Am7-5` its Am7♭5; symbols the table doesn't have (`C7b9b13`) are shown
// with the same normalising as known ones. Pure TypeScript, no UI imports.

import { chordName, parseChord, type Chord } from '../theory';

export interface ChordSymbol {
  /** The chord, when the chord table knows the symbol; null for symbols it doesn't have (C7♭9♭13). */
  chord: Chord | null;
  /** The display name: 'C7♭9♭13', 'Cm7', 'A7(♯5,♯9)'. */
  name: string;
}

type Quality = 'major' | 'minor' | 'diminished' | 'augmented' | 'halfDiminished';

/** Quality markers after the root, longest first so `maj` wins over `ma` and `M`, `min` over `mi` and `m`. */
const QUALITY_MARKERS: readonly (readonly [string, Quality])[] = [
  ['maj', 'major'],
  ['Maj', 'major'],
  ['MAJ', 'major'],
  ['min', 'minor'],
  ['dim', 'diminished'],
  ['aug', 'augmented'],
  ['ma', 'major'],
  ['mi', 'minor'],
  ['M', 'major'],
  ['Δ', 'major'],
  ['△', 'major'],
  ['^', 'major'],
  ['m', 'minor'],
  ['-', 'minor'],
  ['°', 'diminished'],
  ['o', 'diminished'],
  ['+', 'augmented'],
  ['ø', 'halfDiminished'],
  ['h', 'halfDiminished'],
];

const MAJOR_MARKERS = ['maj', 'Maj', 'MAJ', 'ma', 'M', 'Δ', '△', '^'] as const;

/** How each quality is spelled: `ascii` for the chord table, `display` on the sheet. */
const QUALITY_TEXT: Record<Quality, { ascii: string; display: string }> = {
  major: { ascii: 'maj', display: 'maj' },
  minor: { ascii: 'm', display: 'm' },
  diminished: { ascii: 'dim', display: '°' },
  augmented: { ascii: 'aug', display: '+' },
  halfDiminished: { ascii: 'ø', display: 'ø' },
};

const NUMBERS = ['6/9', '69', '13', '11', '9', '7', '6'] as const;
const SUS = ['sus4', 'sus2', 'sus'] as const;
const ADDITIONS = ['add13', 'add11', 'add9', 'add4', 'add2'] as const;
const ALTERED_DEGREES = ['13', '11', '9', '6', '5'] as const;
/** Plain extensions, only inside parentheses: `Cm9(11)`, `C7(13)`. */
const PAREN_NUMBERS = ['13', '11', '9'] as const;

const ROOT_RE = /^[A-G](?:#|♯|b|♭)?/u;
const BASS_RE = /^\/([A-G](?:#|♯|b|♭)?)$/u;

/** One piece after the number, spelled for the table (`ascii`) and the sheet (`display`). */
interface Piece {
  ascii: string;
  display: string;
}

function accidentals(text: string): string {
  return text.replace(/b/g, '♭').replace(/#/g, '♯');
}

class Reader {
  pos = 0;

  constructor(readonly text: string) {}

  /** Takes the first of `options` that comes next, or returns null. */
  take<T extends string>(options: readonly T[]): T | null {
    for (const option of options) {
      if (this.text.startsWith(option, this.pos)) {
        this.pos += option.length;
        return option;
      }
    }
    return null;
  }

  peek(): string {
    return this.text[this.pos] ?? '';
  }

  get done(): boolean {
    return this.pos >= this.text.length;
  }
}

/** An alteration (`b9`, `#11`, `-5`, `+5`), an addition (`add9`), `alt` or a sus. Null if none comes next. */
function readAlteration(reader: Reader): Piece | null {
  const start = reader.pos;
  const accidental = reader.take(['b', '♭', '#', '♯', '-', '+']);
  if (accidental) {
    const degree = reader.take(ALTERED_DEGREES);
    if (degree) {
      const ascii = accidental === '-' || accidental === '♭' ? 'b' : accidental === '+' || accidental === '♯' ? '#' : accidental;
      return { ascii: ascii + degree, display: accidentals(ascii) + degree };
    }
    reader.pos = start;
    return null;
  }
  const word = reader.take([...ADDITIONS, 'alt', ...SUS]);
  return word ? { ascii: word, display: word } : null;
}

/** `(b9)`, `(#5,#9)`, `(add9)`, `(11)`, `(maj7)`. */
function readParentheses(reader: Reader): Piece | null {
  const start = reader.pos;
  if (!reader.take(['('])) return null;
  const inner: Piece[] = [];
  while (true) {
    const major = reader.take(MAJOR_MARKERS);
    const piece: Piece | null = major
      ? (() => {
          const number = reader.take(['13', '11', '9', '7']);
          return number ? { ascii: `maj${number}`, display: `maj${number}` } : null;
        })()
      : (readAlteration(reader) ?? (() => {
          const number = reader.take(PAREN_NUMBERS);
          return number ? { ascii: number, display: number } : null;
        })());
    if (!piece) break;
    inner.push(piece);
    if (reader.take([','])) continue;
    if (reader.peek() === ')') break;
  }
  if (inner.length === 0 || !reader.take([')'])) {
    reader.pos = start;
    return null;
  }
  return {
    ascii: `(${inner.map((p) => p.ascii).join(',')})`,
    display: `(${inner.map((p) => p.display).join(',')})`,
  };
}

/**
 * Reads a chord symbol with the Sheet's grammar. Returns null when the text
 * isn't a well-formed chord symbol (`Cmaj8`, `Hm`, `hello`, `Bb7(b9`).
 */
export function readChordSymbol(text: string): ChordSymbol | null {
  // The chord table forgives a missing `)` (`Bb7(b9`); the sheet doesn't.
  if (text.split('(').length !== text.split(')').length) return null;
  const known = parseChord(text);
  if (known.ok) return { chord: known.chord, name: chordName(known.chord) };

  const rootMatch = ROOT_RE.exec(text);
  if (!rootMatch) return null;
  const reader = new Reader(text);
  reader.pos = rootMatch[0].length;
  const root = rootMatch[0];

  // Quality, then a major 7th marker after a minor one (CmMaj7, C-Δ9).
  let quality: Quality | null = null;
  for (const [marker, q] of QUALITY_MARKERS) {
    if (reader.take([marker])) {
      quality = q;
      break;
    }
  }
  const minorMajor = quality === 'minor' && reader.take(MAJOR_MARKERS) !== null;
  const number = reader.take(NUMBERS);
  if (minorMajor && !number) return null;
  // `C7+`, `C9+`: a raised 5th.
  const raisedFifth = number !== null && reader.peek() === '+' && !/\d/.test(reader.text[reader.pos + 1] ?? '');
  if (raisedFifth) reader.pos++;

  const pieces: Piece[] = [];
  if (raisedFifth) pieces.push({ ascii: '#5', display: '♯5' });
  while (true) {
    const piece = readParentheses(reader) ?? readAlteration(reader);
    if (!piece) break;
    pieces.push(piece);
  }

  let bass = '';
  if (!reader.done) {
    const bassMatch = BASS_RE.exec(text.slice(reader.pos));
    if (!bassMatch) return null;
    bass = bassMatch[1]!;
  }
  // A bare root with only a bass is a plain slash chord the table already reads.
  if (quality === null && number === null && pieces.length === 0) return null;

  const qualityText = quality ? QUALITY_TEXT[quality] : { ascii: '', display: '' };
  const numberText = number === '69' ? '6/9' : (number ?? '');
  const ascii =
    root +
    (minorMajor ? `m(maj${numberText})` : qualityText.ascii + numberText) +
    pieces.map((p) => p.ascii).join('') +
    (bass ? `/${bass}` : '');
  const table = parseChord(ascii);
  if (table.ok) return { chord: table.chord, name: chordName(table.chord) };

  const name =
    accidentals(root) +
    (minorMajor ? `m(maj${numberText})` : qualityText.display + numberText) +
    pieces.map((p) => p.display).join('') +
    (bass ? `/${accidentals(bass)}` : '');
  return { chord: null, name };
}
