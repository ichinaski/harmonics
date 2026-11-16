// Browser QA of the built app: node scripts/qa/run.ts [--quick] [check name...]
// --quick skips the PDF page count sweep. Names pick checks (e.g. `samples`).
// CHROME_PATH sets the browser, QA_BASE_URL tests a running server instead of
// `vite preview` of dist/. Exits non-zero when a check fails.

import { checkSampledInstruments, checkSheetChordLayout, checkSheetPageCounts, checkSheetRoundTrip, checkTabsRender } from './checks.ts';
import { Results, startQa, type QaEnv } from './lib.ts';

type Check = (env: QaEnv, results: Results) => Promise<void>;

const CHECKS: { name: string; run: Check; slow?: boolean }[] = [
  { name: 'tabs', run: checkTabsRender },
  { name: 'page-counts', run: checkSheetPageCounts, slow: true },
  { name: 'chord-layout', run: checkSheetChordLayout },
  { name: 'round-trip', run: checkSheetRoundTrip },
  { name: 'samples', run: checkSampledInstruments },
];

const args = process.argv.slice(2);
const quick = args.includes('--quick');
const names = args.filter((arg) => !arg.startsWith('--'));
const unknown = names.filter((name) => !CHECKS.some((check) => check.name === name));
if (unknown.length > 0) {
  console.error(`Unknown check: ${unknown.join(', ')}. Checks: ${CHECKS.map((check) => check.name).join(', ')}`);
  process.exit(2);
}
const selected = CHECKS.filter((check) => (names.length > 0 ? names.includes(check.name) : !(quick && check.slow)));

const started = Date.now();
const env = await startQa();
const results = new Results();
try {
  for (const check of selected) {
    console.log(`${check.name}`);
    const checkStarted = Date.now();
    try {
      await check.run(env, results);
    } catch (error) {
      results.ok(false, `${check.name} threw`, error instanceof Error ? (error.stack ?? error.message) : String(error));
    }
    console.log(`  (${((Date.now() - checkStarted) / 1000).toFixed(1)} s)`);
  }
} finally {
  await env.close();
}
console.log(`${results.passes} passed, ${results.failures} failed in ${((Date.now() - started) / 1000).toFixed(1)} s (${env.baseUrl})`);
process.exit(results.failures > 0 ? 1 : 0);
