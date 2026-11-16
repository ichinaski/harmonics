// Public API of the theory engine. Pure TypeScript, no UI imports.

export {
  EMPTY_PC_SET,
  LETTERS,
  LETTER_PITCH_CLASS,
  defaultSpelling,
  enharmonicSpellings,
  formatAccidental,
  formatNote,
  isEnharmonic,
  letterIndex,
  mod12,
  naturalLetter,
  note,
  noteEquals,
  parseNote,
  pcSetAdd,
  pcSetDifference,
  pcSetHas,
  pcSetIsSubset,
  pcSetOfNotes,
  pcSetRemove,
  pcSetSize,
  pcSetToArray,
  pcSetTranspose,
  pitchClass,
  respell,
  simplifyNote,
  spellPitchClass,
  toMidi,
  toPcSet,
} from './notes';
export type { AccidentalStyle, Letter, Note, PitchClass, PitchClassSet } from './notes';

export {
  CHROMATIC_DEGREE_NAMES,
  intervalBetween,
  intervalDegree,
  intervalSemitones,
  intervalSteps,
  parseInterval,
  transpose,
} from './intervals';
export type { Interval, IntervalName } from './intervals';

export {
  CHORD_TYPES,
  QUALITY_FAMILIES,
  chordName,
  chordNotes,
  chordPcSet,
  chordRootSpelling,
  chordSeventh,
  chordStructurePcSet,
  chordThird,
  chordTones,
  chordTypePcSet,
  chordTypeSymbol,
  chordTypesForTiers,
  getChordType,
  hasNonChordBass,
  makeChord,
  parseChord,
  parseChordQuality,
  parseProgression,
  readableNote,
  spellBassFromRoot,
} from './chords';
export type {
  Chord,
  ChordParseResult,
  ChordTier,
  ChordToken,
  ChordTone,
  ChordType,
  ProgressionParseResult,
  QualityFamily,
} from './chords';

export {
  MODE_IDS,
  SCALE_TYPES,
  getScaleType,
  isMode,
  isTheoreticalKey,
  keyName,
  keyNameWithEnharmonic,
  keyPcSet,
  keyScale,
  keySignature,
  keyTonicSpelling,
  makeKey,
  modeLabel,
  scalePcSet,
  spellInKey,
  spellScale,
  spellScaleFromPc,
} from './scales';
export type { Key, ModeId, ScaleId, ScaleType, TonicTriad } from './scales';

export {
  CHORD_SCORE_WEIGHTS,
  MIN_MATCH_NOTES,
  chordAlternates,
  chordFitsKey,
  chordsForRootAndFamily,
  findChords,
  spellChordBass,
  spellChordRoot,
} from './chordFinder';
export type { ChordFinderOptions, ChordMatch, MatchGroup, MatchMode, MatchNote, MatchNoteState } from './chordFinder';

export { KEY_SCORE_WEIGHTS, analyseInKey, bassChordReading, diatonicFit, findKeys, romanNumeral } from './keyFinder';
export type { ChordFunctionKind, ChordInKey, KeyFinderOptions, KeyResult } from './keyFinder';

export {
  CHARACTERISTIC_DEGREES,
  DEFAULT_BORROW_SOURCES,
  HARMONIC_FUNCTIONS,
  chordFunction,
  diatonicChords,
} from './diatonic';
export type {
  BorrowSource,
  BorrowedChord,
  DegreeChord,
  DiatonicChords,
  DiatonicDegree,
  HarmonicFunction,
  SecondaryDominant,
} from './diatonic';

export { SCALE_POPULARITY, findScaleGroups, findScales, scaleMatchKey, scaleName } from './scaleFinder';
export type { ScaleFinderOptions, ScaleGroup, ScaleMatch } from './scaleFinder';

export { chordNoteDetails, chordVoicing, chordVoicingMidi, intervalLabel, inversionName } from './voicings';
export type { ChordNoteDetail, ChordNoteDetails, InversionName, VoicingNote } from './voicings';
