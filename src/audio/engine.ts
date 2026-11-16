// Audio engine: instrument choice, and playback of notes, chords (block or
// strum), arpeggios, scales and progressions. Everything played here sounds:
// there is no global sound switch (piano key taps are gated by the key-sounds
// setting in the UI). The AudioContext is created lazily on the first user
// gesture that needs it (browsers block audio before that). Instruments are
// backends behind one interface: the synth, and the sampled instruments
// (smplr, see sampler.ts), which load the first time they are selected with
// audio unlocked. Until one is loaded, or if it fails to load, the synth plays
// instead.
//
// Pure scheduling helpers (chordEvents, arpeggioEvents, scaleEvents,
// progressionStepSeconds) are exported for tests; nothing here touches the DOM
// at import time.

import { loadSampledInstrument } from './sampler';
import type { SampledInstrumentId } from './sampleSets';
import { createSynth } from './synth';

export type InstrumentId = 'synth' | 'piano' | 'electricGuitar' | 'acousticGuitar' | 'bass';

export type ChordStyle = 'block' | 'strum';

export interface InstrumentInfo {
  id: InstrumentId;
  label: string;
  /** Shown in the selector on narrow screens ('E. guitar'); screen readers still get `label`. */
  shortLabel: string;
  /** How chords are played: guitars strum, the rest play block chords. */
  chordStyle: ChordStyle;
  /** Semitones added to every note (bass plays an octave lower). */
  transpose: number;
}

export const INSTRUMENTS: readonly InstrumentInfo[] = [
  { id: 'synth', label: 'Synth', shortLabel: 'Synth', chordStyle: 'block', transpose: 0 },
  { id: 'piano', label: 'Piano', shortLabel: 'Piano', chordStyle: 'block', transpose: 0 },
  { id: 'electricGuitar', label: 'Electric guitar', shortLabel: 'E. guitar', chordStyle: 'strum', transpose: 0 },
  { id: 'acousticGuitar', label: 'Acoustic guitar', shortLabel: 'A. guitar', chordStyle: 'strum', transpose: 0 },
  { id: 'bass', label: 'Bass', shortLabel: 'Bass', chordStyle: 'block', transpose: -12 },
];

export const DEFAULT_INSTRUMENT: InstrumentId = 'synth';

export function isInstrumentId(value: unknown): value is InstrumentId {
  return INSTRUMENTS.some((i) => i.id === value);
}

export function instrumentInfo(id: InstrumentId): InstrumentInfo {
  return INSTRUMENTS.find((i) => i.id === id) ?? INSTRUMENTS[0]!;
}

// ---------------------------------------------------------------------------
// Scheduling (pure)

/** A note to play, relative to the start of a phrase. */
export interface NoteEvent {
  midi: number;
  /** Seconds after the phrase starts. */
  offset: number;
  /** Seconds until the note is released. */
  duration: number;
  /** 0..1 */
  velocity: number;
}

/** Seconds between strummed notes. */
export const STRUM_STEP = 0.015;
export const CHORD_DURATION = 1.6;
export const NOTE_DURATION = 1.2;
export const ARPEGGIO_STEP = 0.2;
export const SCALE_STEP = 0.25;

function ascending(midis: readonly number[]): number[] {
  return [...new Set(midis)].sort((a, b) => a - b);
}

/** A chord as block (all at once) or strum (low to high, STRUM_STEP apart, all released together). */
export function chordEvents(midis: readonly number[], style: ChordStyle, duration = CHORD_DURATION): NoteEvent[] {
  const notes = ascending(midis);
  const velocity = notes.length > 4 ? 0.7 : 0.8;
  return notes.map((midi, i) => {
    const offset = style === 'strum' ? i * STRUM_STEP : 0;
    return { midi, offset, duration: duration - offset, velocity };
  });
}

/** Notes one after another, low to high, each ringing until the end; then the whole chord rings out. */
export function arpeggioEvents(midis: readonly number[], step = ARPEGGIO_STEP, tail = CHORD_DURATION): NoteEvent[] {
  const notes = ascending(midis);
  const end = (notes.length - 1) * step + tail;
  return notes.map((midi, i) => ({ midi, offset: i * step, duration: end - i * step, velocity: 0.8 }));
}

/** A scale in the given order (melodic, not sorted), each note slightly legato; the last note rings longer. */
export function scaleEvents(midis: readonly number[], step = SCALE_STEP): NoteEvent[] {
  return midis.map((midi, i) => ({
    midi,
    offset: i * step,
    duration: i === midis.length - 1 ? NOTE_DURATION : step * 1.15,
    velocity: 0.8,
  }));
}

// ---------------------------------------------------------------------------
// Backends

/** A note at an absolute AudioContext time. */
export interface ScheduledNote {
  midi: number;
  time: number;
  duration: number;
  velocity: number;
}

