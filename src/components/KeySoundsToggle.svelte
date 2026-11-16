<!--
  Small speaker toggle for piano key sounds: whether tapping a piano key plays
  it. One setting (settings.keySounds) shared by every piano and kept in
  localStorage. Play and Arpeggio buttons always play, whatever it says.
-->
<script lang="ts">
  import { settings } from '../stores/settings.svelte';

  const title = $derived(settings.keySounds ? 'Key sounds on' : 'Key sounds off');
</script>

<button
  type="button"
  class="key-sounds"
  aria-label="Key sounds"
  aria-pressed={settings.keySounds}
  {title}
  onclick={() => settings.setKeySounds(!settings.keySounds)}
>
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
    {#if settings.keySounds}
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    {:else}
      <path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    {/if}
  </svg>
</button>

<style>
  .key-sounds {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition:
      background-color var(--duration) var(--easing),
      color var(--duration) var(--easing);
  }

  .key-sounds:hover {
    background: var(--surface-muted);
    color: var(--text);
  }

  .key-sounds[aria-pressed='true'] {
    color: var(--accent-text);
  }

  .key-sounds[aria-pressed='true']:hover {
    background: var(--accent-soft);
  }

  @media (pointer: coarse) {
    .key-sounds {
      width: 40px;
      height: 40px;
    }
  }
</style>
