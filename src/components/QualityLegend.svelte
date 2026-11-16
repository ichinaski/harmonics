<!--
  The chord quality color key, shown once (above the chord finder results):
  a small "Colors" disclosure button with the seven family colors as dots,
  which expands to each family's badge and a few example chords.
-->
<script lang="ts">
  import { QUALITY_FAMILIES, type QualityFamily } from '../theory';
  import QualityBadge from './QualityBadge.svelte';

  const EXAMPLES: Record<QualityFamily, string> = {
    major: 'C, Cmaj7, C6, Cadd9',
    minor: 'Cm, Cm7, Cm6',
    dominant: 'C7, C9, C7♭9, C13',
    diminished: 'C°, C°7, Cm7♭5',
    augmented: 'Caug, C+7',
    suspended: 'Csus2, Csus4, C7sus4',
    power: 'C5',
  };

  let open = $state(false);
</script>

<div class="legend">
  <button type="button" class="link-button toggle" aria-expanded={open} aria-controls="quality-legend" onclick={() => (open = !open)}>
    <span class="dots" aria-hidden="true">
      {#each QUALITY_FAMILIES as f (f)}<span class="dot" style:background="var(--q-{f}-edge)"></span>{/each}
    </span>
    Colors
  </button>
  {#if open}
    <ul id="quality-legend" class="list" aria-label="Chord quality colors">
      {#each QUALITY_FAMILIES as f (f)}
        <li>
          <QualityBadge family={f} />
          <span class="examples chord-symbol">{EXAMPLES[f]}</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .legend {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-2);
    margin-bottom: calc(-1 * var(--space-2));
  }

  .toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  .dots {
    display: inline-flex;
    gap: 2px;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
    gap: var(--space-2) var(--space-4);
    width: 100%;
    margin: 0;
    padding: var(--space-4);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow);
    list-style: none;
  }

  li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .examples {
    color: var(--text-muted);
    font-size: var(--font-size-sm);
  }
</style>
