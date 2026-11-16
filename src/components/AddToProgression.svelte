<!--
  "Add to progression": appends a chord (with its bass) to the Key finder
  progression, then shows a short confirmation next to the button with a
  "View" link to the Key tab. The confirmation is a polite live region, so
  screen readers announce it, and it fades after a few seconds.
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { addToProgression } from '../stores/session.svelte';
  import { chordName, type Chord } from '../theory';

  interface Props {
    chord: Chord;
  }

  let { chord }: Props = $props();

  const CONFIRMATION_MS = 6000;

  const name = $derived(chordName(chord));
  /** How many times the chord was added while the confirmation shows; a new count re-renders it, so it's announced again. */
  let added = $state(0);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function add(): void {
    addToProgression(chord);
    added += 1;
    clearTimeout(timer);
    timer = setTimeout(() => (added = 0), CONFIRMATION_MS);
  }

  onDestroy(() => clearTimeout(timer));
</script>

<span class="add-to-progression">
  <button type="button" class="link-button add" onclick={add} title="Add {name} to the Key finder progression">
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
    Add to progression
  </button>
  <span class="status" role="status" aria-live="polite">
    {#if added}
      {#key added}
        <span class="added">
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
          Added<span class="visually-hidden"> {name} to the progression{added > 1 ? ` (${added} times)` : ''}.</span>
        </span>
        <a class="view" href="#/key">View<span class="visually-hidden"> the progression in the Key tab</span></a>
      {/key}
    {/if}
  </span>
</span>

<style>
  .add-to-progression {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0 var(--space-2);
    margin-left: calc(-1 * var(--space-2));
  }

  .add {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    white-space: nowrap;
  }

  .status {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 0.8125rem;
  }

  .status:empty {
    display: none;
  }

  .added {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--text-muted);
    animation: added-in var(--duration) var(--easing);
  }

  .view {
    color: var(--accent-text);
    font-weight: var(--font-weight-semibold);
  }

  @keyframes added-in {
    from {
      transform: translateY(2px);
    }
  }
</style>
