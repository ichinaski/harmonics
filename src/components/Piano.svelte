<!--
  Piano keyboard. Shows selected notes (accent fill with the note name),
  missing notes (outlined), a bass marker, a scale tint with a stronger tonic,
  and a brief flash on played notes. Interactive when `onkey` is set; tapping a
  key also plays it when key sounds are on (settings.keySounds, the speaker
  toggle in NoteInput), unless the tap deselects it. With `playOnly` the keys
  are plain play buttons ("Play C4", no pressed state) that always play, for
  keyboards that only play (the Harmonize scale). On narrow
  containers the full size piano shows fewer octaves with octave shift buttons.

  `by` decides how selected / missing / bass are matched: 'midi' (exact keys)
  or 'pc' (every key of that pitch class, for cards and pitch class input).
  `flash(events)` can be called through bind:this to flash played notes.
  Keyboard: the interactive piano is one tab stop; the arrow keys move between
  keys (shifting the octave at the edges on small screens), Enter or Space
  toggles (or plays) the focused key.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { playNote, type NoteEvent } from '../audio/engine';
  import { settings } from '../stores/settings.svelte';
  import { defaultSpelling, formatNote, mod12 } from '../theory';
  import { octaveOf, pianoKeys, whiteKeyCount, type PianoKey } from './pianoLayout';
  import { rovingTarget } from './rovingFocus';

  interface Props {
    /** MIDI note of the first key, a C (any white key with `end`). Default C3. */
    start?: number;
    octaves?: number;
    /** MIDI note of the last key, a white key; replaces `octaves` for a mini piano with an exact range. */
    end?: number;
    by?: 'midi' | 'pc';
    selected?: readonly number[];
    /** Chord notes not in the selection: drawn outlined. */
    missing?: readonly number[];
    bass?: number | null;
    /** Pitch classes tinted as scale notes. */
    scale?: readonly number[];
    /** Pitch class of the tonic: stronger tint. */
    tonic?: number | null;
    /** Note name for a pitch class (context-aware spelling). */
    spell?: (pc: number) => string;
    size?: 'full' | 'mini';
    /** Accessible name of the keyboard. */
    label?: string;
    /** Makes keys tappable (toggle buttons for a selection). */
    onkey?: (midi: number) => void;
    /** Keys only play: buttons labelled "Play C4", without a pressed state. */
    playOnly?: boolean;
    /** Play the tapped note through the audio engine (when key sounds are on). */
    playOnTap?: boolean;
  }

  let {
    start = 48,
    octaves = 2,
    end,
    by = 'midi',
    selected = [],
    missing = [],
    bass = null,
    scale = [],
    tonic = null,
    spell = (pc: number) => formatNote(defaultSpelling(pc)),
    size = 'full',
    label = 'Piano keyboard',
    onkey,
    playOnly = false,
    playOnTap = true,
  }: Props = $props();

  /** Narrowest comfortable white key on the full size piano, in px. */
  const MIN_WHITE_KEY = 34;
  const FLASH_MS = 320;

  let width = $state(0);
  let octaveShift = $state(0);
  let flashing = $state<Record<number, number>>({});

  const visibleOctaves = $derived(
    size === 'full' && width > 0
      ? Math.max(1, Math.min(octaves, Math.floor(width / (7 * MIN_WHITE_KEY))))
      : octaves,
  );
  const maxShift = $derived(octaves - visibleOctaves);
  const shift = $derived(Math.min(octaveShift, maxShift));
  const first = $derived(start + 12 * shift);
  const count = $derived(size === 'mini' && end !== undefined ? end - first + 1 : 12 * visibleOctaves);
  const keys = $derived(pianoKeys(first, count));
  const whites = $derived(whiteKeyCount(first, count));

  const matchKey = (list: readonly number[], midi: number) =>
    by === 'pc' ? list.some((n) => mod12(n) === mod12(midi)) : list.includes(midi);
  const selectedSet = $derived(new Set(keys.filter((k) => matchKey(selected, k.midi)).map((k) => k.midi)));
  const missingSet = $derived(new Set(keys.filter((k) => matchKey(missing, k.midi)).map((k) => k.midi)));
  const scaleSet = $derived(new Set(scale.map(mod12)));

  function isBass(midi: number): boolean {
    if (bass === null) return false;
    return by === 'pc' ? mod12(bass) === mod12(midi) : bass === midi;
  }

  /** Selected notes outside the visible octaves, for the shift buttons. */
  const hiddenBelow = $derived(by === 'midi' ? selected.filter((m) => m >= start && m < first).length : 0);
  const hiddenAbove = $derived(by === 'midi' ? selected.filter((m) => m >= first + count && m < start + 12 * octaves).length : 0);

  function keyClass(k: PianoKey): string {
    const classes = [k.black ? 'black' : 'white'];
    if (selectedSet.has(k.midi)) classes.push('selected');
    else if (missingSet.has(k.midi)) classes.push('missing');
    else if (tonic !== null && mod12(tonic) === k.pc) classes.push('tonic');
    else if (scaleSet.has(k.pc)) classes.push('scale');
    if (flashing[k.midi]) classes.push('flash');
    return classes.join(' ');
  }

  function keyLabel(k: PianoKey): string | null {
    if (selectedSet.has(k.midi) || missingSet.has(k.midi) || scaleSet.has(k.pc) || (tonic !== null && mod12(tonic) === k.pc)) {
      return spell(k.pc);
    }
    return null;
  }

  function flashKey(midi: number): void {
    flashing[midi] = (flashing[midi] ?? 0) + 1;
    setTimeout(() => {
      flashing[midi] = (flashing[midi] ?? 1) - 1;
    }, FLASH_MS);
  }

  /** Flashes played notes at their offsets. Notes outside the visible keys flash the keys of the same pitch class. */
  export function flash(events: readonly Pick<NoteEvent, 'midi' | 'offset'>[]): void {
    for (const e of events) {
      const exact = keys.some((k) => k.midi === e.midi);
      const targets = exact ? [e.midi] : keys.filter((k) => k.pc === mod12(e.midi)).map((k) => k.midi);
      setTimeout(() => targets.forEach(flashKey), e.offset * 1000);
    }
  }

  /** Plays the tapped key, except when the tap deselects it. */
  function tap(midi: number): void {
    if (playOnly) {
      flash(playNote(midi));
      return;
    }
    const deselecting = selectedSet.has(midi);
    onkey?.(midi);
    if (playOnTap && !deselecting && settings.keySounds) flash(playNote(midi));
  }

  // Roving tabindex: the last focused key, else the first selected one, else the first key.
  let pianoEl = $state<HTMLDivElement>();
  let focusMidi = $state<number | null>(null);
  const tabStop = $derived(
    focusMidi !== null && keys.some((k) => k.midi === focusMidi)
      ? focusMidi
      : (keys.find((k) => selectedSet.has(k.midi)) ?? keys[0]!).midi,
  );

  async function onKeydown(event: KeyboardEvent): Promise<void> {
    // Chromatic order (keys lists the white keys first, for stacking).
    const chromatic = keys.map((k) => k.midi).sort((a, b) => a - b);
    const target = rovingTarget(event.key, chromatic.indexOf(tabStop), chromatic.length);
    if (target === null) return;
    event.preventDefault();
    let midi = chromatic[Math.max(0, Math.min(chromatic.length - 1, target))]!;
    // Past the visible keys: shift an octave when the full range allows it.
    if (target < 0 && shift > 0) {
      octaveShift = shift - 1;
      midi = tabStop - 1;
    } else if (target >= chromatic.length && shift < maxShift) {
      octaveShift = shift + 1;
      midi = tabStop + 1;
    }
    focusMidi = midi;
    await tick();
    pianoEl?.querySelector<HTMLButtonElement>(`[data-midi="${midi}"]`)?.focus();
  }

  const ariaSummary = $derived.by(() => {
    const names = [...new Set(keys.filter((k) => selectedSet.has(k.midi)).map((k) => spell(k.pc)))];
    return names.length ? `${label}: ${names.join(', ')}` : label;
  });
