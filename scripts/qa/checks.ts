// The browser QA checks (run by scripts/qa/run.ts). Each one opens its own
// browser context, so localStorage and the cache start empty, and records
// pass/fail lines in `Results`.

/// <reference lib="dom" />

import type { Page } from 'puppeteer-core';
import { SAMPLE_SETS } from '../../src/audio/sampleSets.ts';
import { clickText, fixture, openPage, sleep, waitForView, type QaEnv, type Results } from './lib.ts';

const ROUTES = ['#/chords', '#/chords/notes', '#/key', '#/harmonize', '#/scales', '#/sheet', '#/sheet/syntax'];
const WIDTHS = [320, 390, 1280];

/** Above the Sheet's address bar delay (URL_UPDATE_DELAY_MS) and its page measuring. */
const SETTLE_MS = 900;

// ---- Sheet helpers ----

interface SheetState {
  hash: string;
  title: string;
  body: string;
  toast: string | null;
  continueText: string | null;
}

function sheetState(page: Page): Promise<SheetState> {
  return page.evaluate(() => ({
    hash: location.hash,
    title: document.querySelector<HTMLInputElement>('[data-qa="sheet-title"]')!.value,
    body: document.querySelector<HTMLTextAreaElement>('textarea.song-text')!.value,
    toast: document.querySelector('.undo-toast')?.textContent?.trim() ?? null,
    continueText: document.querySelector('.continue-button')?.textContent?.trim() ?? null,
  }));
}

/**
 * Polls the sheet state until `ready` holds (or `timeoutMs` passes) and returns
 * the last state, so checks wait for the app instead of a fixed delay.
 */
async function waitForSheet(page: Page, ready: (state: SheetState) => boolean, timeoutMs = 5000): Promise<SheetState> {
  const until = Date.now() + timeoutMs;
  let state = await sheetState(page);
  while (!ready(state) && Date.now() < until) {
    await sleep(50);
    state = await sheetState(page);
  }
  return state;
}

