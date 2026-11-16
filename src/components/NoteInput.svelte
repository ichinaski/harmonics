<!--
  Note input: a piano or 12 pitch class buttons (toggle), both feeding one
  selection of MIDI notes. The pitch class buttons add notes in the piano's
  first octave and remove every octave of a pitch class. In piano mode a
  speaker toggle in the corner turns key sounds on or off (shared by every
  piano). Below, the selected notes are listed; tapping one marks it as the
  bass (`bass` is a pitch class), tapping it again unmarks it.

  With `autoBass`, in piano mode the lowest selected note is the bass while
  none is marked: the Bass row starts with an "Auto (lowest)" chip, pressed
  until a note is pinned, and the lowest note shows as the bass. A pinned
  bass stays until that note is deselected or tapped again. Note names have
  no octave, so that mode has no automatic bass.
-->
<script lang="ts">
  import { defaultSpelling, formatNote, mod12 } from '../theory';
  import KeySoundsToggle from './KeySoundsToggle.svelte';
  import Piano from './Piano.svelte';
  import PitchClassPicker from './PitchClassPicker.svelte';

  interface Props {
    /** Selected MIDI notes, ascending. */
    notes?: number[];
    /** Pitch class of the bass note, one of the selected notes. */
    bass?: number | null;
    /** Enables the bass row. */
    bassMarking?: boolean;
    /** In piano mode, the lowest selected note is the bass unless one is marked. */
    autoBass?: boolean;
    /** Piano keys or note names. */
    inputMode?: 'piano' | 'pcs';
    spell?: (pc: number) => string;
    start?: number;
    octaves?: number;
    label?: string;
  }

  let {
    notes = $bindable([]),
    bass = $bindable(null),
    bassMarking = true,
    autoBass = false,
    inputMode = $bindable('piano'),
    spell = (pc: number) => formatNote(defaultSpelling(pc)),
    start = 48,
    octaves = 2,
    label = 'Notes',
  }: Props = $props();

  const uid = $props.id();

  /** Selected pitch classes, ordered by their lowest note. */
  const pcs = $derived([...new Set([...notes].sort((a, b) => a - b).map(mod12))]);

  function setNotes(next: number[]): void {
    notes = [...new Set(next)].sort((a, b) => a - b);
    if (bass !== null && !notes.some((n) => mod12(n) === bass)) bass = null;
  }

  function toggleKey(midi: number): void {
    setNotes(notes.includes(midi) ? notes.filter((n) => n !== midi) : [...notes, midi]);
  }

  function togglePc(pc: number): void {
    setNotes(pcs.includes(pc) ? notes.filter((n) => mod12(n) !== pc) : [...notes, start + pc]);
  }

  function toggleBass(pc: number): void {
    bass = bass === pc ? null : pc;
  }

  function clear(): void {
    notes = [];
    bass = null;
  }

  /** The lowest note is the bass: piano mode with autoBass, and no note marked. */
  const auto = $derived(autoBass && bassMarking && inputMode === 'piano' && bass === null);
  const shownBass = $derived(bass ?? (auto ? (pcs[0] ?? null) : null));
  const bassMidi = $derived(shownBass === null ? null : (notes.find((n) => mod12(n) === shownBass) ?? null));
</script>

<div class="note-input">
  <div class="toolbar">
    <div class="segmented" role="group" aria-label="Input">
      <button type="button" aria-pressed={inputMode === 'piano'} onclick={() => (inputMode = 'piano')}>Piano</button>
      <button type="button" aria-pressed={inputMode === 'pcs'} onclick={() => (inputMode = 'pcs')}>Note names</button>
    </div>
    <div class="toolbar-end">
      {#if inputMode === 'piano'}<KeySoundsToggle />{/if}
      <button type="button" class="link-button" onclick={clear} disabled={notes.length === 0}>Clear</button>
    </div>
  </div>

  {#if inputMode === 'piano'}
    <Piano {start} {octaves} selected={notes} bass={bassMidi} {spell} {label} onkey={toggleKey} />
  {:else}
    <PitchClassPicker selected={pcs} {bass} {spell} {label} ontoggle={togglePc} />
  {/if}

  {#if bassMarking}
    <div class="selection">
      {#if pcs.length === 0}
        <span class="muted hint">Tap notes to select them.</span>
      {:else}
        <span class="muted hint" id="{uid}-bass">Bass:</span>
        <div class="pills" role="group" aria-labelledby="{uid}-bass">
          {#if autoBass && inputMode === 'piano'}
            <button type="button" class="pill auto-chip" aria-pressed={auto} onclick={() => (bass = null)}>Auto (lowest)</button>
          {/if}
          {#each pcs as pc (pc)}
            <button
              type="button"
              class="pill"
              class:bass={bass === pc}
              class:auto-bass={auto && shownBass === pc}
              aria-pressed={bass === pc}
              aria-label={auto && shownBass === pc ? `${spell(pc)}, bass (lowest note)` : undefined}
              onclick={() => toggleBass(pc)}
            >
              {spell(pc)}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .note-input {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  /* On the narrowest screens the key sounds toggle and Clear move to a second line, so the switch stays on one. */
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-3);
  }

  .toolbar .segmented {
    flex-wrap: nowrap;
  }

  .toolbar-end {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-left: auto;
  }

  .selection {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
    min-height: 36px;
  }

  .hint {
    font-size: var(--font-size-sm);
  }

  .pills {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .pill {
    min-width: 40px;
    min-height: 32px;
    padding: 0 var(--space-3);
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--accent-soft);
    color: var(--accent-text);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
  }

  .pill.bass {
    background: var(--accent);
    color: var(--accent-contrast);
  }

  .pill.bass::after,
  .pill.auto-bass::after {
    content: ' · bass';
    font-weight: var(--font-weight-regular);
  }

  /* The lowest note while the bass is automatic: marked, but lighter than a pinned bass. */
  .pill.auto-bass {
    box-shadow: inset 0 0 0 1.5px var(--accent);
  }

  .pill.auto-chip {
    background: var(--surface-muted);
    box-shadow: inset 0 0 0 1px var(--divider);
    color: var(--text-muted);
  }

  .pill.auto-chip[aria-pressed='true'] {
    background: var(--accent);
    box-shadow: none;
    color: var(--accent-contrast);
  }
</style>
