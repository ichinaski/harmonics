// Shared helpers of the browser QA suite (scripts/qa/run.ts): Chrome through
// puppeteer-core, a `vite preview` server for the built dist (or QA_BASE_URL),
// pages at a width and color scheme with their errors collected, and a tiny
// pass/fail recorder.

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import puppeteer, { type Browser, type BrowserContext, type Page } from 'puppeteer-core';

const ROOT = new URL('../../', import.meta.url);

const CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

/** Widths below this get a phone viewport (touch, 2x pixels). */
const MOBILE_BELOW_PX = 600;

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** A song fixture from scripts/qa/fixtures/. */
export function fixture(name: string): string {
  return readFileSync(new URL(`scripts/qa/fixtures/${name}.txt`, ROOT), 'utf8');
}

function chromePath(): string {
  const path = process.env.CHROME_PATH ?? CHROME_PATHS.find((candidate) => existsSync(candidate));
  if (!path) throw new Error('No Chrome found: set CHROME_PATH to a Chrome or Chromium executable');
  return path;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => (typeof address === 'object' && address ? resolve(address.port) : reject(new Error('no port'))));
    });
  });
}

async function waitForUrl(url: string, timeoutMs = 15000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Not listening yet.
    }
    await sleep(100);
  }
  throw new Error(`${url} didn't answer within ${timeoutMs} ms`);
}

export interface QaEnv {
  browser: Browser;
  /** The app's URL, ending in '/': http://127.0.0.1:<port>/harmonics/ */
  baseUrl: string;
  close(): Promise<void>;
}

/** Starts `vite preview` of dist/ on a free port (unless QA_BASE_URL is set) and launches Chrome. */
export async function startQa(): Promise<QaEnv> {
  let server: ChildProcess | undefined;
  let baseUrl = process.env.QA_BASE_URL;
  if (!baseUrl) {
    if (!existsSync(new URL('dist/index.html', ROOT))) throw new Error('No dist/: run `npm run build` first (or set QA_BASE_URL)');
    const port = await freePort();
    server = spawn('node_modules/.bin/vite', ['preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
      cwd: ROOT,
      stdio: 'ignore',
    });
    baseUrl = `http://127.0.0.1:${port}/harmonics/`;
    await waitForUrl(baseUrl);
  }
  if (!baseUrl.endsWith('/')) baseUrl += '/';
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true });
  return {
    browser,
    baseUrl,
    async close() {
      await browser.close();
      server?.kill();
    },
  };
}

export interface PageOptions {
  width?: number;
  height?: number;
  dark?: boolean;
  /** Clear localStorage before the app's first load in this page (default; reloads keep it). Off for a page that should see what an earlier one saved. */
  cleanStorage?: boolean;
}

export interface QaPage {
  page: Page;
  /** Page errors, console errors and failed requests so far. */
  errors: string[];
}

/** A page of `context` at `hash` (e.g. '#/sheet'), loaded and with the current view rendered. */
export async function openPage(env: QaEnv, context: BrowserContext, hash: string, options: PageOptions = {}): Promise<QaPage> {
  const { width = 1280, height = 900, dark = false, cleanStorage = true } = options;
  const page = await context.newPage();
  const mobile = width < MOBILE_BELOW_PX;
  await page.setViewport({ width, height, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
  if (cleanStorage) {
    await page.evaluateOnNewDocument(() => {
      if (sessionStorage.getItem('qa.cleaned')) return;
      localStorage.clear();
      sessionStorage.setItem('qa.cleaned', '1');
    });
  }
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error instanceof Error ? error.message : String(error)}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('requestfailed', (request) => errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ''}`));
  await page.goto(env.baseUrl + hash, { waitUntil: 'load' });
  await waitForView(page);
  return { page, errors };
}

/** Waits for the routed view (the Sheet's pages load on demand) and for fonts. */
export async function waitForView(page: Page): Promise<void> {
  await page.waitForSelector('main .view');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** Clicks the first `selector` element whose text starts with `text`. */
export async function clickText(page: Page, selector: string, text: string): Promise<void> {
  const clicked = await page.evaluate(
    (selector, text) => {
      const el = [...document.querySelectorAll<HTMLElement>(selector)].find((e) => e.textContent?.trim().startsWith(text));
      el?.click();
      return Boolean(el);
    },
    selector,
    text,
  );
  if (!clicked) throw new Error(`no ${selector} "${text}"`);
}

/** Records pass/fail lines; `failures` decides the exit code. */
export class Results {
  failures = 0;
  passes = 0;

  ok(condition: boolean, label: string, detail = ''): boolean {
    if (condition) this.passes++;
    else this.failures++;
    console.log(`  ${condition ? 'PASS' : 'FAIL'} ${label}${!condition && detail ? `: ${detail}` : ''}`);
    return condition;
  }
}
