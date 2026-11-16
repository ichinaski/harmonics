<!--
  Find chord, one side of the Chords tab: select notes (piano or note names),
  optionally mark a bass (in piano mode the lowest note is the bass unless
  one is pinned), and see the chords that fit, grouped as exact, exact with
  one omission, and contains. Exact mode shows only the exact group. With a
  root and a quality family set and fewer than 2 notes, it lists that root's
  chords instead. Each result is a full ChordCard, named and voiced as the
  inversion or slash chord when a bass is set, with the inversion tag, and
  with a key the roman numeral (and the function in major and minor). Each
  card can add its chord to the Key finder progression.
-->
<script lang="ts">
  import AddToProgression from '../components/AddToProgression.svelte';
  import ChordCard, { type CardNote } from '../components/ChordCard.svelte';
  import KeySelect from '../components/KeySelect.svelte';
  import NoteInput from '../components/NoteInput.svelte';
  import PitchClassPicker from '../components/PitchClassPicker.svelte';
  import QualityLegend from '../components/QualityLegend.svelte';
  import { session } from '../stores/session.svelte';
  import {
    MIN_MATCH_NOTES,
    QUALITY_FAMILIES,
    chordFitsKey,
    chordFunction,
    chordName,
    chordNotes,
    chordsForRootAndFamily,
    defaultSpelling,
    findChords,
    formatNote,
    inversionName,
    keyName,
    makeKey,
    mod12,
    pitchClass,
    romanNumeral,
    spellInKey,
    type Chord,
    type ChordMatch,
    type MatchGroup,
    type MatchMode,
    type ModeId,
    type QualityFamily,
  } from '../theory';

  const PAGE_SIZE = 20;
  const GROUPS: readonly { id: MatchGroup; title: string; hint: string }[] = [
    { id: 'exact', title: 'Exact', hint: 'Exactly your notes' },
    { id: 'omitted', title: 'With one omission', hint: 'One common tone left out' },
    { id: 'contains', title: 'Contains', hint: 'Your notes plus others' },
  ];
  const OMITTED_TAG: Record<string, string> = { '1': 'rootless', '5': 'no 5th', '9': 'no 9th' };

  // Inputs start from the session, so they survive switching tabs.
  const saved = session.chordFinder;
  let notes = $state<number[]>([...saved.notes]);
  let bass = $state<number | null>(saved.bass);
  let matchMode = $state<MatchMode>(saved.matchMode);
  let extended = $state(saved.extended);
  let root = $state<number | null>(saved.root);
  let family = $state<QualityFamily | null>(saved.family);
  let keyTonic = $state<number | null>(saved.keyTonic);
  let keyMode = $state<ModeId>(saved.keyMode);

  $effect(() => {
    session.chordFinder = { notes: [...notes], bass, matchMode, extended, root, family, keyTonic, keyMode };
  });
  /** Piano keys or note names; in piano mode the lowest note is the bass unless one is pinned. */
  let inputMode = $state<'piano' | 'pcs'>('piano');
  let showFilters = $state(false);
  let shown = $state<Record<MatchGroup, number>>({ exact: PAGE_SIZE, omitted: PAGE_SIZE, contains: PAGE_SIZE });

  const key = $derived(keyTonic === null ? null : makeKey(keyTonic, keyMode));
  const spell = (pc: number) => formatNote(key ? spellInKey(pc, key) : defaultSpelling(pc));

  /** Selected pitch classes, lowest note first. */
  const pcs = $derived([...new Set([...notes].sort((a, b) => a - b).map(mod12))]);
  /** The pinned bass, or in piano mode the lowest note. */
  const effectiveBass = $derived(bass ?? (inputMode === 'piano' ? (pcs[0] ?? null) : null));

  const matches = $derived(
    pcs.length >= MIN_MATCH_NOTES ? findChords(pcs, { bass: effectiveBass, root, family, extended, key, mode: matchMode }) : [],
  );
  const grouped = $derived(
    GROUPS.map((g) => ({ ...g, items: matches.filter((m) => m.group === g.id) })).filter((g) => g.items.length > 0),
  );
  const browseList = $derived(
    pcs.length < MIN_MATCH_NOTES && root !== null && family !== null ? chordsForRootAndFamily(root, family, { extended, key }) : null,
  );
  const activeFilters = $derived(
    [
      root !== null ? `Root ${spell(root)}` : null,
      family !== null ? family[0]!.toUpperCase() + family.slice(1) : null,
      key ? keyName(key) : null,
    ].filter((f): f is string => f !== null),
  );

  // A new search starts with collapsed groups.
  $effect(() => {
    void matches;
    shown = { exact: PAGE_SIZE, omitted: PAGE_SIZE, contains: PAGE_SIZE };
  });

  function cardNotes(m: ChordMatch): CardNote[] {
    return m.notes.map((n) => ({ note: n.note, state: matchMode === 'partial' ? n.state : 'plain' }));
  }

  /** The function in a major or minor key ('tonic'), then 'diatonic'. */
  function keyTags(chord: Chord): string[] {
    if (!key) return [];
    const fn = chordFunction(chord, key);
    return [...(fn ? [fn] : []), ...(chordFitsKey(chord, key) ? ['diatonic'] : [])];
  }

  function tags(m: ChordMatch): string[] {
    const out: string[] = [];
    if (m.omitted) out.push(OMITTED_TAG[m.omitted] ?? `no ${m.omitted}`);
    // The same read-only inversion tag as Chord notes, whenever there is a bass.
    if (effectiveBass !== null) out.push(inversionName(m.chord));
    out.push(...keyTags(m.chord));
    return out;
  }

  function browseNotes(chord: Chord): CardNote[] {
    return chordNotes(chord).map((note) => ({ note, state: pcs.includes(pitchClass(note)) ? 'selected' : 'plain' }));
  }

  function clearFilters(): void {
    root = null;
    family = null;
    keyTonic = null;
  }
