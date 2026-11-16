import { describe, expect, it } from 'vitest';
import tokensCss from '../src/styles/tokens.css?raw';
import { QUALITY_FAMILIES } from '../src/theory/chords';

/** Custom properties declared in the first `:root { ... }` block of a CSS string. */
function rootVars(css: string): Map<string, string> {
  const block = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  return new Map([...block.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1]!, m[2]!]));
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const light = rootVars(tokensCss);
const darkBlock = tokensCss.slice(tokensCss.indexOf('@media (prefers-color-scheme: dark)'));
const dark = new Map([...light, ...rootVars(darkBlock)]);

/** Text color / background pairs that must meet WCAG AA for normal text (4.5:1). */
const TEXT_PAIRS: [string, string][] = [
  ['--text', '--bg'],
  ['--text', '--surface'],
  ['--text-muted', '--bg'],
  ['--text-muted', '--surface'],
  ['--accent-contrast', '--accent'],
  ['--accent-text', '--surface'],
  ['--accent-text', '--bg'],
  ['--accent-text', '--accent-soft'],
  ...QUALITY_FAMILIES.map((f): [string, string] => [`--q-${f}-fg`, `--q-${f}-bg`]),
  ['--sheet-error-mark-text', '--sheet-error-mark'],
  ['--sheet-error-mark', '--sheet-error-soft'],
  ['--sheet-warning-mark-text', '--sheet-warning-mark'],
  ['--key-white-text', '--key-white'],
  ['--key-black-text', '--key-black'],
  ['--key-scale-white-text', '--key-scale-white'],
  ['--key-scale-black-text', '--key-scale-black'],
  ['--key-tonic-white-text', '--key-tonic-white'],
  ['--key-tonic-black-text', '--key-tonic-black'],
  ['--key-missing-white-text', '--key-white'],
  ['--key-missing-black-text', '--key-black'],
];

describe('design tokens', () => {
  it.each([
    ['light', light],
    ['dark', dark],
  ] as const)('%s theme text pairs meet WCAG AA', (_theme, vars) => {
    for (const [fg, bg] of TEXT_PAIRS) {
      expect(vars.get(fg), fg).toBeDefined();
      expect(vars.get(bg), bg).toBeDefined();
      expect(contrast(vars.get(fg)!, vars.get(bg)!), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('defines a palette entry for every quality family in both themes', () => {
    for (const vars of [light, dark]) {
      for (const f of QUALITY_FAMILIES) {
        for (const part of ['bg', 'fg', 'edge']) expect(vars.has(`--q-${f}-${part}`), `--q-${f}-${part}`).toBe(true);
      }
    }
    expect(rootVars(darkBlock).size).toBeGreaterThan(20);
  });
});