/** Puts a whole song (with Title:/Artist: lines) in the editor, as one input event. */
async function setSong(page: Page, text: string): Promise<void> {
  await page.evaluate((text) => {
    const textarea = document.querySelector<HTMLTextAreaElement>('textarea.song-text')!;
    textarea.value = text;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
}

/** Picks a Layout option: `group` is 'bars-per-row' or 'fit-to', `label` the button's text ('8', '1 page'). */
async function setLayout(page: Page, group: 'bars-per-row' | 'fit-to', label: string): Promise<void> {
  await clickText(page, `[aria-labelledby="${group}-label"] button`, label);
}

/** The preview header's page count, once it has stopped changing. */
async function sheetLength(page: Page): Promise<{ text: string; detail: string; cantFit: boolean }> {
  const read = () =>
    page.$eval('.sheet-length', (el) => ({ text: el.textContent?.trim() ?? '', detail: el.getAttribute('title') ?? '', cantFit: el.classList.contains('does-not-fit') }));
  let last = await read();
  for (let i = 0; i < 20; i++) {
    await sleep(250);
    const next = await read();
    if (next.text && next.text === last.text && next.detail === last.detail) return next;
    last = next;
  }
  return last;
}

/** Pages in Chrome's PDF: its page tree's /Count. */
async function pdfPageCount(page: Page, format: 'A4' | 'Letter'): Promise<number> {
  const pdf = Buffer.from(await page.pdf({ format })).toString('latin1');
  const counts = [...pdf.matchAll(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)|\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages\b/g)].map((m) => Number(m[1] ?? m[2]));
  if (counts.length === 0) throw new Error('no page count in the PDF');
  return Math.max(...counts);
}

const pagesIn = (text: string, pattern: RegExp): number => Number(pattern.exec(text)?.[1] ?? NaN);

// ---- Checks ----

/** Every route at 320, 390 and 1280 px, light and dark: renders, no horizontal overflow, no errors. The Sheet also with the example song. */
export async function checkTabsRender(env: QaEnv, results: Results): Promise<void> {
  const context = await env.browser.createBrowserContext();
  for (const width of WIDTHS) {
    for (const dark of [false, true]) {
      for (const route of ROUTES) {
        const { page, errors } = await openPage(env, context, route, { width, dark });
        const label = `${route} ${width}px ${dark ? 'dark' : 'light'}`;
        const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (route === '#/sheet') {
          await clickText(page, 'button', 'Load example');
          await sleep(SETTLE_MS);
          if (width < 800) await clickText(page, '.pane-switch button', 'Preview');
        }
        const extra = await overflow();
        results.ok(extra <= 0 && errors.length === 0, label, `overflow ${extra}px; ${errors.join('; ')}`);
        await page.close();
      }
    }
  }
  await context.close();
}

interface PageCountCase {
  song: string;
  bars?: string;
  fit?: string;
}

const PAGE_COUNT_CASES: PageCountCase[] = [
  { song: 'short' },
  { song: 'long' },
  { song: 'short', fit: '1 page' },
  { song: 'medium', fit: '1 page' },
  { song: 'long', bars: '8' },
  { song: 'busy', bars: '8', fit: '2 pages' },
];

/** The preview header's page count matches the A4 and Letter PDFs; a song too long for Fit to 1 page shows the amber status. */
export async function checkSheetPageCounts(env: QaEnv, results: Results): Promise<void> {
  const context = await env.browser.createBrowserContext();
  for (const { song, bars = 'As typed', fit = 'Off' } of PAGE_COUNT_CASES) {
    const { page } = await openPage(env, context, '#/sheet');
    await setLayout(page, 'bars-per-row', bars);
    await setLayout(page, 'fit-to', fit);
    await setSong(page, fixture(song));
    const length = await sheetLength(page);
    const a4 = await pdfPageCount(page, 'A4');
    const letter = await pdfPageCount(page, 'Letter');
    let expected: boolean;
    if (fit === 'Off') {
      // 'Prints on 1 page', 'About 3 pages at 85%'; when A4 and Letter differ, the tooltip has both.
      const shown = pagesIn(length.text, /(\d+) pages?/);
      const detail = /A4: (\d+) pages? · Letter: (\d+)/.exec(length.detail);
      expected = detail ? Number(detail[1]) === a4 && Number(detail[2]) === letter : shown === a4 && shown === letter;
    } else {
      expected = !length.cantFit && pagesIn(length.text, /^Fits on (\d+)/) === Math.max(a4, letter) && Math.max(a4, letter) <= parseInt(fit);
    }
    results.ok(expected, `${song}, bars ${bars}, fit ${fit}: "${length.text}" = PDF A4 ${a4}, Letter ${letter}`, length.detail);
    await page.close();
  }

  const { page } = await openPage(env, context, '#/sheet');
  await setLayout(page, 'fit-to', '1 page');
  await setSong(page, fixture('huge'));
  const length = await sheetLength(page);
  const needs = Math.max(await pdfPageCount(page, 'A4'), await pdfPageCount(page, 'Letter'));
  results.ok(
    length.cantFit && /^Can’t fit on 1 page/.test(length.text) && pagesIn(length.text, /needs (\d+)/) === needs,
    `huge, fit 1 page: amber "${length.text}", PDF needs ${needs}`,
  );
  await context.close();
}

/** One chord font size per sheet, and no chord, beat or time signature crosses a bar line. */
export async function checkSheetChordLayout(env: QaEnv, results: Results): Promise<void> {
  const context = await env.browser.createBrowserContext();
  const cases: PageCountCase[] = [{ song: 'short' }, { song: 'busy' }, { song: 'busy', bars: '8' }, { song: 'medium', fit: '1 page' }];
  for (const { song, bars = 'As typed', fit = 'Off' } of cases) {
    const { page } = await openPage(env, context, '#/sheet');
    await setLayout(page, 'bars-per-row', bars);
    await setLayout(page, 'fit-to', fit);
    await setSong(page, fixture(song));
    await sheetLength(page);
    const layout = await page.evaluate(() => {
      const paper = document.querySelector('.preview-pane .sheet-paper')!;
      const sizes = new Set([...paper.querySelectorAll('.chord')].map((chord) => getComputedStyle(chord).fontSize));
      const crossing: string[] = [];
      const range = document.createRange();
      for (const bar of paper.querySelectorAll('.bar')) {
        const box = bar.getBoundingClientRect();
        const lines = [...bar.querySelectorAll('.barline span, .barline i')].map((line) => line.getBoundingClientRect()).filter((r) => r.width > 0);
        for (const el of bar.querySelectorAll('.chord, .beat, .time, .times, .ending-number')) {
          range.selectNodeContents(el);
          const text = range.getBoundingClientRect();
          if (text.width === 0) continue;
          const outside = text.left < box.left - 0.5 || text.right > box.right + 0.5;
          const onLine = lines.some((l) => text.left < l.right && text.right > l.left && text.top < l.bottom && text.bottom > l.top);
          if (outside || onLine) crossing.push(el.textContent ?? '');
        }
      }
      return { sizes: [...sizes], chords: paper.querySelectorAll('.chord').length, crossing };
    });
    const label = `${song}, bars ${bars}, fit ${fit}`;
    results.ok(layout.chords > 0 && layout.sizes.length === 1, `${label}: one chord size (${layout.sizes.join(', ')})`);
    results.ok(layout.crossing.length === 0, `${label}: no text crosses a bar line`, layout.crossing.join(' '));
    await page.close();
  }
  await context.close();
}

/** The song in the link: typed, reloaded, opened elsewhere; New and Undo; a new visit offers the last song. */
export async function checkSheetRoundTrip(env: QaEnv, results: Results): Promise<void> {
  const context = await env.browser.createBrowserContext();
  const { page, errors } = await openPage(env, context, '#/sheet');
  await page.click('[data-qa="sheet-title"]');
  await page.keyboard.type('Blues for QA');
  await page.click('textarea.song-text');
  await page.keyboard.type('| C7 | F7 | C7 | C7 |\n| F7 | F7 | C7 | A7 |');
  const typed = await waitForSheet(page, (state) => state.hash.startsWith('#/sheet?s=') && state.body.endsWith('A7 |'));
  results.ok(typed.hash.startsWith('#/sheet?s='), 'typing puts the song in the link', typed.hash);

  await page.reload({ waitUntil: 'load' });
  await waitForView(page);
  const reloaded = await waitForSheet(page, (state) => state.body === typed.body);
  results.ok(reloaded.title === typed.title && reloaded.body === typed.body && reloaded.hash === typed.hash, 'reload keeps the song');

  const elsewhere = await env.browser.createBrowserContext();
  const fresh = await openPage(env, elsewhere, typed.hash);
  const linked = await waitForSheet(fresh.page, (state) => state.body === typed.body);
  results.ok(linked.title === typed.title && linked.body === typed.body, 'the link opens the song in a fresh browser', JSON.stringify(linked));
  await elsewhere.close();

  await clickText(page, '.actions button', 'New');
  const cleared = await waitForSheet(page, (state) => state.body === '' && state.hash === '#/sheet' && state.toast !== null);
  results.ok(cleared.title === '' && cleared.body === '' && cleared.hash === '#/sheet' && cleared.toast === 'Sheet cleared. Undo', 'New clears with an Undo toast', JSON.stringify(cleared));
  await page.click('.undo-button');
  const undone = await waitForSheet(page, (state) => state.body === typed.body && state.hash === typed.hash);
  results.ok(undone.title === typed.title && undone.body === typed.body && undone.hash === typed.hash, 'Undo brings the song back', JSON.stringify(undone));
  await page.close();

  const visit = await openPage(env, context, '#/sheet', { cleanStorage: false });
  const offered = await waitForSheet(visit.page, (state) => state.continueText !== null);
  results.ok(offered.body === '' && offered.continueText === 'Continue last song: Blues for QA', 'a new visit offers "Continue last song"', JSON.stringify(offered));
  await visit.page.click('.continue-button');
  const continued = await waitForSheet(visit.page, (state) => state.body === typed.body);
  results.ok(continued.title === typed.title && continued.body === typed.body, 'Continue last song restores it');
  results.ok(errors.length + visit.errors.length + fresh.errors.length === 0, 'no errors', [...errors, ...visit.errors, ...fresh.errors].join('; '));
  await context.close();
}

/** Each sampled instrument loads its files from <base>/samples/<folder>/ (status 200), with no errors after a Play. */
export async function checkSampledInstruments(env: QaEnv, results: Results): Promise<void> {
  const context = await env.browser.createBrowserContext();
  const { page, errors } = await openPage(env, context, '#/chords');
  const samplesPath = `${new URL(env.baseUrl).pathname}samples/`;
  const responses: { path: string; status: number }[] = [];
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname;
    if (path.includes('/samples/')) responses.push({ path, status: response.status() });
  });
  // Select C E G, so a chord card with Play shows.
  for (const midi of [48, 52, 55]) await page.click(`[data-midi="${midi}"]`);
  await page.waitForSelector('.chord-card .play-button');
  for (const [id, set] of Object.entries(SAMPLE_SETS)) {
    const start = responses.length;
    await page.select('#instrument-select', id);
    await page.click('.chord-card .play-button');
    await page.waitForFunction(() => !document.querySelector('.sound-controls .spinner'), { timeout: 20000 });
    await sleep(500);
    const loaded = responses.slice(start);
    const status = await page.$eval('#instrument-status', (el) => (el.classList.contains('shown') ? (el.textContent?.trim() ?? '') : ''));
    results.ok(
      loaded.length > 0 && loaded.every((r) => r.path.startsWith(`${samplesPath}${set.folder}/`) && r.status === 200) && !status && errors.length === 0,
      `${id}: ${loaded.length} files from ${samplesPath}${set.folder}/`,
      [status, ...errors, ...loaded.filter((r) => r.status !== 200 || !r.path.startsWith(`${samplesPath}${set.folder}/`)).map((r) => `${r.status} ${r.path}`)].join('; '),
    );
  }
  await context.close();
}
