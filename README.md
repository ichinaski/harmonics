# Harmonics

Harmonics is a static music theory webapp for transcribing and composing. **Chords** finds a chord from the notes you pick (Find chord) or shows the notes of a chord (Chord notes). **Key** ranks the likely keys of a progression. **Harmonize** shows the chords of a key or mode, with secondary dominants and borrowed chords. **Scales** lists the scales that fit a melody. **Sheet** turns a song's chords, typed as text, into a chord sheet to print or save as PDF. There is no backend: everything runs in the browser.

Live at https://ichinaski.github.io/harmonics/ (source: https://github.com/ichinaski/harmonics).

Built with Vite, Svelte 5 (runes) and TypeScript, tested with Vitest. Sampled instruments are played with [smplr](https://github.com/danigb/smplr).

## Requirements

Node 24, as in CI (the scripts in `scripts/` run TypeScript directly with `node`, which needs Node 22.18 or later). `npm run qa` also needs a local Chrome or Chromium.

## Commands

```sh
npm install
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server at http://localhost:5173/ |
| `npm run build` | Production build to `dist/`, served under `/harmonics/` |
| `npm run preview` | Serves the build at http://localhost:4173/harmonics/ |
| `npm test` | Unit tests (Vitest); `npm run test:watch` to watch |
| `npm run check` | Type check: `svelte-check` for `src/` and `tests/`, `tsc` for `vite.config.ts` and `scripts/` |
| `npm run qa` | Builds, then runs the browser QA suite in `scripts/qa/` against `vite preview` |
| `npm run qa:quick` | The same without the slow PDF page count check |
| `npm run fetch-samples` | Downloads the instrument samples again into `public/samples/` |

The QA suite drives Chrome with puppeteer-core. It finds Chrome in the usual places, or set `CHROME_PATH`. Set `QA_BASE_URL` (for example `http://localhost:5173/`) to test a server that is already running instead of `vite preview`. You can run single checks by name: `node scripts/qa/run.ts samples round-trip` (checks: `tabs`, `page-counts`, `chord-layout`, `round-trip`, `samples`).

The samples are committed, so a fresh clone doesn't need `fetch-samples`. Run it after changing `src/audio/sampleSets.ts`. It downloads the listed notes from [gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts), removes stale files, writes `public/samples/CREDITS.txt` and `scripts/samples-manifest.json` (a record of the files and sizes, not served) and fails if an instrument is over 1 MB.

## Folders

```
src/
  theory/      music theory engine (notes, chords, scales, finders), plain TypeScript
  sheet/       Sheet text parser, song model, layout and pagination helpers, URL codec
  audio/       audio engine, synth, smplr sampler, sample sets
  stores/      shared state: session (in memory), settings and sheet (localStorage, URL)
  components/  shared Svelte components (piano, pickers, chord cards, sheet preview)
  views/       one component per tab or page
  styles/      design tokens and global CSS
  routes.ts    hash routes and redirects
  App.svelte   header, tabs, router
tests/         Vitest unit tests, one file per module
scripts/       fetch-samples.ts and the browser QA suite (qa/)
public/        samples/ and fonts/, copied into the build as is
```

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`: `npm ci`, `npm run check`, `npm test`, `npm run build`, a check that the samples are in `dist/`, and a deploy of `dist/` to GitHub Pages. In the repository settings, under Pages, the source must be set to **GitHub Actions**.

The app is served under `/harmonics/`, so `vite.config.ts` sets `base: '/harmonics/'` for the build and `vite preview`, and `/` for the dev server. The About dialog shows the build's short commit hash (`GITHUB_SHA` in CI, `git rev-parse --short HEAD` locally, else `dev`) and build date, set through Vite `define`.

## Documentation

- [docs/architecture.md](docs/architecture.md): modules, data flow, state, audio and the invariants a change must keep.
- [docs/sheet-format.md](docs/sheet-format.md): the Sheet text syntax and the song link format.
- [docs/decisions.md](docs/decisions.md): the main design decisions and why.
- [docs/roadmap.md](docs/roadmap.md): ideas left for later.
- [AGENTS.md](AGENTS.md): a short guide for AI coding agents.

## Credits and licenses

- [smplr](https://github.com/danigb/smplr) by danigb, MIT License.
- FluidR3_GM soundfont by Frank Wen, Creative Commons Attribution 3.0 (CC BY 3.0), mp3 renderings from [gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts). See `public/samples/CREDITS.txt`.
- Inter font by The Inter Project Authors, SIL Open Font License 1.1, Latin subset from Fontsource. See `public/fonts/Inter-LICENSE.txt`.
