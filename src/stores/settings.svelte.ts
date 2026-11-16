// User settings kept in localStorage: piano key sounds (on by default; when
// off, tapping piano keys selects notes silently) and the instrument. The
// store mirrors the instrument into the audio engine, and mirrors the engine's
// loading status of the selected instrument back for the UI. Data saved by the
// first version had a global `sound` switch, which is ignored.

import {
  DEFAULT_INSTRUMENT,
  instrumentStatus as engineInstrumentStatus,
  isInstrumentId,
  onInstrumentStatus,
  setInstrument as setEngineInstrument,
  type InstrumentId,
  type InstrumentStatus,
} from '../audio/engine';

export const SETTINGS_STORAGE_KEY = 'harmonics.settings';

export interface StoredSettings {
  keySounds: boolean;
  instrument: InstrumentId;
}

export const DEFAULT_SETTINGS: StoredSettings = { keySounds: true, instrument: DEFAULT_INSTRUMENT };

type SettingsStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Reads settings, ignoring missing, malformed or unknown values (and the old `sound` switch). */
export function readSettings(storage: SettingsStorage | undefined): StoredSettings {
  let raw: unknown;
  try {
    raw = JSON.parse(storage?.getItem(SETTINGS_STORAGE_KEY) ?? 'null');
  } catch {
    raw = null;
  }
  const data = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    keySounds: typeof data.keySounds === 'boolean' ? data.keySounds : DEFAULT_SETTINGS.keySounds,
    instrument: isInstrumentId(data.instrument) ? data.instrument : DEFAULT_SETTINGS.instrument,
  };
}

export function writeSettings(storage: SettingsStorage | undefined, settings: StoredSettings): void {
  try {
    storage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private mode or storage full: the setting just won't persist.
  }
}

function browserStorage(): SettingsStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

class SettingsStore {
  /** Tapping a piano key plays it; shared by every piano. */
  keySounds = $state(DEFAULT_SETTINGS.keySounds);
  instrument = $state<InstrumentId>(DEFAULT_SETTINGS.instrument);
  /** Loading status of the selected instrument: 'loading' while its samples download, 'failed' if the synth stands in. */
  instrumentStatus = $state<InstrumentStatus>('ready');
  readonly #storage: SettingsStorage | undefined;

  constructor(storage: SettingsStorage | undefined) {
    this.#storage = storage;
    const stored = readSettings(storage);
    this.keySounds = stored.keySounds;
    this.instrument = stored.instrument;
    setEngineInstrument(stored.instrument);
    this.instrumentStatus = engineInstrumentStatus(stored.instrument);
    onInstrumentStatus((id, status) => {
      if (id === this.instrument) this.instrumentStatus = status;
    });
  }

  setKeySounds(on: boolean): void {
    this.keySounds = on;
    this.#save();
  }

  setInstrument(id: InstrumentId): void {
    this.instrument = id;
    this.instrumentStatus = engineInstrumentStatus(id);
    setEngineInstrument(id);
    this.#save();
  }

  /** Loads the selected instrument again after it failed. */
  retryInstrument(): void {
    setEngineInstrument(this.instrument);
    this.instrumentStatus = engineInstrumentStatus(this.instrument);
  }

  #save(): void {
    writeSettings(this.#storage, { keySounds: this.keySounds, instrument: this.instrument });
  }
}

export const settings = new SettingsStore(browserStorage());
