<!--
  Chord entry: a root row (12 buttons), a quality row with 8 common qualities
  and a "More" expander, an optional Bass row, and a text box using the chord
  symbol parser.

  - 'progression' mode (default): picking a root and a quality (either order)
    adds that chord; the text box adds every valid token on Enter
    ('Am F C/E G7'), and invalid ones stay in the box with their error. With
    the Bass row, a third tap gives the chord added last a bass, through
    `onreplace`.
  - 'single' mode: one chord at a time, the latest wins. The picker shows the
    current chord (`chord`), and the picker and the text box stay in sync:
    typing C7/E selects root C, quality 7 and bass E, and picking updates the
    text. Typing something that isn't a chord (or clearing the box) clears
    the chord (`onpick([])`). A pick that changes the root or quality keeps
    the bass while it's still a chord tone.

  The Bass row lists the chord's tones by interval ('E (3)'; the root means
  root position), plus "Other" with all 12 notes, spelled from the root, for
  slash chords like F/G.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import {
    CHORD_TYPES,
    chordName,
    chordRootSpelling,
    chordTones,
    defaultSpelling,
    formatNote,
    getChordType,
    intervalLabel,
    makeChord,
    parseProgression,
    pitchClass,
    readableNote,
    spellBassFromRoot,
    type Chord,
    type ChordToken,
    type ChordType,
    type Note,
  } from '../theory';
  import PitchClassPicker from './PitchClassPicker.svelte';

  interface Props {
    /** 'progression' adds chords; 'single' keeps one chord (the latest wins), in sync with the text box. */
    mode?: 'progression' | 'single';
    /** Single mode: the current chord, shown in the picker and the text box. */
    chord?: Chord | null;
    /** Adds the Bass row (inversions and slash chords). */
    bassRow?: boolean;
    /** Progression mode: chords to add. Single mode: the new current chord, or none when the text isn't a chord. */
    onpick: (chords: Chord[]) => void;
    /** Progression mode with the Bass row: a bass was picked for `previous`, the chord added last. */
    onreplace?: (previous: Chord, next: Chord) => void;
    /** Spells a root pitch class (e.g. following a key). */
    spellRoot?: (pc: number) => Note;
    placeholder?: string;
  }

  let {
    mode = 'progression',
    chord = null,
    bassRow = false,
    onpick,
    onreplace,
    spellRoot = defaultSpelling,
    placeholder,
  }: Props = $props();

  const uid = $props.id();
  const COMMON_QUALITY_IDS = ['maj', 'm', '7', 'maj7', 'm7', 'dim', 'm7b5', 'sus4'];
  const COMMON_QUALITIES = COMMON_QUALITY_IDS.map(getChordType);
  const MORE_QUALITIES = CHORD_TYPES.filter((t) => !COMMON_QUALITY_IDS.includes(t.id));

  const single = $derived(mode === 'single');

  /** The root as picked or typed (its spelling is kept, so a typed D♭ stays D♭). */
  let rootNote = $state<Note | null>(null);
  let qualityId = $state<string | null>(null);
  /** Single mode: the bass pitch class, or null for root position. */
  let bassPc = $state<number | null>(null);
  /** Progression mode: the chord added last, which the Bass row edits. */
  let lastAdded = $state.raw<Chord | null>(null);
  let showMore = $state(false);
  let showOtherBass = $state(false);
  let text = $state('');
  let errors = $state.raw<ChordToken[]>([]);
  /** Single mode: the chord this picker emitted last, so the `chord` prop coming back doesn't overwrite the text being typed. */
  let lastEmitted: Chord | null | undefined;

  const rootPc = $derived(rootNote === null ? null : pitchClass(rootNote));

  function qualityLabel(type: ChordType): string {
    if (type.id === 'maj') return 'maj';
    return type.display.replace('°', 'dim');
  }

  function build(root: Note, type: ChordType, bass: number | null): Chord {
    const spelled = chordRootSpelling(root, type);
    return bass === null || bass === pitchClass(spelled) ? makeChord(spelled, type) : makeChord(spelled, type, bass);
  }

  /** Shows a chord in the picker (single mode). */
  function show(c: Chord | null): void {
    rootNote = c?.root ?? null;
    qualityId = c?.type.id ?? null;
    bassPc = c?.bass ? pitchClass(c.bass) : null;
    if (c && !COMMON_QUALITY_IDS.includes(c.type.id)) showMore = true;
    if (c && bassPc !== null && !chordTones(c).some((t) => t.pc === bassPc)) showOtherBass = true;
  }

  /** Single mode: shows the chord from outside (e.g. the session when coming back to the tab), unless this picker emitted it. */
  function follow(c: Chord | null): void {
    if (!single || c === lastEmitted) return;
    lastEmitted = c;
    show(c);
    text = c ? chordName(c, 'ascii') : '';
    errors = [];
  }

  // Shown on the first render, then kept in sync. Only `chord` and `mode` are tracked, not the picker state follow() reads and writes.
  untrack(() => follow(chord));
  $effect(() => {
    const c = chord;
    void single;
    untrack(() => follow(c));
  });

  function emitSingle(c: Chord, updateText: boolean): void {
    lastEmitted = c;
    if (updateText) {
      text = chordName(c, 'ascii');
      errors = [];
    }
    onpick([c]);
  }

  /** After a root or quality pick: in single mode emits the chord, in progression mode adds it and starts over. */
  function emitIfComplete(): void {
    if (rootNote === null || qualityId === null) return;
    const type = getChordType(qualityId);
    if (single) {
      const keep = bassPc !== null && chordTones({ root: rootNote, type }).some((t) => t.pc === bassPc);
      if (!keep) bassPc = null;
      emitSingle(build(rootNote, type, bassPc), true);
      return;
    }
    const added = build(rootNote, type, null);
    onpick([added]);
    lastAdded = bassRow ? added : null;
    showOtherBass = false;
    rootNote = null;
    qualityId = null;
  }

  function pickRoot(pc: number): void {
    if (single) {
      if (rootPc !== pc) rootNote = spellRoot(pc);
    } else {
      rootNote = rootPc === pc ? null : spellRoot(pc);
      lastAdded = null;
    }
    emitIfComplete();
  }

  function pickQuality(id: string): void {
    if (single) qualityId = id;
    else {
      qualityId = qualityId === id ? null : id;
      lastAdded = null;
    }
    emitIfComplete();
  }

  /** The chord the Bass row is for: the current chord in single mode, the chord added last in progression mode. */
  const bassChord = $derived.by((): Chord | null => {
    if (!bassRow) return null;
    if (!single) return rootNote === null && qualityId === null ? lastAdded : null;
    return rootNote !== null && qualityId !== null ? build(rootNote, getChordType(qualityId), bassPc) : null;
  });
  const bassTones = $derived(bassChord ? chordTones(bassChord) : []);
  const currentBassPc = $derived(bassChord ? pitchClass(bassChord.bass ?? bassChord.root) : null);

  /** A bass spelled from the root as makeChord spells it: the chord tone, else by its interval (F/G, not F/A𝄫), made readable (C♯/F, C°7/A). */
  function spellBass(pc: number): string {
    if (!bassChord) return formatNote(defaultSpelling(pc));
    const tone = bassTones.find((t) => t.pc === pc);
    return formatNote(readableNote(tone ? tone.note : spellBassFromRoot(bassChord.root, pc)));
  }

  function pickBass(pc: number): void {
    if (!bassChord) return;
    if (single) {
      bassPc = pc === pitchClass(bassChord.root) ? null : pc;
      emitSingle(build(bassChord.root, bassChord.type, bassPc), true);
      return;
    }
    const next = build(bassChord.root, bassChord.type, pc);
    onreplace?.(bassChord, next);
    lastAdded = next;
  }

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    const { tokens, chords } = parseProgression(text);
    errors = tokens.filter((t) => !t.result.ok);
    if (single) return;
    text = errors.map((t) => t.text).join(' ');
    if (chords.length) {
      onpick(chords);
      lastAdded = bassRow ? chords[chords.length - 1]! : null;
      showOtherBass = false;
    }
  }

  function onInput(event: Event): void {
    // Read the input itself: the bound `text` may not have updated yet.
    const value = (event.currentTarget as HTMLInputElement).value;
    if (!single) {
      // Errors belong to the text that was submitted: clearing the box clears them.
      if (value.trim() === '') errors = [];
      return;
    }
    errors = [];
    const last = parseProgression(value).tokens.at(-1);
    if (!last?.result.ok) {
      // Not a chord (or nothing typed): clear the chord rather than keep the previous one.
      show(null);
      lastEmitted = null;
      onpick([]);
      return;
    }
    show(last.result.chord);
    emitSingle(last.result.chord, false);
  }

  /** Root buttons use the picked or typed spelling for the selected root. */
  function spellRootButton(pc: number): string {
    return formatNote(rootNote !== null && rootPc === pc ? rootNote : spellRoot(pc));
  }

  const hint = $derived.by(() => {
    if (lastAdded && !single) return `Bass for ${chordName(lastAdded)}, or pick the next chord`;
    if (rootNote !== null && qualityId === null) return `${formatNote(rootNote)}: pick a quality`;
    if (rootNote === null && qualityId !== null) return 'Pick a root';
    if (rootNote === null) return single ? 'Pick a root and a quality, or type a chord' : 'Pick a root and a quality';
    return bassRow ? 'Pick a bass for an inversion or a slash chord' : '';
  });