</script>

<div class="piano-wrap {size}" bind:clientWidth={width}>
  {#if maxShift > 0}
    <div class="shift" role="group" aria-label="Octave">
      <button type="button" class="shift-btn" onclick={() => (octaveShift = shift - 1)} disabled={shift === 0} aria-label="Lower octave">
        <span aria-hidden="true">‹</span>
        {#if hiddenBelow}<span class="hidden-count" aria-label="{hiddenBelow} selected below">{hiddenBelow}</span>{/if}
      </button>
      <span class="shift-range">C{octaveOf(first)}–B{octaveOf(first + count - 1)}</span>
      <button type="button" class="shift-btn" onclick={() => (octaveShift = shift + 1)} disabled={shift === maxShift} aria-label="Higher octave">
        {#if hiddenAbove}<span class="hidden-count" aria-label="{hiddenAbove} selected above">{hiddenAbove}</span>{/if}
        <span aria-hidden="true">›</span>
      </button>
    </div>
  {/if}

  {#if onkey || playOnly}
    <div class="piano" role="group" aria-label={label} bind:this={pianoEl}>
      {#each keys as k (k.midi)}
        {@const name = keyLabel(k)}
        <button
          type="button"
          class="key {keyClass(k)}"
          style:left="{(k.left / whites) * 100}%"
          style:width="{(k.width / whites) * 100}%"
          aria-label={playOnly ? `Play ${spell(k.pc)}${octaveOf(k.midi)}` : `${spell(k.pc)}${octaveOf(k.midi)}${isBass(k.midi) ? ', bass' : ''}`}
          aria-pressed={playOnly ? undefined : selectedSet.has(k.midi)}
          tabindex={k.midi === tabStop ? 0 : -1}
          data-midi={k.midi}
          onfocus={() => (focusMidi = k.midi)}
          onkeydown={onKeydown}
          onclick={() => tap(k.midi)}
        >
          {#if name}<span class="name">{name}</span>{:else if k.pc === 0 && size === 'full'}<span class="octave">C{octaveOf(k.midi)}</span>{/if}
          {#if isBass(k.midi)}<span class="bass" title="Bass"></span>{/if}
        </button>
      {/each}
    </div>
  {:else}
    <div class="piano" role="img" aria-label={ariaSummary}>
      {#each keys as k (k.midi)}
        {@const name = size === 'full' ? keyLabel(k) : null}
        <div
          class="key {keyClass(k)}"
          style:left="{(k.left / whites) * 100}%"
          style:width="{(k.width / whites) * 100}%"
        >
          {#if name}<span class="name">{name}</span>{/if}
          {#if isBass(k.midi)}<span class="bass"></span>{/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .piano-wrap {
    --gap: 2px;
    --white-h: 148px;
    --black-h: 60%;
    --key-radius: 7px;
    width: 100%;
    user-select: none;
    -webkit-user-select: none;
  }

  .piano-wrap.mini {
    --gap: 1.5px;
    --white-h: 44px;
    --key-radius: 3px;
  }

  .piano {
    position: relative;
    height: var(--white-h);
    border: var(--gap) solid var(--key-bed);
    border-top-width: calc(var(--gap) * 2);
    border-radius: var(--key-radius);
    background: var(--key-bed);
    box-sizing: content-box;
    overflow: hidden;
    touch-action: manipulation;
  }

  .key {
    position: absolute;
    top: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    margin: 0;
    padding: 0 0 10px;
    border: 0;
    font: inherit;
    font-size: 0.8125rem;
    font-weight: var(--font-weight-semibold);
    line-height: 1;
    transition:
      background-color var(--duration) var(--easing),
      box-shadow var(--duration) var(--easing),
      color var(--duration) var(--easing);
  }

  .mini .key {
    padding-bottom: 4px;
  }

  button.key {
    cursor: pointer;
  }

  /* Inset focus ring (the keyboard clips anything outside), colored to show on every key fill. */
  button.key:focus-visible {
    z-index: 2;
    outline: 3px solid var(--accent);
    outline-offset: -3px;
  }

  button.black:focus-visible {
    outline-color: var(--key-missing-black-ring);
  }

  button.key.selected:focus-visible {
    outline-color: var(--accent-contrast);
  }

  .white {
    height: 100%;
    border-left: var(--gap) solid var(--key-bed);
    border-radius: 0 0 var(--key-radius) var(--key-radius);
    background: var(--key-white);
    color: var(--key-white-text);
  }

  .white:first-child {
    border-left: 0;
  }

  .black {
    z-index: 1;
    height: var(--black-h);
    border-radius: 0 0 calc(var(--key-radius) - 2px) calc(var(--key-radius) - 2px);
    background: var(--key-black);
    color: var(--key-black-text);
    font-size: 0.6875rem;
    padding-bottom: 8px;
    box-shadow: 0 0 0 var(--gap) var(--key-bed);
  }

  .mini .black {
    padding-bottom: 3px;
  }

  button.white:active {
    filter: brightness(0.94);
  }

  button.black:active {
    filter: brightness(1.35);
  }

  .scale.white {
    background: var(--key-scale-white);
    color: var(--key-scale-white-text);
  }

  .scale.black {
    background: var(--key-scale-black);
    color: var(--key-scale-black-text);
  }

  .tonic.white {
    background: var(--key-tonic-white);
    color: var(--key-tonic-white-text);
  }

  .tonic.black {
    background: var(--key-tonic-black);
    color: var(--key-tonic-black-text);
  }

  .selected {
    background: var(--accent);
    color: var(--accent-contrast);
  }

  .missing.white {
    color: var(--key-missing-white-text);
    box-shadow: inset 0 0 0 2px var(--key-missing-white-ring);
  }

  .missing.black {
    color: var(--key-missing-black-text);
    box-shadow:
      0 0 0 var(--gap) var(--key-bed),
      inset 0 0 0 2px var(--key-missing-black-ring);
  }

  .mini .missing.white {
    box-shadow: inset 0 0 0 1.5px var(--key-missing-white-ring);
  }

  .mini .missing.black {
    box-shadow:
      0 0 0 var(--gap) var(--key-bed),
      inset 0 0 0 1.5px var(--key-missing-black-ring);
  }

  .name {
    pointer-events: none;
  }

  .octave {
    color: var(--text-muted);
    font-size: 0.6875rem;
    font-weight: var(--font-weight-regular);
    pointer-events: none;
  }

  .black .octave {
    display: none;
  }

  .bass {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    pointer-events: none;
  }

  .mini .bass {
    width: 4px;
    height: 4px;
  }

  .flash {
    animation: key-flash 320ms var(--easing);
  }

  @keyframes key-flash {
    from {
      box-shadow: inset 0 0 0 999px rgb(129 140 248 / 0.55);
    }
  }

  /* Octave shift (narrow screens) */
  .shift {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }

  .shift-range {
    min-width: 5.5em;
    text-align: center;
    color: var(--text-muted);
    font-size: var(--font-size-sm);
    font-variant-numeric: tabular-nums;
  }

  .shift-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-width: var(--touch-target);
    height: 36px;
    padding: 0 var(--space-2);
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--surface-muted);
    box-shadow: inset 0 0 0 1px var(--divider);
    font-size: 1.25rem;
    line-height: 1;
    cursor: pointer;
  }

  .shift-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .hidden-count {
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: var(--radius-pill);
    background: var(--accent);
    color: var(--accent-contrast);
    font-size: 0.6875rem;
    font-weight: var(--font-weight-semibold);
    line-height: 18px;
  }
</style>
