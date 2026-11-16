<!--
  Header sound controls: the instrument selector (there is no global sound
  switch; piano key sounds have their own toggle on the piano widget). While a
  sampled instrument downloads, a spinner replaces the selector's chevron (the
  synth plays meanwhile); if it fails, a small notice says the synth is
  standing in, with a Retry button.
-->
<script lang="ts">
  import { MediaQuery } from 'svelte/reactivity';
  import { INSTRUMENTS, instrumentInfo, isInstrumentId } from '../audio/engine';
  import { settings } from '../stores/settings.svelte';

  /** Below 400 px the selector shows short instrument names, so the header fits at 320 px. */
  const narrow = new MediaQuery('max-width: 400px');

  const loading = $derived(settings.instrumentStatus === 'loading');
  const failed = $derived(settings.instrumentStatus === 'failed');
  let dismissed = $state(false);

  // A new failure (or a retry) shows the notice again.
  $effect(() => {
    void settings.instrumentStatus;
    void settings.instrument;
    dismissed = false;
  });

  function onInstrumentChange(event: Event): void {
    const value = (event.currentTarget as HTMLSelectElement).value;
    if (isInstrumentId(value)) settings.setInstrument(value);
  }
</script>

<div class="sound-controls">
  <label class="visually-hidden" for="instrument-select">Instrument</label>
  <div class="select-box" class:loading>
    <select
      id="instrument-select"
      class="instrument"
      value={settings.instrument}
      onchange={onInstrumentChange}
      aria-busy={loading}
      aria-describedby="instrument-status"
    >
      {#each INSTRUMENTS as inst (inst.id)}
        <option value={inst.id} aria-label={inst.label}>{narrow.current ? inst.shortLabel : inst.label}</option>
      {/each}
    </select>
    {#if loading}<span class="spinner" aria-hidden="true"></span>{/if}
  </div>

  <p id="instrument-status" class="status" class:shown={failed && !dismissed} role="status">
    {#if loading}
      Loading {instrumentInfo(settings.instrument).label.toLowerCase()} samples, the synth plays meanwhile
    {:else if failed}
      Couldn’t load the {instrumentInfo(settings.instrument).label.toLowerCase()}, using the synth
      {#if !dismissed}
        <button type="button" class="retry" onclick={() => settings.retryInstrument()}>Retry</button>
        <button type="button" class="dismiss" aria-label="Dismiss" onclick={() => (dismissed = true)}>×</button>
      {/if}
    {/if}
  </p>
</div>

<style>
  .sound-controls {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .select-box {
    position: relative;
    display: flex;
  }

  .spinner {
    position: absolute;
    top: 50%;
    right: 9px;
    width: 14px;
    height: 14px;
    margin-top: -7px;
    border: 2px solid var(--divider);
    border-top-color: var(--accent-text);
    border-radius: 50%;
    background: var(--surface);
    animation: spin 0.8s linear infinite;
    pointer-events: none;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* The failure notice hangs below the controls so the header keeps its height. */
  .status {
    position: absolute;
    top: calc(100% + var(--space-1));
    right: 0;
    width: max-content;
    max-width: min(18rem, calc(100vw - 2 * var(--space-4)));
    margin: 0;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--surface);
    box-shadow: var(--shadow);
    color: var(--text-muted);
    font-size: 0.8125rem;
  }

  .retry {
    margin-left: var(--space-1);
    padding: 0 var(--space-1);
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--accent-text);
    font: inherit;
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
  }

  .retry:hover {
    background: var(--accent-soft);
  }

  .dismiss {
    margin-left: var(--space-1);
    padding: 0 var(--space-1);
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  /* Still read out while loading, but only shown on failure. */
  .status:not(.shown) {
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .instrument {
    min-height: 36px;
    max-width: 10.5rem;
    padding: 0 var(--space-6) 0 var(--space-3);
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--surface)
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5l3 3 3-3' fill='none' stroke='%2364748b' stroke-width='1.6' stroke-linecap='round'/%3E%3C/svg%3E")
      no-repeat right 10px center;
    box-shadow: inset 0 0 0 1px var(--divider);
    color: var(--text);
    font: inherit;
    font-size: var(--font-size-sm);
    appearance: none;
    -webkit-appearance: none;
    cursor: pointer;
  }

  @media (max-width: 640px) {
    .instrument {
      max-width: 9rem;
    }
  }
</style>