</script>

<div class="chord-picker">
  <PitchClassPicker selected={rootPc === null ? [] : [rootPc]} ontoggle={pickRoot} spell={spellRootButton} label="Root" />

  <div class="qualities" role="group" aria-label="Quality">
    {#each COMMON_QUALITIES as type (type.id)}
      <button type="button" class="quality" aria-pressed={qualityId === type.id} title={type.qualityName} onclick={() => pickQuality(type.id)}>
        {qualityLabel(type)}
      </button>
    {/each}
    <button type="button" class="quality more" aria-expanded={showMore} aria-controls="{uid}-more" onclick={() => (showMore = !showMore)}>
      {showMore ? 'Less' : 'More'}
    </button>
  </div>

  {#if showMore}
    <div class="qualities" id="{uid}-more" role="group" aria-label="More qualities">
      {#each MORE_QUALITIES as type (type.id)}
        <button type="button" class="quality" aria-pressed={qualityId === type.id} title={type.qualityName} onclick={() => pickQuality(type.id)}>
          {qualityLabel(type)}
        </button>
      {/each}
    </div>
  {/if}

  {#if bassChord}
    <div class="bass-row">
      <span class="row-label" id="{uid}-bass-label">Bass</span>
      <div class="qualities" role="group" aria-labelledby="{uid}-bass-label">
        {#each bassTones as t (t.interval)}
          <button
            type="button"
            class="quality bass"
            aria-pressed={currentBassPc === t.pc}
            title={t.interval === '1' ? 'Root position' : `${spellBass(t.pc)} in the bass`}
            onclick={() => pickBass(t.pc)}
          >
            {t.interval === '1' ? formatNote(t.note) : spellBass(t.pc)} <span class="interval">({intervalLabel(t.interval)})</span>
          </button>
        {/each}
        <button
          type="button"
          class="quality more"
          aria-expanded={showOtherBass}
          aria-controls="{uid}-other-bass"
          onclick={() => (showOtherBass = !showOtherBass)}
        >
          Other
        </button>
      </div>
      {#if showOtherBass}
        <div id="{uid}-other-bass">
          <PitchClassPicker
            selected={currentBassPc === null ? [] : [currentBassPc]}
            ontoggle={pickBass}
            spell={spellBass}
            label="Bass note"
          />
        </div>
      {/if}
    </div>
  {/if}

  <p class="hint muted" aria-live="polite">{hint}</p>

  <form class="text-entry" onsubmit={submit}>
    <label class="visually-hidden" for="{uid}-text">{single ? 'Chord symbol' : 'Chord symbols'}</label>
    <input
      id="{uid}-text"
      type="text"
      bind:value={text}
      oninput={onInput}
      placeholder={placeholder ?? (single ? 'Type a chord, e.g. C7/E' : 'Type chords, e.g. Am F C/E G7')}
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      enterkeyhint="done"
      aria-invalid={errors.length > 0}
      aria-describedby={errors.length ? `${uid}-errors` : undefined}
    />
    {#if !single}<button type="submit" class="add" disabled={text.trim() === ''}>Add</button>{/if}
  </form>

  {#if errors.length}
    <ul class="errors" id="{uid}-errors">
      {#each errors as token (token.start)}
        <li><code>{token.text}</code> {token.result.ok ? '' : token.result.error}</li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .chord-picker {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .qualities {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .quality {
    min-width: 52px;
    min-height: 40px;
    padding: 0 var(--space-3);
    border: 0;
    border-radius: var(--radius-sm);
    background: var(--surface-muted);
    box-shadow: inset 0 0 0 1px var(--divider);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    transition:
      background-color var(--duration) var(--easing),
      color var(--duration) var(--easing);
  }

  .quality:hover {
    box-shadow: inset 0 0 0 1px var(--accent-text);
  }

  .quality[aria-pressed='true'] {
    background: var(--accent);
    color: var(--accent-contrast);
    box-shadow: none;
  }

  .quality.more {
    background: transparent;
    box-shadow: none;
    color: var(--accent-text);
  }

  .quality.more:hover {
    background: var(--accent-soft);
  }

  .bass-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-top: var(--space-3);
    border-top: 1px solid var(--divider);
  }

  .row-label {
    color: var(--text-muted);
    font-size: 0.8125rem;
    font-weight: var(--font-weight-semibold);
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .quality.bass {
    white-space: nowrap;
  }

  .interval {
    color: var(--text-muted);
    font-weight: var(--font-weight-regular);
  }

  .quality[aria-pressed='true'] .interval {
    color: inherit;
    opacity: 0.85;
  }

  .hint {
    font-size: var(--font-size-sm);
  }

  .hint:empty {
    display: none;
  }

  .text-entry {
    display: flex;
    gap: var(--space-2);
  }

  input {
    flex: 1;
    min-width: 0;
    min-height: var(--touch-target);
    padding: 0 var(--space-3);
    border: 0;
    border-radius: var(--radius-sm);
    background: var(--surface-muted);
    box-shadow: inset 0 0 0 1px var(--divider);
    color: var(--text);
    font: inherit;
  }

  input::placeholder {
    color: var(--text-muted);
  }

  input[aria-invalid='true'] {
    box-shadow: inset 0 0 0 1.5px var(--q-dominant-edge);
  }

  input:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 1.5px var(--accent), var(--focus-ring);
  }

  .add {
    min-height: var(--touch-target);
    padding: 0 var(--space-4);
    border: 0;
    border-radius: var(--radius-sm);
    background: var(--accent);
    color: var(--accent-contrast);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
  }

  .add:hover {
    background: var(--accent-hover);
  }

  .add:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .errors {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--q-dominant-fg);
    font-size: var(--font-size-sm);
  }

  .errors code {
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    background: var(--q-dominant-bg);
    font-family: inherit;
    font-weight: var(--font-weight-semibold);
  }
</style>
