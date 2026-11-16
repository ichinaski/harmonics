<!--
  Scale finder: select melody notes (piano or note names) and optionally a
  tonic, and see the scales that contain them, exact first, then by fewest
  extra notes. Without a tonic, scales that share their notes (the 7 modes of
  one major scale, major and relative minor pentatonic) are grouped. Each
  scale plays from its Play and Arpeggio buttons; modes link to the Harmonize tab.
-->
<script lang="ts">
  import NoteInput from '../components/NoteInput.svelte';
  import PitchClassPicker from '../components/PitchClassPicker.svelte';
  import ScaleCard from '../components/ScaleCard.svelte';
  import { openInHarmonize, session } from '../stores/session.svelte';
  import {
    defaultSpelling,
    findScaleGroups,
    findScales,
    formatNote,
    mod12,
    scaleName,
    type Key,
    type ScaleGroup,
  } from '../theory';

  const PAGE_SIZE = 8;

  // Inputs start from the session, so they survive switching tabs.
  let notes = $state<number[]>([...session.scaleFinder.notes]);
  let tonic = $state<number | null>(session.scaleFinder.tonic);

  $effect(() => {
    session.scaleFinder = { notes: [...notes], tonic };
  });
  let shown = $state(PAGE_SIZE);

  /** Selected pitch classes, lowest note first. */
  const pcs = $derived([...new Set([...notes].sort((a, b) => a - b).map(mod12))]);

  const results = $derived<ScaleGroup[]>(
    pcs.length === 0
      ? []
      : tonic === null
        ? findScaleGroups(pcs)
        : findScales(pcs, { tonic: defaultSpelling(tonic) }).map((m) => ({
            name: scaleName(m.tonic, m.scale),
            matches: [m],
            exact: m.exact,
            extraCount: m.extra.length,
          })),
  );

  // A new search starts with the list collapsed.
  $effect(() => {
    void results;
    shown = PAGE_SIZE;
  });

  const spell = (pc: number) => formatNote(defaultSpelling(pc));

  /** The Harmonize tab keeps the result's tonic spelling (E♭ Phrygian stays E♭). */
  function open(key: Key): void {
    openInHarmonize(key);
  }
</script>

<section class="view" aria-labelledby="scales-title">
  <h1 id="scales-title" class="view-title">Scale finder</h1>

  <div class="card">
    <NoteInput bind:notes bassMarking={false} {spell} label="Melody notes" />
  </div>

  <div class="card options">
    <div class="filter-head">
      <h2 class="label">Tonic</h2>
      <button type="button" class="link-button" aria-pressed={tonic === null} onclick={() => (tonic = null)}>Any</button>
    </div>
    <PitchClassPicker selected={tonic === null ? [] : [tonic]} ontoggle={(pc) => (tonic = tonic === pc ? null : pc)} {spell} label="Tonic" />
  </div>

  {#if pcs.length === 0}
    <div class="card empty-state">
      <p class="empty-title">Select the notes of your melody</p>
      <p class="empty-hint">Scales that contain every note show up here. Set a tonic if you know where the melody feels at home.</p>
    </div>
  {:else if results.length === 0}
    <div class="card empty-state">
      <p class="empty-title">No scale has all these notes</p>
      <p class="empty-hint">
        {#if tonic !== null}
          Nothing fits on {spell(tonic)}.
          <button type="button" class="link-button" onclick={() => (tonic = null)}>Try any tonic</button>
        {:else}
          Try removing a note.
        {/if}
      </p>
    </div>
  {:else}
    <section class="group" aria-labelledby="scale-results-title">
      <h2 id="scale-results-title" class="group-title">
        Scales
        <span class="count">{results.length}</span>
        <span class="group-hint">{tonic === null ? 'Grouped by shared notes, lowest note’s scale first' : `On ${spell(tonic)}`}</span>
      </h2>
      <div class="results">
        {#each results.slice(0, shown) as g (g.name)}
          <ScaleCard title={g.name} matches={g.matches} exact={g.exact} extraCount={g.extraCount} onopen={open} />
        {/each}
      </div>
      {#if results.length > shown}
        <button type="button" class="link-button more" onclick={() => (shown = results.length)}>Show {results.length - shown} more</button>
      {/if}
    </section>
  {/if}
</section>

<style>
  .options {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-4);
  }

  .filter-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .label {
    color: var(--text-muted);
    font-size: 0.8125rem;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .filter-head .link-button[aria-pressed='true'] {
    background: var(--accent-soft);
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .group-title {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-2);
    font-size: var(--font-size);
  }

  .count {
    min-width: 22px;
    padding: 0 6px;
    border-radius: var(--radius-pill);
    background: var(--surface);
    color: var(--text-muted);
    font-size: 0.75rem;
    text-align: center;
    line-height: 20px;
  }

  .group-hint {
    color: var(--text-muted);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-regular);
  }

  .results {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-3);
    align-items: start;
  }

  .more {
    align-self: center;
  }

  .empty-hint .link-button {
    margin-left: var(--space-1);
  }
</style>