/** What an instrument must provide. Sampled instruments implement this too. */
export interface InstrumentBackend {
  start(note: ScheduledNote): void;
  stopAll(): void;
}

// ---------------------------------------------------------------------------
// Engine state

interface AudioGraph {
  context: AudioContext;
  /** Instruments connect here: master gain → limiter → speakers. */
  input: AudioNode;
  synth: InstrumentBackend;
}

let graph: AudioGraph | null = null;
let instrument: InstrumentId = DEFAULT_INSTRUMENT;

/** Small lead time so the first notes of a phrase aren't cut off. */
const LEAD_TIME = 0.02;
const MASTER_GAIN = 0.8;

export function getInstrument(): InstrumentId {
  return instrument;
}

/**
 * Selects the instrument; a sampled one starts loading if audio is already
 * unlocked (otherwise on unlock). This is also how a failed instrument is
 * retried: selecting it again loads it again.
 */
export function setInstrument(id: InstrumentId): void {
  instrument = id;
  if (graph) loadInstrument(id, graph);
}

// ---------------------------------------------------------------------------
// Sampled instruments

/** 'idle' until a sampled instrument is first needed; the synth is always 'ready'. */
export type InstrumentStatus = 'idle' | 'loading' | 'ready' | 'failed';

type StatusListener = (id: InstrumentId, status: InstrumentStatus) => void;

const sampledBackends = new Map<SampledInstrumentId, InstrumentBackend>();
const sampledStatus = new Map<SampledInstrumentId, InstrumentStatus>();
const statusListeners = new Set<StatusListener>();

function isSampled(id: InstrumentId): id is SampledInstrumentId {
  return id !== 'synth';
}

export function instrumentStatus(id: InstrumentId): InstrumentStatus {
  return isSampled(id) ? (sampledStatus.get(id) ?? 'idle') : 'ready';
}

/** Calls `listener` whenever an instrument's status changes. Returns an unsubscribe function. */
export function onInstrumentStatus(listener: StatusListener): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

function setStatus(id: SampledInstrumentId, status: InstrumentStatus): void {
  sampledStatus.set(id, status);
  for (const listener of statusListeners) listener(id, status);
}

/**
 * Starts loading a sampled instrument. Unlocking audio (every gesture that
 * plays) only loads an 'idle' one; a 'failed' one is retried only by
 * setInstrument, so a broken download isn't refetched on every click.
 */
function loadInstrument(id: InstrumentId, audio: AudioGraph, retryFailed = true): void {
  if (!isSampled(id)) return;
  const status = instrumentStatus(id);
  if (status === 'loading' || status === 'ready' || (status === 'failed' && !retryFailed)) return;
  setStatus(id, 'loading');
  loadSampledInstrument(audio.context, audio.input, id).then(
    (backend) => {
      sampledBackends.set(id, backend);
      setStatus(id, 'ready');
    },
    (error: unknown) => {
      console.warn(`Couldn't load the ${instrumentInfo(id).label.toLowerCase()} samples, using the synth`, error);
      setStatus(id, 'failed');
    },
  );
}

/** The loaded sampled instrument, or the synth while it loads, if it failed, or for the synth itself. */
function backendFor(id: InstrumentId, audio: AudioGraph): InstrumentBackend {
  return (isSampled(id) && sampledBackends.get(id)) || audio.synth;
}

// ---------------------------------------------------------------------------
// AudioContext lifecycle and mobile handling

interface AudioSession {
  type: string;
}

/** A tiny silent 8-bit mono WAV. Playing it through <audio> moves iOS into the media channel, so Web Audio isn't muted by the ringer switch. */
export function silentWav(sampleRate = 8000, samples = 800): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true); // byte rate
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // bits per sample
  ascii(36, 'data');
  view.setUint32(40, samples, true);
  bytes.fill(128, 44); // 8-bit PCM silence is the midpoint
  return bytes;
}

let silentAudioPlayed = false;

/** iOS: play through the media channel so the ringer switch doesn't mute us. Must run inside a user gesture. */
function setPlaybackAudioSession(): void {
  const nav = navigator as Navigator & { audioSession?: AudioSession };
  if (nav.audioSession) {
    nav.audioSession.type = 'playback';
    return;
  }
  if (silentAudioPlayed) return;
  silentAudioPlayed = true;
  const url = URL.createObjectURL(new Blob([silentWav()], { type: 'audio/wav' }));
  const audio = new Audio(url);
  audio.setAttribute('x-webkit-airplay', 'deny');
  audio.preload = 'auto';
  audio
    .play()
    .catch(() => {
      // Not unlocked (e.g. not inside a gesture after all): try again on the next one.
      silentAudioPlayed = false;
    })
    .finally(() => URL.revokeObjectURL(url));
}

function resumeIfNeeded(context: AudioContext): void {
  // 'interrupted' is Safari's state after a call or another app taking audio.
  const state = context.state as AudioContextState;
  if ((state === 'suspended' || state === 'interrupted') && document.visibilityState === 'visible') {
    context.resume().catch(() => {});
  }
}

