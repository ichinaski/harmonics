<!--
  Harmonize: pick a tonic and a mode, see the scale on the piano
  (playable), the triads or 7th chords on each degree with roman numerals,
  function labels (major and minor) or the mode's characteristic chord,
  secondary dominants (with the tonic's V7 when the mode lacks it), and
  chords borrowed from the parallel modes, tagged "secondary" and
  "borrowed". Every chord is a compact ChordCard. Starts from session.harmonizeKey (set
  by "Open in Harmonize" links).
-->
<script lang="ts">
  import { MediaQuery } from 'svelte/reactivity';
  import { playArpeggio, playScale } from '../audio/engine';
  import { scaleArpeggioMidi, scalePlaybackMidi } from '../audio/playbackNotes';
  import ChordCard from '../components/ChordCard.svelte';
  import KeySelect from '../components/KeySelect.svelte';
  import Piano from '../components/Piano.svelte';
  import PlayButtons from '../components/PlayButtons.svelte';
  import QualityBadge from '../components/QualityBadge.svelte';
  import { session } from '../stores/session.svelte';
  import {
    chordName,
    diatonicChords,
    formatNote,
    getScaleType,
    keyName,
    keyNameWithEnharmonic,
    makeKey,
    pitchClass,
    spellInKey,
    type BorrowSource,
    type DegreeChord,
    type ModeId,
    type Note,
  } from '../theory';

  type ChordSize = 'triad' | 'seventh';

  const FUNCTION_LABELS = { tonic: 'tonic', subdominant: 'subdominant', dominant: 'dominant' } as const;
  /** Where the tonic's V7 comes from when the mode doesn't have it. */
  const DOMINANT_SOURCE_LABELS = { harmonicMinor: 'from harmonic minor', major: 'from the major scale' } as const;

  const initial = session.harmonizeKey;
  let tonic = $state<number | null>(initial ? pitchClass(initial.tonic) : 0);
  let mode = $state<ModeId>(initial?.mode ?? 'ionian');
  /** The tonic spelling from an "Open in Harmonize" link, kept until another tonic is picked. */
  let tonicSpelling = $state<Note | null>(initial?.tonic ?? null);
  let size = $state<ChordSize>('triad');
  let showMoreSources = $state(false);
  /** On phones the secondary dominants and borrowed chords start collapsed behind a disclosure header. */
  const narrow = new MediaQuery('max-width: 599px');
  let secondaryOpen = $state(false);
  let borrowedOpen = $state(false);
  let piano = $state<ReturnType<typeof Piano>>();

  const key = $derived(makeKey(tonic ?? 0, mode, tonicSpelling ?? undefined));
  const data = $derived(diatonicChords(key));
  const scaleType = $derived(getScaleType(mode));
  const scalePcs = $derived(data.scale.map(pitchClass));
  const commonSources = $derived(data.borrowed.filter((s) => s.common));
  const moreSources = $derived(data.borrowed.filter((s) => !s.common));
  const characteristic = $derived(data.characteristicDegree === null ? null : data.degrees[data.characteristicDegree - 1]!);
  const spell = (pc: number) => formatNote(spellInKey(pc, key));
  const interval = (name: string) => name.replace(/b/g, '♭').replace(/#/g, '♯');

  /** Keeps the key when switching tabs and coming back. */
  function remember(t: number | null, m: ModeId): void {
    if (tonicSpelling && pitchClass(tonicSpelling) !== t) tonicSpelling = null;
    session.harmonizeKey = makeKey(t ?? 0, m, tonicSpelling ?? undefined);
  }

  function playTheScale(): void {
    piano?.flash(playScale(scalePlaybackMidi(data.scale, 3)));
  }

  function playTonicArpeggio(): void {
    piano?.flash(playArpeggio(scaleArpeggioMidi(data.scale, 3)));
  }

  const borrowedCount = $derived(commonSources.reduce((n, s) => n + sourceChords(s).length, 0));

  function sourceChords(source: BorrowSource): { degree: number; chord: DegreeChord['chord']; numeral: string }[] {
    return size === 'triad' ? source.triads : source.sevenths;
  }
</script>

<!-- A section title; on phones a disclosure button with the number of chords inside. -->
{#snippet groupTitle(id: string, title: string, hint: string, count: number, open: boolean, toggle: () => void)}
  {#if narrow.current}
    <h2 id="{id}-title" class="group-title">
      <button type="button" class="disclosure" aria-expanded={open} aria-controls="{id}-content" onclick={toggle}>
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" class:open><path d="M4.5 3l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
        {title}
        <span class="count">{count}</span>
      </button>
      {#if open}<span class="group-hint">{hint}</span>{/if}
    </h2>
  {:else}
    <h2 id="{id}-title" class="group-title">
      {title}
      <span class="group-hint">{hint}</span>
    </h2>
  {/if}
{/snippet}

{#snippet borrowedSource(source: BorrowSource)}
  <div class="source">
    <h3 class="source-title">
      From {keyNameWithEnharmonic(source.key)}
      <QualityBadge family={getScaleType(source.key.mode).tonicTriad} />
    </h3>
    <div class="results">
      {#each sourceChords(source) as b (b.degree)}
        <ChordCard chord={b.chord} numeral={b.numeral} size="compact" tags={['borrowed']} />
      {/each}
    </div>
  </div>
{/snippet}

<section class="view" aria-labelledby="harmonize-title">
  <h1 id="harmonize-title" class="view-title">Harmonize</h1>

  <div class="card">
    <KeySelect bind:tonic bind:mode {tonicSpelling} onchange={remember} />
  </div>

  <div class="card scale">
    <div class="scale-head">
      <h2 class="label">Scale</h2>
      <PlayButtons label={keyName(key)} onplay={playTheScale} onarpeggio={playTonicArpeggio} />
    </div>

    <ol class="degrees" aria-label="{keyName(key)} scale">
      {#each data.scale as n, i (i)}
        <li class:tonic={i === 0}>
          <span class="degree-note">{formatNote(n)}</span>
          <span class="degree-interval">{interval(scaleType.intervals[i]!)}</span>
        </li>
      {/each}
    </ol>

    <Piano bind:this={piano} scale={scalePcs} tonic={pitchClass(key.tonic)} {spell} label="{keyName(key)} scale" playOnly />
  </div>

  <section class="group" aria-labelledby="degree-chords-title">
    <div class="group-head">
      <h2 id="degree-chords-title" class="group-title">
        Chords
        {#if characteristic}
          <span class="group-hint">{characteristic.triad.numeral} is the characteristic chord of {scaleType.name}</span>
        {/if}
      </h2>
      <div class="segmented" role="group" aria-label="Chord size">
        <button type="button" aria-pressed={size === 'triad'} onclick={() => (size = 'triad')}>Triads</button>
        <button type="button" aria-pressed={size === 'seventh'} onclick={() => (size = 'seventh')}>7th chords</button>
      </div>
    </div>
    <div class="results">
      {#each data.degrees as d (d.degree)}
        {@const c = size === 'triad' ? d.triad : d.seventh}
        <ChordCard
          chord={c.chord}
          numeral={c.numeral}
          size="compact"
          highlight={d.characteristic}
          tags={d.function ? [FUNCTION_LABELS[d.function]] : d.characteristic ? ['characteristic'] : []}
        />
      {/each}
    </div>
  </section>

  <section class="group" aria-labelledby="secondary-title">
    {@render groupTitle('secondary', 'Secondary dominants', 'V7 of each major and minor chord', data.secondaryDominants.length, secondaryOpen, () => (secondaryOpen = !secondaryOpen))}
    {#if !narrow.current || secondaryOpen}
      <div class="results" id="secondary-content">
        {#each data.secondaryDominants as s (s.numeral)}
          <ChordCard
            chord={s.chord}
            numeral={s.numeral}
            size="compact"
            tags={[
              'secondary',
              `resolves to ${chordName(s.target.triad.chord)}`,
              ...(s.source ? [DOMINANT_SOURCE_LABELS[s.source]] : []),
              ...(s.inKey ? ['in key'] : []),
            ]}
          />
        {/each}
      </div>
    {/if}
  </section>

  <section class="group" aria-labelledby="borrowed-title">
    {@render groupTitle('borrowed', 'Borrowed chords', `From parallel modes on ${formatNote(key.tonic)}`, borrowedCount, borrowedOpen, () => (borrowedOpen = !borrowedOpen))}
    {#if !narrow.current || borrowedOpen}
      <div class="borrowed-content" id="borrowed-content">
        {#each commonSources as source (source.key.mode)}
          {@render borrowedSource(source)}
        {/each}
        {#if showMoreSources}
          <div id="more-sources" class="more-sources">
            {#each moreSources as source (source.key.mode)}
              {@render borrowedSource(source)}
            {/each}
          </div>
        {/if}
        <button
          type="button"
          class="link-button more"
          aria-expanded={showMoreSources}
          aria-controls="more-sources"
          onclick={() => (showMoreSources = !showMoreSources)}
        >
          {showMoreSources ? 'Fewer sources' : `More sources (${moreSources.length})`}
        </button>
      </div>
    {/if}
  </section>
</section>

<style>
  .scale {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
  }

  .scale-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .label {
    color: var(--text-muted);
    font-size: 0.8125rem;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .degrees {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .degrees li {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--space-1) 0;
    border-radius: var(--radius-sm);
    background: var(--bg);
  }

  .degrees li.tonic {
    background: var(--accent-soft);
  }

  .degree-note {
    font-weight: var(--font-weight-semibold);
  }

  .degree-interval {
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .group-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  /* The segmented track would vanish on the page background. */
  .group-head .segmented {
    box-shadow: inset 0 0 0 1px var(--divider);
  }

  .group-title {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: var(--space-2);
    font-size: var(--font-size);
  }

  .group > .group-title {
    margin-top: var(--space-2);
  }

  .borrowed-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .disclosure {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--touch-target);
    margin-left: calc(-1 * var(--space-2));
    padding: 0 var(--space-2);
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    font: inherit;
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
  }

  .disclosure:hover {
    background: var(--surface);
  }

  .disclosure svg {
    color: var(--text-muted);
    transition: transform var(--duration) var(--easing);
  }

  .disclosure svg.open {
    transform: rotate(90deg);
  }

  .count {
    min-width: 22px;
    padding: 0 6px;
    border-radius: var(--radius-pill);
    background: var(--surface);
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: var(--font-weight-regular);
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
    grid-template-columns: repeat(auto-fill, minmax(min(150px, calc(50% - var(--space-3) / 2)), 1fr));
    gap: var(--space-3);
  }

  .source,
  .more-sources {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .more-sources {
    gap: var(--space-3);
  }

  .source-title {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--text-muted);
    font-size: var(--font-size-sm);
  }

  .more {
    align-self: center;
  }
</style>
