import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import SheetPreview from '../src/components/SheetPreview.svelte';
import { parseSheet } from '../src/sheet/parse';

/** SheetPreview's HTML for a song, at a scale. */
function html(text: string, scale = 1): string {
  return render(SheetPreview, { props: { song: parseSheet(text).song, scale } }).body;
}

describe('SheetPreview', () => {
  it('puts each section name on its own line above the section’s first row, with no margin column', () => {
    const body = html('[A]\n| C | F |\n| G | C |\n[Guitar solo]\n| Am | G |');
    expect(body).not.toContain('label-cell');
    expect(body).not.toContain('--gutter');
    // The label is inside the first row (so a page break never separates them), before its bars.
    const firstRow = body.slice(body.indexOf('class="sheet-row'), body.indexOf('</div>', body.indexOf('class="bars')));
    expect(firstRow.indexOf('label-above')).toBeGreaterThan(-1);
    expect(firstRow.indexOf('label-above')).toBeLessThan(firstRow.indexOf('class="bars'));
    expect(body.match(/class="label-above[\s"]/g)).toHaveLength(2);
    expect(body.match(/class="section-label[\s"]/g)).toHaveLength(2);
  });

  it('draws every chord at one size, the sheet’s scale', () => {
    const body = html('| C | Cmaj7 Dm7 | Am Am/G | F |', 0.85);
    expect(body).toContain('--sheet-size: 13.6');
    const sizes = new Set(Array.from(body.matchAll(/class="content[^"]*" style="font-size: ([\d.]+)em/g), (m) => m[1]));
    expect(Array.from(sizes)).toEqual(['1.3']);
    expect(body.match(/class="chord-line[\s"]/g)).toHaveLength(4);
    expect(body).not.toContain('wraps');
  });
});
