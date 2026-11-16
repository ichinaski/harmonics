<!--
  Key picker: a tonic (12 buttons, spelled for the chosen mode with the fewest
  accidentals, so G♯ minor but A♭ major) and a mode, each tagged by its tonic
  triad (major, minor, diminished). With `optional`, a "No key" choice sets
  the tonic to null; then no mode shows as selected either, so the title
  ("No key") matches what is highlighted. A mode picked without a tonic is
  kept for when one is picked.
-->
<script lang="ts">
  import {
    MODE_IDS,
    formatNote,
    getScaleType,
    keyName,
    keyTonicSpelling,
    makeKey,
    type ModeId,
    type Note,
  } from '../theory';
  import PitchClassPicker from './PitchClassPicker.svelte';
  import QualityBadge from './QualityBadge.svelte';

  interface Props {
    /** Tonic pitch class, or null for no key (only with `optional`). */
    tonic?: number | null;
    mode?: ModeId;
    modes?: readonly ModeId[];
    optional?: boolean;
    /** A spelling of the tonic to keep while its key isn't theoretical (E♭ Phrygian from an "Open in Harmonize" link). */
    tonicSpelling?: Note | null;
    onchange?: (tonic: number | null, mode: ModeId) => void;
  }

  let {
    tonic = $bindable(0),
    mode = $bindable('ionian'),
    modes = MODE_IDS,
    optional = false,
    tonicSpelling = null,
    onchange,
  }: Props = $props();

  const title = $derived(tonic === null ? 'No key' : keyName(makeKey(tonic, mode, tonicSpelling ?? undefined)));

  function setTonic(pc: number | null): void {
    tonic = optional && pc === tonic ? null : pc;
    onchange?.(tonic, mode);
  }

  function setMode(id: ModeId): void {
    mode = id;
    onchange?.(tonic, mode);
  }
</script>

<div class="key-select">
  <p class="key-name chord-symbol" aria-live="polite">{title}</p>

  <PitchClassPicker
    selected={tonic === null ? [] : [tonic]}
    ontoggle={setTonic}
    spell={(pc) => formatNote(keyTonicSpelling(pc, mode, tonicSpelling ?? undefined))}
    label="Tonic"
  />
  {#if optional}
    <button type="button" class="link-button none" aria-pressed={tonic === null} onclick={() => setTonic(null)}>No key</button>
  {/if}

  <div class="modes" role="group" aria-label="Mode">
    {#each modes as id (id)}
      {@const scale = getScaleType(id)}
      <button type="button" class="mode" aria-pressed={tonic !== null && mode === id} onclick={() => setMode(id)}>
        <span class="mode-name">
          {scale.name}
          {#if scale.commonName}<span class="common">{scale.commonName}</span>{/if}
        </span>
        <QualityBadge family={scale.tonicTriad} />
      </button>
    {/each}
  </div>
</div>

<style>
  .key-select {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .none {
    align-self: flex-start;
  }

  .none[aria-pressed='true'] {
    background: var(--accent-soft);
  }

  .modes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-1);
  }

  .mode {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    min-height: var(--touch-target);
    padding: 0 var(--space-2) 0 var(--space-3);
    border: 0;
    border-radius: var(--radius-sm);
    background: var(--surface-muted);
    box-shadow: inset 0 0 0 1px var(--divider);
    text-align: left;
    cursor: pointer;
    transition:
      background-color var(--duration) var(--easing),
      box-shadow var(--duration) var(--easing);
  }

  .mode:hover {
    box-shadow: inset 0 0 0 1px var(--accent-text);
  }

  .mode[aria-pressed='true'] {
    background: var(--accent-soft);
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  .mode-name {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0 var(--space-2);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
  }

  .common {
    color: var(--text-muted);
    font-size: 0.8125rem;
    font-weight: var(--font-weight-regular);
  }

  .mode[aria-pressed='true'] .common {
    color: var(--text);
  }
</style>
