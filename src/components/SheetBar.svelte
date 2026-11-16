<!--
  One bar of a chord sheet (SheetPreview): bar lines on its edges, chords
  placed by beats, %, N.C., the time signature as stacked numerals (before a
  repeat-start sign), the ending bracket and repeat count above, and attached
  notes below. Black on white, drawn with CSS and inline SVG only. Screen
  readers get one line of text per bar ("Bar 3: Cm7, F7"); the drawing is
  hidden from them.

  Every bar's chords have the same size (CHORD_EM of the sheet's text): the
  sheet's one scale is chosen so they fit side by side (barsScaleLimit,
  sheet/render.ts). Each chord sits at its beat (a grid of one column per
  beat) when the bar has room; a longer name takes the room it needs. Only
  a bar too busy even at the smallest scale stacks its chords, split at the
  half bar (and again while a half doesn't fit), each chord with its beat
  slashes, and a single name too wide even then wraps, so nothing crosses a
  bar line (barChordLines).
  On screen only, tokens that couldn't be read are underlined in red and
  the bar gets an "invalid" tag.
-->
<script lang="ts">
  import type { Bar, BarEnd, BarStart } from '../sheet/model';
  import { barChordLines, barHasInvalid, CHORD_EM, barItemText, describeBar, itemsBeats, showsBarStart, timeBeforeRepeatStart } from '../sheet/render';

  interface Props {
    bar: Bar;
    /** Bar number in the song, from 1. */
    number: number;
    /** Position in its line of the sheet (a long row wraps onto several lines). */
    indexInLine: number;
    /** The width of the bar's column, in em of the sheet's text size. */
    columnEm: number;
    /** The next bar's repeat start replaces this bar's single end line. */
    hideEnd?: boolean;
  }

  let { bar, number, indexInLine, columnEm, hideEnd = false }: Props = $props();

  type LinePart = 'thin' | 'thick' | 'dots';

  const START_PARTS: Record<BarStart, LinePart[]> = {
    single: ['thin'],
    double: ['thin', 'thin'],
    repeatStart: ['thick', 'thin', 'dots'],
  };

  const END_PARTS: Record<BarEnd, LinePart[]> = {
    single: ['thin'],
    double: ['thin', 'thin'],
    final: ['thin', 'thick'],
    repeatEnd: ['dots', 'thin', 'thick'],
  };

  const start = $derived(showsBarStart(bar, indexInLine) ? bar.start : null);
  const showEnd = $derived(!(hideEnd && bar.end === 'single'));
  const timeFirst = $derived(timeBeforeRepeatStart(bar));
  const invalid = $derived(barHasInvalid(bar));
  const lines = $derived(barChordLines(bar, columnEm));
</script>

{#snippet barLine(parts: LinePart[], side: 'start' | 'end' | 'inline')}
  <span class="barline barline-{side}">
    {#each parts as part, i (i)}<span class="line-{part}">{#if part === 'dots'}<i></i><i></i>{/if}</span>{/each}
  </span>
{/snippet}

{#snippet timeSignature()}
  {#if bar.timeSignature}
    <span class="time"><span>{bar.timeSignature.upper}</span><span>{bar.timeSignature.lower}</span></span>
  {/if}
{/snippet}

<div class="bar" class:has-invalid={invalid} role="listitem">
  <span class="visually-hidden">{describeBar(bar, number, indexInLine)}</span>
  <div
    class="staff"
    class:after-repeat-start={start === 'repeatStart' && !timeFirst}
    class:time-first={timeFirst}
    class:before-repeat-end={bar.end === 'repeatEnd'}
    aria-hidden="true"
  >
    {#if bar.ending}
      <span class="ending" class:ending-start={bar.ending.isStart} class:ending-close={bar.ending.isEnd && bar.end === 'repeatEnd'}>
        {#if bar.ending.isStart}<span class="ending-number">{bar.ending.label}</span>{/if}
      </span>
    {/if}
    {#if timeFirst && start}
      <!-- A time signature comes before a repeat-start sign. -->
      {@render timeSignature()}
      {@render barLine(START_PARTS[start], 'inline')}
    {:else}
      {#if start}{@render barLine(START_PARTS[start], 'start')}{/if}
      {@render timeSignature()}
    {/if}
    <span class="content" style:font-size="{CHORD_EM}em">
      {#if bar.content.kind === 'items'}
        {#each lines as { items, wraps }, l (l)}
          <!-- One column per beat: a chord on its first beat, then a slash on each of its other beats. -->
          <span class="chord-line" class:wraps style:grid-template-columns="repeat({itemsBeats(items)}, minmax(min-content, 1fr))">
            {#each items as item, i (i)}
              {#if item.kind !== 'continue'}<span class="chord" class:invalid={item.kind === 'invalid'}>{barItemText(item)}</span>{/if}
              {#each { length: item.kind === 'continue' ? item.beats : item.beats - 1 } as _, j (j)}<span class="beat">/</span>{/each}
            {/each}
          </span>
        {/each}
      {:else if bar.content.kind === 'repeatPrevious'}
        <svg class="simile" viewBox="0 0 20 20" width="20" height="20">
          <circle cx="5.2" cy="5.6" r="2.3" />
          <circle cx="14.8" cy="14.4" r="2.3" />
          <path d="M16.6 2.6 3.4 17.4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
        </svg>
      {/if}
    </span>
    {#if showEnd}{@render barLine(END_PARTS[bar.end], 'end')}{/if}
    {#if bar.repeatTimes}
      <span class="times">x{bar.repeatTimes}</span>
    {/if}
    {#if invalid}
      <span class="invalid-tag" class:left={bar.repeatTimes !== null}>invalid</span>
    {/if}
  </div>
  {#if bar.notes.length > 0}
    <span class="notes" aria-hidden="true">{bar.notes.join(' · ')}</span>
  {/if}
</div>

<style>
  /* Sizes are in em of the sheet's text size, so the sheet's scale changes everything together. */
  .bar {
    --thin: max(1px, 0.07em);
    --thick: 0.3em;
    position: relative;
    min-width: 0;
  }

  .staff {
    position: relative;
    display: flex;
    align-items: center;
    min-height: 2.5em;
    padding: 0 0.5em;
  }

  /* Room between the repeat dots and the first chord. Keep in step with barFixedWidth (sheet/render.ts). */
  .staff.after-repeat-start {
    padding-left: 1.5em;
  }

  .staff.time-first {
    padding-left: 0.35em;
  }

  .staff.before-repeat-end {
    padding-right: 1.3em;
  }

  /* Bar lines: thin and thick strokes and repeat dots, drawn with borders so they print without background graphics. */
  .barline {
    position: absolute;
    top: 0;
    bottom: 0;
    display: flex;
    gap: 0.13em;
  }

  .barline-start {
    left: 0;
  }

  .barline-end {
    right: 0;
  }

  /* After a time signature: in the flow, before the chords. */
  .barline-inline {
    position: relative;
    align-self: stretch;
    flex: none;
    margin-right: 0.4em;
  }

  .line-thin {
    border-left: var(--thin) solid currentColor;
  }

  .line-thick {
    border-left: var(--thick) solid currentColor;
  }

  .line-dots {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.36em;
    margin: 0 0.05em;
  }

  .line-dots i {
    display: block;
    width: 0;
    height: 0;
    border: 0.19em solid currentColor;
    border-radius: 50%;
  }

  .time {
    display: flex;
    flex: none;
    flex-direction: column;
    align-items: center;
    margin-right: 0.4em;
    font-size: 1.05em;
    font-weight: 700;
    line-height: 0.95;
    font-variant-numeric: tabular-nums;
  }

  /* The chords' size (CHORD_EM) and the paddings and gaps below are in step with barNeedEm (sheet/render.ts). */
  .content {
    display: flex;
    flex: 1;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
    font-weight: 600;
    line-height: 1.2;
    white-space: nowrap;
  }

  .chord-line {
    display: grid;
    align-items: baseline;
  }

  /* Last resort: a single name too wide for its bar even at the smallest scale wraps. */
  .chord-line.wraps {
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .chord {
    padding-right: 0.35em;
  }

  /* Screen only: a token that couldn't be read. */
  .chord.invalid {
    margin: 0 -0.1em;
    padding: 0 0.1em;
    border-radius: 0.15em;
    background: var(--sheet-error-soft);
    text-decoration: underline wavy var(--sheet-error-mark);
    text-decoration-thickness: max(1px, 0.06em);
    text-underline-offset: 0.18em;
    text-decoration-skip-ink: none;
  }

  .invalid-tag {
    position: absolute;
    right: 0.4em;
    bottom: calc(100% - 0.35em);
    padding: 0 0.35em;
    border-radius: 0.6em;
    background: var(--sheet-error-mark);
    color: var(--sheet-error-mark-text);
    font-size: 0.55em;
    font-weight: 600;
    line-height: 1.45;
  }

  .invalid-tag.left {
    right: auto;
    left: 0.6em;
  }

  :global(.hide-marks) .chord.invalid {
    background: none;
    text-decoration: none;
  }

  :global(.hide-marks) .invalid-tag {
    display: none;
  }

  @media print {
    .chord.invalid {
      background: none;
      text-decoration: none;
    }

    .invalid-tag {
      display: none;
    }
  }

  .beat {
    padding-right: 0.3em;
    font-weight: 400;
  }

  .simile {
    width: 1.1em;
    height: 1.1em;
    margin: 0 auto;
    fill: currentColor;
    align-self: center;
  }

  .ending {
    position: absolute;
    left: 0;
    right: 0;
    bottom: calc(100% + 0.2em);
    height: 1.15em;
    border-top: var(--thin) solid currentColor;
  }

  .ending-start {
    left: 0.15em;
    border-left: var(--thin) solid currentColor;
  }

  .ending-close {
    right: 0.5em;
    border-right: var(--thin) solid currentColor;
  }

  .ending-number {
    display: block;
    padding-left: 0.25em;
    font-size: 0.8em;
    font-weight: 600;
    line-height: 1.3;
  }

  .times {
    position: absolute;
    right: 0;
    bottom: calc(100% + 0.15em);
    padding: 0 0.15em;
    background: #fff;
    font-size: 0.85em;
    font-weight: 600;
    line-height: 1.2;
  }

  .notes {
    display: block;
    padding: 0.1em 0.5em 0;
    font-size: 0.8em;
    font-style: italic;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }
</style>