function createGraph(): AudioGraph {
  const context = new AudioContext({ latencyHint: 'interactive' });
  const master = context.createGain();
  master.gain.value = MASTER_GAIN;
  // Used as a limiter: hard knee, high ratio, fast attack.
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.15;
  master.connect(limiter).connect(context.destination);

  context.addEventListener('statechange', () => resumeIfNeeded(context));
  document.addEventListener('visibilitychange', () => resumeIfNeeded(context));
  return { context, input: master, synth: createSynth(context, master) };
}

/**
 * Creates (on first call) and resumes the AudioContext. Call it from a user
 * gesture: tapping a key, pressing Play.
 */
export function unlockAudio(): AudioGraph | null {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return null;
  setPlaybackAudioSession();
  graph ??= createGraph();
  resumeIfNeeded(graph.context);
  loadInstrument(instrument, graph, false);
  return graph;
}

// ---------------------------------------------------------------------------
// Playback. Each function returns the events of the phrase so callers can
// flash the played keys. Without Web Audio the result is empty.

function play(events: NoteEvent[]): NoteEvent[] {
  if (events.length === 0) return [];
  const audio = unlockAudio();
  if (!audio) return [];
  const info = instrumentInfo(instrument);
  const backend = backendFor(instrument, audio);
  const start = audio.context.currentTime + LEAD_TIME;
  for (const e of events) {
    backend.start({ midi: e.midi + info.transpose, time: start + e.offset, duration: e.duration, velocity: e.velocity });
  }
  return events;
}

export function playNote(midi: number, duration = NOTE_DURATION): NoteEvent[] {
  return play([{ midi, offset: 0, duration, velocity: 0.85 }]);
}

/** Plays a chord. The style defaults to the instrument's (strum for guitars, block otherwise). */
export function playChord(midis: readonly number[], style?: ChordStyle, duration = CHORD_DURATION): NoteEvent[] {
  return play(chordEvents(midis, style ?? instrumentInfo(instrument).chordStyle, duration));
}

export function playArpeggio(midis: readonly number[]): NoteEvent[] {
  return play(arpeggioEvents(midis));
}

/** Plays notes in the given order (pass the scale already ordered, e.g. with the octave on top). */
export function playScale(midis: readonly number[]): NoteEvent[] {
  return play(scaleEvents(midis));
}

// ---------------------------------------------------------------------------
// Progressions

/** One chord per beat: 60 bpm is a chord a second. */
export const PROGRESSION_BPM = 60;

/** Seconds between chords of a progression at `bpm` (one chord per beat). */
export function progressionStepSeconds(bpm = PROGRESSION_BPM): number {
  return 60 / bpm;
}

export interface ProgressionOptions {
  /** Called as each chord starts, with its index and the played notes (to highlight it and flash keys). */
  onStep?: (index: number, events: NoteEvent[]) => void;
  /** Called once when the progression finishes or is stopped. */
  onEnd?: () => void;
  bpm?: number;
}

export interface ProgressionHandle {
  /** Stops the progression and cuts the sounding chord. */
  stop(): void;
}

let progressionTimers: ReturnType<typeof setTimeout>[] = [];
let progressionEnd: (() => void) | null = null;

/** Cancels the running progression, if any, and tells its caller it ended. */
function cancelProgression(): void {
  for (const timer of progressionTimers) clearTimeout(timer);
  progressionTimers = [];
  const onEnd = progressionEnd;
  progressionEnd = null;
  onEnd?.();
}

/**
 * Plays chords one after another (each given as MIDI notes), one per beat,
 * each ringing until the next starts; guitars strum. Starting a progression
 * stops the previous one, and stopAll stops it too. Each chord is scheduled
 * when its beat comes, so stopping cancels the rest.
 */
export function playProgression(chords: readonly (readonly number[])[], options: ProgressionOptions = {}): ProgressionHandle {
  cancelProgression();
  // Chords play from timers, outside the user gesture: unlock audio now, while still inside it (iOS).
  unlockAudio();
  const step = progressionStepSeconds(options.bpm);
  const timers = chords.map((midis, index) =>
    setTimeout(() => options.onStep?.(index, playChord(midis, undefined, step)), index * step * 1000),
  );
  timers.push(setTimeout(cancelProgression, chords.length * step * 1000));
  progressionTimers = timers;
  progressionEnd = options.onEnd ?? (() => {});
  return {
    stop: () => {
      if (progressionTimers !== timers) return;
      cancelProgression();
      stopSounds();
    },
  };
}

function stopSounds(): void {
  graph?.synth.stopAll();
  for (const backend of sampledBackends.values()) backend.stopAll();
}

/** Stops everything that sounds, including a running progression. */
export function stopAll(): void {
  cancelProgression();
  stopSounds();
}