</script>

<div class="view">

  <div class="card">
    <NoteInput bind:notes bind:bass bind:inputMode autoBass {spell} label="Notes" />
  </div>

  <div class="card options">
    <div class="option-row">
      <div class="segmented" role="group" aria-label="Match mode">
        <button type="button" aria-pressed={matchMode === 'exact'} onclick={() => (matchMode = 'exact')}>Exact</button>
        <button type="button" aria-pressed={matchMode === 'partial'} onclick={() => (matchMode = 'partial')}>Partial</button>
      </div>
      <button type="button" class="toggle-chip" aria-pressed={extended} onclick={() => (extended = !extended)}>Extended chords</button>
      <button
        type="button"
        class="filters-toggle"
        aria-expanded={showFilters}
        aria-controls="chord-filters"
        onclick={() => (showFilters = !showFilters)}
      >
        Filters{activeFilters.length ? ` (${activeFilters.length})` : ''}
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" class:open={showFilters}><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
      </button>
    </div>

    {#if activeFilters.length && !showFilters}
      <p class="filter-summary">
        <span class="muted">{activeFilters.join(' · ')}</span>
        <button type="button" class="link-button" onclick={clearFilters}>Clear filters</button>
      </p>
    {/if}

    {#if showFilters}
      <div class="filters" id="chord-filters">
        <div class="filter">
          <div class="filter-head">
            <h2 class="filter-label">Root</h2>
            <button type="button" class="link-button" aria-pressed={root === null} onclick={() => (root = null)}>Any</button>
          </div>
          <PitchClassPicker selected={root === null ? [] : [root]} ontoggle={(pc) => (root = root === pc ? null : pc)} {spell} label="Root" />
        </div>

        <div class="filter">
          <div class="filter-head">
            <h2 class="filter-label">Quality</h2>
            <button type="button" class="link-button" aria-pressed={family === null} onclick={() => (family = null)}>Any</button>
          </div>
          <div class="families" role="group" aria-label="Quality">
            {#each QUALITY_FAMILIES as f (f)}
              <button
                type="button"
                class="family"
                aria-pressed={family === f}
                style:--dot="var(--q-{f}-edge)"
                onclick={() => (family = family === f ? null : f)}>{f}</button
              >
            {/each}
          </div>
        </div>

        <div class="filter">
          <h2 class="filter-label">Key</h2>
          <KeySelect bind:tonic={keyTonic} bind:mode={keyMode} optional />
        </div>

        {#if activeFilters.length}
          <button type="button" class="link-button clear" onclick={clearFilters}>Clear filters</button>
        {/if}
      </div>
    {/if}
  </div>

  {#if browseList || (pcs.length >= MIN_MATCH_NOTES && grouped.length > 0)}
    <QualityLegend />
  {/if}

  {#if browseList}
    <section class="group" aria-labelledby="browse-title">
      <h2 id="browse-title" class="group-title">{spell(root!)} {family} chords</h2>
      <div class="results">
        {#each browseList as chord (chordName(chord))}
          <ChordCard {chord} numeral={key ? romanNumeral(chord, key) : undefined} notes={browseNotes(chord)} tags={keyTags(chord)}>
            {#snippet actions()}<AddToProgression {chord} />{/snippet}
          </ChordCard>
        {/each}
      </div>
    </section>
  {:else if pcs.length < MIN_MATCH_NOTES}
    <div class="card empty-state">
      <p class="empty-title">{pcs.length === 0 ? 'Select the notes you hear' : 'Select one more note'}</p>
      <p class="empty-hint">Chords need at least two notes. To browse instead, set a root and a quality in Filters.</p>
    </div>
  {:else if grouped.length === 0}
    <div class="card empty-state">
      <p class="empty-title">No chords match</p>
      <p class="empty-hint">
        {#if matchMode === 'exact'}
          No chord has exactly these notes.
          <button type="button" class="link-button" onclick={() => (matchMode = 'partial')}>Show partial matches</button>
        {:else if activeFilters.length}
          Nothing fits with these filters.
          <button type="button" class="link-button" onclick={clearFilters}>Clear filters</button>
        {:else if !extended}
          Try turning on extended chords.
        {:else}
          Try removing a note.
        {/if}
      </p>
    </div>
  {:else}
    {#each grouped as g (g.id)}
      <section class="group" aria-labelledby="group-{g.id}">
        <h2 id="group-{g.id}" class="group-title">
          {g.title}
          <span class="count">{g.items.length}</span>
          <span class="group-hint">{g.hint}</span>
        </h2>
        <div class="results">
          {#each g.items.slice(0, shown[g.id]) as m (chordName(m.chord))}
            <ChordCard
              chord={m.chord}
              numeral={key ? romanNumeral(m.chord, key) : undefined}
              alternates={m.alternates.map((c) => chordName(c))}
              notes={cardNotes(m)}
              score={m.score}
              tags={tags(m)}
            >
              {#snippet actions()}<AddToProgression chord={m.chord} />{/snippet}
            </ChordCard>
          {/each}
        </div>
        {#if g.items.length > shown[g.id]}
          <button type="button" class="link-button more" onclick={() => (shown[g.id] = g.items.length)}>
            Show {g.items.length - shown[g.id]} more
          </button>
        {/if}
      </section>
    {/each}
  {/if}
</div>

<style>
  .options {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
  }

  .option-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-3);
  }

  /* The three options share one look: 36 px pills on the muted surface with a hairline ring. */
  .option-row .segmented {
    padding: 2px;
    background: var(--surface-muted);
    box-shadow: inset 0 0 0 1px var(--divider);
  }

  .option-row .segmented > button {
    min-height: 32px;
  }

  .filters-toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-height: 36px;
    margin-left: auto;
    padding: 0 var(--space-3);
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--surface-muted);
    box-shadow: inset 0 0 0 1px var(--divider);
    color: var(--text-muted);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    transition:
      background-color var(--duration) var(--easing),
      color var(--duration) var(--easing);
  }

  .filters-toggle:hover {
    color: var(--text);
  }

  .filters-toggle[aria-expanded='true'] {
    background: var(--accent-soft);
    box-shadow: none;
    color: var(--accent-text);
  }

  .filters-toggle svg {
    transition: transform var(--duration) var(--easing);
  }

  .filters-toggle svg.open {
    transform: rotate(180deg);
  }

  .filter-summary {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
    font-size: var(--font-size-sm);
  }

  .filters {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    padding-top: var(--space-3);
    border-top: 1px solid var(--divider);
  }

  .filter {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .filter-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .filter-label {
    color: var(--text-muted);
    font-size: 0.8125rem;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .filter-head .link-button[aria-pressed='true'] {
    background: var(--accent-soft);
  }

  .families {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .family {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 40px;
    padding: 0 var(--space-3);
    border: 0;
    border-radius: var(--radius-sm);
    background: var(--surface-muted);
    box-shadow: inset 0 0 0 1px var(--divider);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    text-transform: capitalize;
    cursor: pointer;
  }

  .family::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--dot);
  }

  .family:hover {
    box-shadow: inset 0 0 0 1px var(--accent-text);
  }

  .family[aria-pressed='true'] {
    background: var(--accent-soft);
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  .clear {
    align-self: flex-start;
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
    grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr));
    gap: var(--space-3);
  }

  .more {
    align-self: center;
  }

  .empty-hint .link-button {
    margin-left: var(--space-1);
  }
</style>
