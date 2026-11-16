<!--
  The Chords tab, both ways: Find chord (notes to chord, #/chords) and Chord
  notes (chord to notes, #/chords/notes), with a switch at the top. Each side
  keeps its own inputs in the session store; the route picks the side.
-->
<script lang="ts">
  import type { ChordsSide } from '../stores/session.svelte';
  import ChordFinder from './ChordFinder.svelte';
  import ChordNotes from './ChordNotes.svelte';

  interface Props {
    side: ChordsSide;
  }

  let { side }: Props = $props();

  const SIDES: readonly { id: ChordsSide; label: string; hash: string }[] = [
    { id: 'find', label: 'Find chord', hash: '#/chords' },
    { id: 'notes', label: 'Chord notes', hash: '#/chords/notes' },
  ];
</script>

<section class="view" aria-labelledby="chords-title">
  <div class="head">
    <h1 id="chords-title" class="view-title">Chords</h1>
    <div class="segmented side-switch" role="group" aria-label="Direction">
      {#each SIDES as s (s.id)}
        <button type="button" aria-pressed={side === s.id} onclick={() => (location.hash = s.hash)}>{s.label}</button>
      {/each}
    </div>
  </div>

  {#if side === 'find'}
    <ChordFinder />
  {:else}
    <ChordNotes />
  {/if}
</section>

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-3);
  }

  /* The track would vanish on the page background. */
  .side-switch {
    flex-wrap: nowrap;
    box-shadow: inset 0 0 0 1px var(--divider);
  }

  .side-switch > button {
    min-height: 36px;
    padding: 0 var(--space-4);
  }

  @media (pointer: coarse) {
    .side-switch > button {
      min-height: 40px;
    }
  }
</style>
