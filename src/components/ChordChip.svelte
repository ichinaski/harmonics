<!--
  A chord as a small chip colored by quality family, for progressions. It's
  too small for Play buttons, so tapping the chip plays the chord (voiced as
  everywhere else) and calls `onclick`; `onremove` adds a × button.
  `playing` highlights it while a progression plays it.
-->
<script lang="ts">
  import { playChord } from '../audio/engine';
  import { chordName, chordVoicingMidi, type Chord } from '../theory';

  interface Props {
    chord: Chord;
    /** Display name; defaults to the chord symbol. */
    name?: string;
    /** Highlighted while a progression plays this chord. */
    playing?: boolean;
    onclick?: () => void;
    onremove?: () => void;
  }

  let { chord, name, playing = false, onclick, onremove }: Props = $props();

  const label = $derived(name ?? chordName(chord));

  function play(): void {
    playChord(chordVoicingMidi(chord));
    onclick?.();
  }
</script>

<span class="chip" class:playing style:--chip-bg="var(--q-{chord.type.family}-bg)" style:--chip-fg="var(--q-{chord.type.family}-fg)" style:--chip-edge="var(--q-{chord.type.family}-edge)">
  <button
    type="button"
    class="play"
    onclick={play}
    aria-label="Play {label}, {chord.type.qualityName}"
    aria-current={playing ? 'step' : undefined}
    title="Play {label}">{label}</button
  >
  {#if onremove}
    <button type="button" class="remove" onclick={onremove} aria-label="Remove {label}">
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
    </button>
  {/if}
</span>

<style>
  .chip {
    display: inline-flex;
    align-items: stretch;
    height: 36px;
    border-radius: var(--radius-pill);
    background: var(--chip-bg);
    color: var(--chip-fg);
    transition:
      box-shadow var(--duration) var(--easing),
      transform var(--duration) var(--easing);
  }

  /* A ring and a lift; the text keeps its AA colors. */
  .chip.playing {
    box-shadow:
      inset 0 0 0 2px var(--chip-edge),
      0 0 0 3px color-mix(in srgb, var(--chip-edge) 28%, transparent);
    transform: translateY(-2px);
  }

  button {
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .play {
    padding: 0 var(--space-3);
    border-radius: var(--radius-pill);
    font-size: 0.9375rem;
    font-weight: var(--font-weight-semibold);
    white-space: nowrap;
  }

  .chip:has(.remove) .play {
    padding-right: var(--space-1);
  }

  .remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    margin-right: 3px;
    border-radius: var(--radius-pill);
    opacity: 0.75;
  }

  .remove:hover,
  .play:hover {
    background: color-mix(in srgb, var(--chip-fg) 12%, transparent);
  }

  .remove:hover {
    opacity: 1;
  }

  /* Touch screens: bigger targets for the chord name and the remove button. */
  @media (pointer: coarse) {
    .chip {
      height: 40px;
    }

    .play {
      min-width: 40px;
    }

    .remove {
      width: 36px;
    }
  }
</style>
