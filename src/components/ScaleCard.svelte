<!--
  A scale finder result: a title (a scale, or a parent scale family), its
  notes as pills (selected filled, extra outlined), a mini piano with the
  same two styles, and Play and Arpeggio buttons (the scale going up, and its
  tonic arpeggio) with, for modes, an "Open in Harmonize" link. A family lists
  one row per member scale, each with its own buttons and a short
  "Harmonize" link (its icon only in narrow cards), the name on one line and the buttons aligned on the
  right; the first member is the top one. The card body is inert: only the
  buttons play.
-->
<script lang="ts">
  import { playArpeggio, playScale, type NoteEvent } from '../audio/engine';
  import { scaleArpeggioMidi, scalePlaybackMidi } from '../audio/playbackNotes';
  import { formatNote, pitchClass, scaleMatchKey, scaleName, type Key, type ScaleMatch } from '../theory';
  import Piano from './Piano.svelte';
  import PlayButtons from './PlayButtons.svelte';

  interface Props {
    title: string;
    matches: readonly ScaleMatch[];
    exact: boolean;
    extraCount: number;
    onopen: (key: Key) => void;
  }

  let { title, matches, exact, extraCount, onopen }: Props = $props();

  let piano = $state<ReturnType<typeof Piano>>();

  const top = $derived(matches[0]!);
  const extraPcs = $derived(top.extra.map(pitchClass));
  const selectedPcs = $derived(top.notes.map(pitchClass).filter((pc) => !extraPcs.includes(pc)));
  const single = $derived(matches.length === 1);

  function flash(events: NoteEvent[]): void {
    piano?.flash(events);
  }
</script>

{#snippet openLink(m: ScaleMatch, short: boolean)}
  {@const key = scaleMatchKey(m)}
  {#if key}
    {@const label = `Open ${scaleName(m.tonic, m.scale)} in Harmonize`}
    {#if short}
      <button type="button" class="link-button harmonize-link" onclick={() => onopen(key)} aria-label={label} title={label}>
        <!-- The Harmonize tab icon: three stacked note heads on a stem. -->
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M6.68 19.53a3 2.1-20 1 0 5.64-2.06 3 2.1-20 1 0-5.64 2.06zM6.68 13.53a3 2.1-20 1 0 5.64-2.06 3 2.1-20 1 0-5.64 2.06zM6.68 7.53a3 2.1-20 1 0 5.64-2.06 3 2.1-20 1 0-5.64 2.06zM12.4 17.5V2.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span class="text">Harmonize</span>
      </button>
    {:else}
      <button type="button" class="link-button" onclick={() => onopen(key)}>Open in Harmonize</button>
    {/if}
  {/if}
{/snippet}

<article class="scale-card card">
  <header class="head">
    <h3 class="chord-symbol">{title}</h3>
    <span class="fit" class:exact>{exact ? 'exact' : `+${extraCount} ${extraCount === 1 ? 'note' : 'notes'}`}</span>
  </header>

  <ul class="pills" aria-label="Notes">
    {#each top.notes as n, i (i)}
      {@const extra = extraPcs.includes(pitchClass(n))}
      <li class="pill" class:extra>{formatNote(n)}<span class="visually-hidden">{extra ? ', not selected' : ''}</span></li>
    {/each}
  </ul>

  <div class="mini-piano">
    <Piano bind:this={piano} size="mini" octaves={1} by="pc" selected={selectedPcs} missing={extraPcs} label="{title} on the piano" />
  </div>

  {#if single}
    <div class="actions">
      <PlayButtons
        label={scaleName(top.tonic, top.scale)}
        onplay={() => flash(playScale(scalePlaybackMidi(top.notes, 4)))}
        onarpeggio={() => flash(playArpeggio(scaleArpeggioMidi(top.notes, 4)))}
      />
      {@render openLink(top, false)}
    </div>
  {:else}
    <ol class="members">
      {#each matches as m (scaleName(m.tonic, m.scale))}
        <li>
          <span class="member">
            <span class="member-name">{scaleName(m.tonic, m.scale)}</span>
            {#if m.scale.commonName}<span class="common">{m.scale.commonName}</span>{/if}
          </span>
          <div class="member-actions">
            <PlayButtons
              label={scaleName(m.tonic, m.scale)}
              iconOnly
              onplay={() => flash(playScale(scalePlaybackMidi(m.notes, 4)))}
              onarpeggio={() => flash(playArpeggio(scaleArpeggioMidi(m.notes, 4)))}
            />
            {@render openLink(m, true)}
          </div>
        </li>
      {/each}
    </ol>
  {/if}
</article>

<style>
  .scale-card {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
  }

  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .fit {
    flex: none;
    padding: 2px var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--bg);
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: var(--font-weight-semibold);
  }

  .fit.exact {
    background: var(--accent-soft);
    color: var(--accent-text);
  }

  .pills {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    height: 26px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--accent);
    color: var(--accent-contrast);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
  }

  .pill.extra {
    background: transparent;
    box-shadow: inset 0 0 0 1.5px var(--accent-text);
    color: var(--accent-text);
  }

  .mini-piano {
    max-width: 196px;
  }

  .members {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
    border-top: 1px solid var(--divider);
  }

  /* Name | buttons: the name stays on one line (the common name truncates), the buttons line up on the right. */
  .members li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--touch-target);
    border-bottom: 1px solid var(--divider);
  }

  .members li:last-child {
    border-bottom: 0;
  }

  .members .link-button {
    flex: none;
    white-space: nowrap;
  }

  .harmonize-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    min-width: 36px;
    min-height: 36px;
  }

  /* Narrow cards: the Harmonize link shrinks to its icon, so the scale name keeps its line. */
  @container (max-width: 19rem) {
    .harmonize-link {
      padding: 0;
    }

    .harmonize-link .text {
      display: none;
    }
  }

  @media (pointer: coarse) {
    .harmonize-link {
      min-width: 40px;
      min-height: 40px;
    }
  }

  .member {
    min-width: 0;
    overflow: hidden;
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    padding: var(--space-2) 0;
    white-space: nowrap;
  }

  /* The scale name keeps its width; the common name gives way (with an ellipsis). */
  .member-name {
    flex: none;
    font-weight: var(--font-weight-semibold);
  }

  .common {
    min-width: 0;
    overflow: hidden;
    color: var(--text-muted);
    font-size: var(--font-size-sm);
    text-overflow: ellipsis;
  }

  .member-actions {
    display: flex;
    padding: var(--space-1) 0;
    align-items: center;
    gap: var(--space-2);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
</style>
