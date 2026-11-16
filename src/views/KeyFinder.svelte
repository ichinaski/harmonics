<!--
  Key finder: enter chords (picker with a Bass row, or the text box), see
  every candidate key ranked. Each key is a short summary: the progression as
  roman numeral chips colored by quality (chords outside the key get a small
  dot, and a count says what they are; a slash chord read as the chord on its
  bass, F/G as G9sus4, takes that chord's color), and a Details disclosure with a
  compact ChordCard per distinct chord, numeral and explanation. The top key
  starts open. Chips play when tapped; Play progression plays them in order,
  highlighting the current chip. Each key links to the Harmonize tab.
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { playProgression, type ProgressionHandle } from '../audio/engine';
  import ChordCard from '../components/ChordCard.svelte';
  import ChordChip from '../components/ChordChip.svelte';
  import ChordPicker from '../components/ChordPicker.svelte';
  import QualityBadge from '../components/QualityBadge.svelte';
  import ScoreBar from '../components/ScoreBar.svelte';
  import { openInHarmonize, session } from '../stores/session.svelte';
  import {
    chordName,
    chordVoicingMidi,
    findKeys,
    getScaleType,
    keyName,
    type Chord,
    type ChordFunctionKind,
    type ChordInKey,
  } from '../theory';

  const PAGE_SIZE = 8;
  /** Phones get a shorter placeholder, so it isn't cut off. */
  const narrow = new MediaQuery('max-width: 599px');

  // Inputs start from the session, so they survive switching tabs.
  let progression = $state.raw<Chord[]>(session.keyFinder.progression);
  let modes = $state(session.keyFinder.modes);
  /** Details opened or closed by hand, by key name; otherwise only the top key is open. */
  let details = $state<Record<string, boolean>>({ ...session.keyFinder.details });

  $effect(() => {
    session.keyFinder = { progression, modes, details: { ...details } };
  });
  let shown = $state(PAGE_SIZE);

  const results = $derived(findKeys(progression, { modes }));

  // A new progression starts with the list collapsed.
  $effect(() => {
    void results;
    shown = PAGE_SIZE;
  });

  /** Index of the chord the progression is playing, while it plays. */
  let playingIndex = $state<number | null>(null);
  let player: ProgressionHandle | null = null;

  function stop(): void {
    player?.stop();
    player = null;
    playingIndex = null;
  }

  function togglePlay(): void {
    if (player) {
      stop();
      return;
    }
    player = playProgression(progression.map(chordVoicingMidi), {
      onStep: (i) => (playingIndex = i),
      onEnd: () => {
        player = null;
        playingIndex = null;
      },
    });
  }

  onDestroy(stop);

  /** Editing the progression stops it playing and closes the Details again. */
  function setProgression(next: Chord[]): void {
    stop();
    progression = next;
    details = {};
  }

  function detailsOpen(name: string, rank: number): boolean {
    return details[name] ?? rank === 0;
  }

  /** Short names of the kinds of chords outside the key, singular and plural. */
  const KIND_LABELS: Record<Exclude<ChordFunctionKind, 'diatonic'>, [string, string]> = {
    secondaryDominant: ['secondary dominant', 'secondary dominants'],
    leadingTone: ['leading-tone diminished', 'leading-tone diminished'],
    borrowed: ['borrowed', 'borrowed'],
    chromatic: ['chromatic', 'chromatic'],
  };

  /** Each distinct chord once, in order of first appearance. */
  function distinctChords(chords: readonly ChordInKey[]): ChordInKey[] {
    const seen = new Set<string>();
    return chords.filter((c) => {
      const name = chordName(c.chord);
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    });
  }

  /** '1 borrowed · 1 secondary dominant', counting distinct chords outside the key. */
  function outsideSummary(chords: readonly ChordInKey[]): string {
    const counts = new Map<Exclude<ChordFunctionKind, 'diatonic'>, number>();
    for (const c of distinctChords(chords)) if (c.kind !== 'diatonic') counts.set(c.kind, (counts.get(c.kind) ?? 0) + 1);
    return [...counts]
      .map(([kind, n]) => `${n} ${KIND_LABELS[kind][n === 1 ? 0 : 1]}`)
      .join(' · ');
  }

  function add(chords: Chord[]): void {
    setProgression([...progression, ...chords]);
  }

  /** A bass was picked for the chord added last. */
  function replace(previous: Chord, next: Chord): void {
    const i = progression.lastIndexOf(previous);
    if (i >= 0) setProgression(progression.map((c, j) => (j === i ? next : c)));
  }

  function remove(index: number): void {
    setProgression(progression.filter((_, i) => i !== index));
  }
</script>

<section class="view" aria-labelledby="key-title">
  <h1 id="key-title" class="view-title">Key finder</h1>

  <div class="card">
    <ChordPicker bassRow onpick={add} onreplace={replace} placeholder={narrow.current ? 'e.g. Am F C G' : undefined} />
  </div>

  <div class="card progression">
    <div class="progression-head">
      <h2 class="label">Progression</h2>
      <div class="progression-tools">
        <button type="button" class="toggle-chip" aria-pressed={modes} onclick={() => (modes = !modes)}>Modes</button>
        <button type="button" class="link-button" onclick={() => setProgression([])} disabled={progression.length === 0}>Clear</button>
      </div>
    </div>
    {#if progression.length}
      <ol class="chips">
        {#each progression as chord, i (i)}
          <li><ChordChip {chord} playing={playingIndex === i} onremove={() => remove(i)} /></li>
        {/each}
      </ol>
      <div>
        <button type="button" class="play-progression" class:playing={playingIndex !== null} onclick={togglePlay}>
          {#if playingIndex !== null}
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor" /></svg>
            Stop
          {:else}
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M5 3.5v9l7-4.5z" fill="currentColor" /></svg>
            Play progression
          {/if}
        </button>
      </div>
    {:else}
      <p class="muted hint">No chords yet. Pick a root and a quality, or type <code>Am F C G</code> and press Enter.</p>
    {/if}
  </div>

  {#if results.length === 0}
    <div class="card empty-state">
      <p class="empty-title">Likely keys show up here</p>
      <p class="empty-hint">Three or four chords are usually enough. Turn on Modes to include Dorian, Mixolydian and the other modes.</p>
    </div>
  {:else}
    <section class="keys" aria-labelledby="keys-title">
      <h2 id="keys-title" class="group-title">Likely keys <span class="group-hint">{modes ? 'major, minor and modes' : 'major and minor'}</span></h2>
      <ol class="key-list">
        {#each results.slice(0, shown) as r, rank (keyName(r.key))}
          {@const name = keyName(r.key)}
          {@const open = detailsOpen(name, rank)}
          {@const outside = outsideSummary(r.chords)}
          <li class="key-card card" class:top={rank === 0}>
            <div class="key-head">
              <div class="key-title">
                <h3 class="chord-symbol">{name}</h3>
                {#if rank === 0}<span class="top-label">Most likely</span>{/if}
                {#if r.key.mode !== 'ionian' && r.key.mode !== 'aeolian'}<QualityBadge family={getScaleType(r.key.mode).tonicTriad} />{/if}
              </div>
              <ScoreBar score={r.score} label="{name} score" />
            </div>

            <div class="summary">
              <ol class="numerals" aria-label="Progression in {name}">
                {#each r.chords as c, i (i)}
                  <li
                    class="numeral-chip"
                    class:outside={c.kind !== 'diatonic'}
                    style:--chip-bg="var(--q-{(c.reading ?? c.chord).type.family}-bg)"
                    style:--chip-fg="var(--q-{(c.reading ?? c.chord).type.family}-fg)"
                    title="{chordName(c.chord)}: {c.explanation}"
                  >
                    {c.numeral}<span class="visually-hidden"> ({chordName(c.chord)}, {c.explanation})</span>
                  </li>
                {/each}
              </ol>
              {#if outside}<span class="outside-summary">{outside}</span>{/if}
            </div>

            {#if open}
              <ol class="analysis" id="key-details-{rank}" aria-label="Chords in {name}">
                {#each distinctChords(r.chords) as c (chordName(c.chord))}
                  <li><ChordCard chord={c.chord} size="compact" numeral={c.numeral} tags={[c.explanation]} /></li>
                {/each}
              </ol>
            {/if}

            <div class="key-actions">
              <button
                type="button"
                class="link-button details-toggle"
                aria-expanded={open}
                aria-controls={open ? `key-details-${rank}` : undefined}
                onclick={() => (details = { ...details, [name]: !open })}
              >
                Details
                <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" class:open><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
              </button>
              <button type="button" class="link-button" onclick={() => openInHarmonize(r.key)}>Open in Harmonize</button>
            </div>
          </li>
        {/each}
      </ol>
      {#if results.length > shown}
        <button type="button" class="link-button more" onclick={() => (shown = results.length)}>Show {results.length - shown} more</button>
      {/if}
    </section>
  {/if}
</section>

<style>
  .progression {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
  }

  .progression-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .progression-tools {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .label {
    color: var(--text-muted);
    font-size: 0.8125rem;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .hint {
    font-size: var(--font-size-sm);
  }

  .hint code {
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    background: var(--bg);
    font-family: inherit;
    font-weight: var(--font-weight-semibold);
  }

  .keys {
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

  .group-hint {
    color: var(--text-muted);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-regular);
  }

  .key-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .key-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
  }

  .summary {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-3);
  }

  .numerals {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .numeral-chip {
    position: relative;
    min-width: 32px;
    padding: 2px var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--chip-bg);
    color: var(--chip-fg);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    line-height: 1.4;
    text-align: center;
    white-space: nowrap;
  }

  /* A chord outside the key: a small dot in the corner. */
  .numeral-chip.outside::after {
    content: '';
    position: absolute;
    top: -2px;
    right: -2px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--text-muted);
    box-shadow: 0 0 0 2px var(--surface);
  }

  .outside-summary {
    color: var(--text-muted);
    font-size: 0.8125rem;
  }

  .details-toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }

  .details-toggle svg {
    transition: transform var(--duration) var(--easing);
  }

  .details-toggle svg.open {
    transform: rotate(180deg);
  }

  /* The top-ranked key: an accent left edge and a "Most likely" label. */
  .key-card.top {
    box-shadow:
      var(--shadow),
      inset 4px 0 0 var(--accent-text);
  }

  .top-label {
    padding: 1px var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--accent-soft);
    color: var(--accent-text);
    font-size: 0.75rem;
    font-weight: var(--font-weight-semibold);
    line-height: 1.5;
  }

  .key-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .key-title {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-2);
    min-width: 0;
  }

  /* Compact chord cards; the grid gives them their width (they size with container queries). */
  .analysis {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(124px, 1fr));
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .analysis > li {
    display: grid;
  }

  @media (min-width: 641px) {
    .analysis {
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    }
  }

  .play-progression {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 36px;
    padding: 0 var(--space-4) 0 var(--space-3);
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--accent);
    color: var(--accent-contrast);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    transition: background-color var(--duration) var(--easing);
  }

  .play-progression:hover {
    background: color-mix(in srgb, var(--accent) 88%, var(--text));
  }

  .play-progression.playing {
    background: var(--accent-soft);
    color: var(--accent-text);
  }

  @media (pointer: coarse) {
    .play-progression {
      min-height: 40px;
    }
  }

  .key-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-left: calc(-1 * var(--space-2));
  }

  .more {
    align-self: center;
  }
</style>
