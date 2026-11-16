<!--
  12 pitch class buttons (C to B). The parent owns the selection: `selected`
  in, `ontoggle(pc)` out, so it works for multi-select note input and for
  single-choice rows such as a chord root. One tab stop; the arrow keys move
  between the buttons, Home and End jump to C and B.
-->
<script lang="ts">
  import { defaultSpelling, formatNote } from '../theory';
  import { rovingTarget } from './rovingFocus';

  interface Props {
    selected?: readonly number[];
    /** Pitch class marked as bass. */
    bass?: number | null;
    ontoggle: (pc: number) => void;
    spell?: (pc: number) => string;
    label?: string;
    /** 'grid' is a 6 x 2 grid on narrow screens and one row when wide; 'row' always wraps in one line. */
    layout?: 'grid' | 'row';
  }

  let {
    selected = [],
    bass = null,
    ontoggle,
    spell = (pc: number) => formatNote(defaultSpelling(pc)),
    label = 'Notes',
    layout = 'grid',
  }: Props = $props();

  const PCS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const BLACK = new Set([1, 3, 6, 8, 10]);

  let group = $state<HTMLDivElement>();
  let focusPc = $state<number | null>(null);
  const tabStop = $derived(focusPc ?? selected[0] ?? 0);

  function onKeydown(event: KeyboardEvent): void {
    const target = rovingTarget(event.key, tabStop, PCS.length);
    if (target === null) return;
    event.preventDefault();
    focusPc = Math.max(0, Math.min(PCS.length - 1, target));
    group?.querySelectorAll<HTMLButtonElement>('button')[focusPc]?.focus();
  }
</script>

<div class="pcs {layout}" role="group" aria-label={label} bind:this={group}>
  {#each PCS as pc (pc)}
    <button
      type="button"
      class="pc"
      class:black={BLACK.has(pc)}
      class:selected={selected.includes(pc)}
      aria-pressed={selected.includes(pc)}
      aria-label="{spell(pc)}{bass === pc ? ', bass' : ''}"
      tabindex={pc === tabStop ? 0 : -1}
      onfocus={() => (focusPc = pc)}
      onkeydown={onKeydown}
      onclick={() => ontoggle(pc)}
    >
      {spell(pc)}
      {#if bass === pc}<span class="bass" aria-hidden="true"></span>{/if}
    </button>
  {/each}
</div>

<style>
  .pcs {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: var(--space-1);
  }

  .pcs.row {
    display: flex;
    flex-wrap: wrap;
  }

  @media (max-width: 560px) {
    .pcs.grid {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }
  }

  .pc {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--touch-target);
    min-height: var(--touch-target);
    padding: 0 var(--space-2);
    border: 0;
    border-radius: var(--radius-sm);
    background: var(--surface-muted);
    box-shadow: inset 0 0 0 1px var(--divider);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    transition:
      background-color var(--duration) var(--easing),
      color var(--duration) var(--easing);
  }

  .grid .pc {
    min-width: 0;
  }

  .pc.black {
    background: var(--bg);
  }

  .pc:hover {
    box-shadow: inset 0 0 0 1px var(--accent-text);
  }

  .pc.selected {
    background: var(--accent);
    color: var(--accent-contrast);
    box-shadow: none;
  }

  .bass {
    position: absolute;
    bottom: 6px;
    left: 50%;
    width: 6px;
    height: 6px;
    margin-left: -3px;
    border-radius: 50%;
    background: currentColor;
  }
</style>
