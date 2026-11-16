// Downloads the sampled instruments from gleitz/midi-js-soundfonts (FluidR3_GM,
// CC BY 3.0) into public/samples/<folder>/<Note>.mp3, keeping only the notes
// in src/audio/sampleSets.ts (one every minor third), and writes
// public/samples/CREDITS.txt and scripts/samples-manifest.json (a record of
// the files and sizes; kept out of public/ since nothing at runtime reads it).
//
// Run with `npm run fetch-samples` (plain `node scripts/fetch-samples.ts` on
// Node 22.18+, or `npx tsx scripts/fetch-samples.ts`). The files are plain
// mp3s from the source, unmodified. Fails if an instrument is over 1 MB.

import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAMPLE_SETS, sampleNotes, type SampleSet } from '../src/audio/sampleSets.ts';

const SOURCE = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM';
const SOURCE_REPO = 'https://github.com/gleitz/midi-js-soundfonts';
const LICENSE = 'Creative Commons Attribution 3.0 (CC BY 3.0), https://creativecommons.org/licenses/by/3.0/';
const BUDGET_BYTES = 1024 * 1024;

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const samplesDir = join(scriptsDir, '..', 'public', 'samples');
const manifestPath = join(scriptsDir, 'samples-manifest.json');

async function download(url: string): Promise<Uint8Array> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      if (attempt >= 3) throw new Error(`${url}: ${(error as Error).message}`);
    }
  }
}

interface FetchedSet {
  folder: string;
  soundfont: string;
  notes: string[];
  bytes: number;
}

async function fetchSet(set: SampleSet): Promise<FetchedSet> {
  const dir = join(samplesDir, set.folder);
  await mkdir(dir, { recursive: true });
  const notes = sampleNotes(set);
  // Remove files from an older note selection.
  for (const file of await readdir(dir)) {
    if (file.endsWith('.mp3') && !notes.includes(file.slice(0, -4))) await rm(join(dir, file));
  }
  const sizes = await Promise.all(
    notes.map(async (note) => {
      const data = await download(`${SOURCE}/${set.soundfont}-mp3/${note}.mp3`);
      await writeFile(join(dir, `${note}.mp3`), data);
      return data.byteLength;
    }),
  );
  return { folder: set.folder, soundfont: set.soundfont, notes, bytes: sizes.reduce((a, b) => a + b, 0) };
}

function credits(sets: readonly FetchedSet[]): string {
  return [
    `Samples: FluidR3_GM (mp3), from ${SOURCE_REPO} (FluidR3_GM by Frank Wen).`,
    `License: ${LICENSE}`,
    '',
    ...sets.map((s) => `${s.folder}/: "${s.soundfont}", ${s.notes[0]}..${s.notes[s.notes.length - 1]}, every minor third.`),
    '',
    'Files are kept unmodified; only a subset of notes is included.',
    'Regenerate with `npm run fetch-samples` (scripts/fetch-samples.ts).',
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  const fetched: FetchedSet[] = [];
  for (const [id, set] of Object.entries(SAMPLE_SETS)) {
    const result = await fetchSet(set);
    fetched.push(result);
    console.log(`${id.padEnd(15)} ${result.folder.padEnd(16)} ${result.notes.length} files  ${(result.bytes / 1024).toFixed(0)} KB`);
  }
  const manifest = {
    source: SOURCE_REPO,
    soundfont: 'FluidR3_GM',
    license: LICENSE,
    instruments: Object.fromEntries(Object.keys(SAMPLE_SETS).map((id, i) => [id, fetched[i]])),
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(join(samplesDir, 'CREDITS.txt'), credits(fetched));
  const total = fetched.reduce((a, s) => a + s.bytes, 0);
  console.log(`total ${(total / 1024).toFixed(0)} KB`);
  const over = fetched.filter((s) => s.bytes > BUDGET_BYTES);
  if (over.length) {
    console.error(`Over the 1 MB budget: ${over.map((s) => s.folder).join(', ')}`);
    process.exitCode = 1;
  }
}

await main();
