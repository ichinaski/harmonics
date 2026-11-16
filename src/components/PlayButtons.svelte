<!--
  Play and Arpeggio buttons for a chord or a scale card. Each has an icon and
  a short text; inside a narrow container (the card sets `container-type`)
  or with `iconOnly`, only the icons show. The full label ("Play Cmaj7",
  "Play Cmaj7 as an arpeggio") is always the accessible name and the tooltip.
-->
<script lang="ts">
  interface Props {
    /** What is played: 'Cmaj7', 'C Dorian'. */
    label: string;
    onplay: () => void;
    onarpeggio: () => void;
    /** Icons only, whatever the width (e.g. rows in a list). */
    iconOnly?: boolean;
  }

  let { label, onplay, onarpeggio, iconOnly = false }: Props = $props();

  const playLabel = $derived(`Play ${label}`);
  const arpeggioLabel = $derived(`Play ${label} as an arpeggio`);
</script>

<div class="play-buttons" class:icon-only={iconOnly}>
  <button type="button" class="play-button" onclick={onplay} aria-label={playLabel} title={playLabel}>
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M5 3.5v9l7-4.5z" fill="currentColor" /></svg>
    <span class="text">Play</span>
  </button>
  <button type="button" class="play-button" onclick={onarpeggio} aria-label={arpeggioLabel} title={arpeggioLabel}>
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M2.5 12.5h3v-3h3v-3h3v-3h2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <span class="text">Arpeggio</span>
  </button>
</div>

<style>
  .play-buttons {
    display: flex;
    flex: none;
    gap: var(--space-2);
  }

  .play-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-width: 36px;
    min-height: 36px;
    padding: 0 var(--space-3);
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--accent-soft);
    color: var(--accent-text);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    white-space: nowrap;
    cursor: pointer;
    transition: background-color var(--duration) var(--easing);
  }

  .play-button:hover {
    background: color-mix(in srgb, var(--accent) 22%, var(--accent-soft));
  }

  .play-button:active {
    background: color-mix(in srgb, var(--accent) 32%, var(--accent-soft));
  }

  .icon-only .play-button {
    padding: 0;
  }

  .icon-only .text {
    display: none;
  }

  /* Narrow cards: icons only. */
  @container (max-width: 15rem) {
    .play-button {
      padding: 0;
    }

    .text {
      display: none;
    }
  }

  @media (pointer: coarse) {
    .play-button {
      min-width: 40px;
      min-height: 40px;
    }
  }
</style>
