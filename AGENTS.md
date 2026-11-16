# Guide for AI coding agents

Harmonics is a static music theory webapp: Vite, Svelte 5 with runes, TypeScript, Vitest, smplr for samples, deployed to GitHub Pages under `/harmonics/`. Read [README.md](README.md) first, then [docs/architecture.md](docs/architecture.md).

## Commands

| Command | Use |
|---|---|
| `npm run dev` | Dev server at http://localhost:5173/ |
| `npm test` | Unit tests |
| `npm run check` | Type check (`svelte-check` and `tsc`) |
| `npm run build` | Production build to `dist/` |
| `npm run qa` | Build, then the browser QA suite (Chrome via puppeteer-core) |
| `npm run qa:quick` | The same without the slow PDF page count check |

The QA suite needs Chrome or Chromium; set `CHROME_PATH` if it isn't found. `QA_BASE_URL` points it at a running server. Run one check with `node scripts/qa/run.ts <name>` (`tabs`, `page-counts`, `chord-layout`, `round-trip`, `samples`) after a build.

## Validating a change

Every change: `npm test`, `npm run check` and `npm run build`. CI runs the first three on every push to `main` and deploys what passes.

UI, layout, print or Sheet changes: also `npm run qa` (or `qa:quick` while iterating, then the full run). The `page-counts` check compares the app's page count with Chrome's A4 and Letter PDFs, so run the full suite after touching sheet layout, spacing, print CSS or `src/sheet/fit.ts`.

After a build, check the gzip sizes it prints: the entry JS and CSS plus the fonts must stay under 150 KB gzipped.

## Conventions

- Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`); no legacy stores or `export let`. Shared state lives in `src/stores/*.svelte.ts`.
- `src/theory/` and `src/sheet/` are plain TypeScript with no UI, DOM or store imports. Put logic there and keep components thin.
- Tests live in `tests/`, one file per module, named after it (`tests/chordFinder.test.ts` for `src/theory/chordFinder.ts`). Add or update a test with every logic change. Ranking weights are tuned against fixed cases; change weights and cases together.
- QA selectors: prefer a `data-qa` attribute on the element over classes or text that may change.
- Asset URLs: build them from `import.meta.env.BASE_URL` in TypeScript, never `/samples/...`.
- Plain CSS with the custom properties in `src/styles/tokens.css`; no CSS framework. Keep color from being the only signal.
- Comments explain why or a needed constraint, in plain language. Keep them true when you change the code.
- Don't add dependencies without a clear need; the bundle budget is tight.

## Invariants

The rules a change must not break are listed in [docs/architecture.md](docs/architecture.md#invariants). The ones most easily broken: theory and sheet code stay free of UI imports; names never use double accidentals; the Sheet preview is the print layout scaled; one text size per sheet; the page count matches the PDF; old sheet links and old sheet text keep working ([docs/sheet-format.md](docs/sheet-format.md)).

## Docs

- `README.md`: overview, commands, deployment, credits.
- `docs/architecture.md`: modules, data flow, state, audio, invariants.
- `docs/sheet-format.md`: the Sheet syntax and link format, with compatibility rules.
- `docs/decisions.md`: why things are the way they are.
- `docs/roadmap.md`: ideas for later.

Update the relevant doc when you change behavior it describes. If you change the Sheet syntax, update `docs/sheet-format.md` and the in-app guide in `src/views/SheetSyntax.svelte` together.
