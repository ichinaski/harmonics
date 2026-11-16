import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, readSettings, writeSettings } from '../src/stores/settings.svelte';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe('settings persistence', () => {
  it('defaults to key sounds on and the synth', () => {
    expect(DEFAULT_SETTINGS).toEqual({ keySounds: true, instrument: 'synth' });
    expect(readSettings(memoryStorage())).toEqual(DEFAULT_SETTINGS);
    expect(readSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips through storage', () => {
    const storage = memoryStorage();
    writeSettings(storage, { keySounds: false, instrument: 'bass' });
    expect(JSON.parse(storage.data.get(SETTINGS_STORAGE_KEY)!)).toEqual({ keySounds: false, instrument: 'bass' });
    expect(readSettings(storage)).toEqual({ keySounds: false, instrument: 'bass' });
  });

  it('ignores malformed or unknown values', () => {
    expect(readSettings(memoryStorage({ [SETTINGS_STORAGE_KEY]: '{oops' }))).toEqual(DEFAULT_SETTINGS);
    expect(readSettings(memoryStorage({ [SETTINGS_STORAGE_KEY]: '"text"' }))).toEqual(DEFAULT_SETTINGS);
    expect(readSettings(memoryStorage({ [SETTINGS_STORAGE_KEY]: '{"keySounds":"yes","instrument":"organ"}' }))).toEqual(DEFAULT_SETTINGS);
    expect(readSettings(memoryStorage({ [SETTINGS_STORAGE_KEY]: '{"keySounds":false}' }))).toEqual({ keySounds: false, instrument: 'synth' });
  });

  it('migrates first-version data: the old sound switch is ignored, the instrument is kept', () => {
    expect(readSettings(memoryStorage({ [SETTINGS_STORAGE_KEY]: '{"sound":false,"instrument":"piano"}' }))).toEqual({ keySounds: true, instrument: 'piano' });
    expect(readSettings(memoryStorage({ [SETTINGS_STORAGE_KEY]: '{"sound":true}' }))).toEqual(DEFAULT_SETTINGS);
  });

  it('survives storage that throws', () => {
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    expect(() => writeSettings(throwing, DEFAULT_SETTINGS)).not.toThrow();
    expect(readSettings(throwing)).toEqual(DEFAULT_SETTINGS);
  });
});
