// Shared in-memory state: cross-tab links ("Open in Harmonize" sets a key
// here and switches tab) and each tool's inputs, so they survive switching
// tabs. Nothing is put in the URL or in storage.
// Values are stored raw (not deep proxies) so chord type objects keep their
// identity; views replace them whole when their inputs change.

import type { Chord, Key, MatchMode, ModeId, QualityFamily } from '../theory';

export interface ChordFinderSession {
  /** Selected MIDI notes, ascending. */
  notes: number[];
  bass: number | null;
  matchMode: MatchMode;
  extended: boolean;
  root: number | null;
  family: QualityFamily | null;
  keyTonic: number | null;
  keyMode: ModeId;
}

export interface KeyFinderSession {
  progression: Chord[];
  modes: boolean;
  /** Key results whose Details were opened or closed, by key name; reset when the progression changes. */
  details: Record<string, boolean>;
}

export interface ScaleFinderSession {
  notes: number[];
  tonic: number | null;
}

/** The two sides of the Chords tab: Find chord (#/chords) and Chord notes (#/chords/notes). */
export type ChordsSide = 'find' | 'notes';

/** What the Sheet tab shows on narrow screens, where the editor and the preview don't fit side by side. */
export type SheetPane = 'edit' | 'preview';

/** The Sheet preview's zoom: the page scaled to the pane's width, or at its print size (the pane scrolls sideways). */
export type SheetZoom = 'fit' | 'full';

class SessionStore {
  /** The Chords tab side shown last, so the tab link goes back to it. */
  chordsSide = $state<ChordsSide>('find');
  /** The chord the Chord notes side shows. */
  chordNotes = $state.raw<Chord | null>(null);
  /** The key the Harmonize tab shows. */
  harmonizeKey = $state.raw<Key | null>(null);
  chordFinder = $state.raw<ChordFinderSession>({
    notes: [],
    bass: null,
    matchMode: 'partial',
    extended: false,
    root: null,
    family: null,
    keyTonic: null,
    keyMode: 'ionian',
  });
  keyFinder = $state.raw<KeyFinderSession>({ progression: [], modes: false, details: {} });
  scaleFinder = $state.raw<ScaleFinderSession>({ notes: [], tonic: null });
  sheetPane = $state<SheetPane>('edit');
  sheetZoom = $state<SheetZoom>('fit');
}

export const session = new SessionStore();

/** Appends a chord (with its bass) to the Key finder progression, as "Add to progression" does from the Chords tab. */
export function addToProgression(chord: Chord): void {
  session.keyFinder = { ...session.keyFinder, progression: [...session.keyFinder.progression, chord], details: {} };
}

export function openInHarmonize(key: Key): void {
  session.harmonizeKey = key;
  location.hash = '#/harmonize';
}
