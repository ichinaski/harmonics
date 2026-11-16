<!--
  One card for every chord in the app. The layout never changes, top to
  bottom: roman numeral (when there is a key), name, quality badge and
  quality name, alternative names, note pills, piano (full size only), tags
  (score, plain tags, then the `extraTags` snippet, whose items can use
  class="tag"), and the action row with
  Play and Arpeggio (plus the `actions` snippet). The edge is colored by
  quality family.

  - `full`: everything, with a piano of the chord's voicing (bass at the
    bottom); `pianoSize="large"` for a single chord shown on its own.
  - `compact`: no piano, tighter padding.

  The card body is inert: only the buttons play, so scrolling a list never
  makes a sound. The buttons flash the piano keys. In a narrow card they
  shrink to icons (container query in PlayButtons).

  Note pills: 'selected' notes are filled, 'missing' ones outlined, 'omitted'
  ones dashed and struck through; notes without a state are plain. A pill can
  carry a small interval label ('♭7').
-->
<script module lang="ts">
  import type { Note } from '../theory';

  export type CardNoteState = 'plain' | 'selected' | 'missing' | 'omitted';

  export interface CardNote {
    note: Note;
    state?: CardNoteState;
    /** Interval label under the note name, e.g. '♭7' or 'bass'. */
    label?: string;
  }

  export type ChordCardSize = 'full' | 'compact';
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { playArpeggio, playChord, type NoteEvent } from '../audio/engine';
  import { chordName, chordVoicing, mod12, pitchClass, formatNote, type Chord } from '../theory';
  import Piano from './Piano.svelte';
  import { pianoRangeFor, whiteKeyCount } from './pianoLayout';
  import PlayButtons from './PlayButtons.svelte';
  import QualityBadge from './QualityBadge.svelte';
  import ScoreBar from './ScoreBar.svelte';

  interface Props {
    chord: Chord;
    size?: ChordCardSize;
    /** Main name; defaults to the chord symbol. */
    name?: string;
    /** Roman numeral above the name, when there is a key. */
    numeral?: string;
    /** Other names for the same notes (C6: Am7/C). */
    alternates?: readonly string[];
    /** Note pills; defaults to the voiced notes, bottom to top, plain. */
    notes?: readonly CardNote[];
    score?: number;
    /** Neutral tags, e.g. 'diatonic', '1st inversion'. */
    tags?: readonly string[];
    /** Emphasised card (e.g. a mode's characteristic chord). */
    highlight?: boolean;
    /** Piano size on full cards: 'mini' in result lists, 'large' for one chord on its own. */
    pianoSize?: 'mini' | 'large';
    /** Called with the played notes when Play or Arpeggio is pressed. */
    onplay?: (events: NoteEvent[]) => void;
    /** More tags after `tags`, e.g. an explanation. */
    extraTags?: Snippet;
    /** Links or buttons after Play and Arpeggio. */
    actions?: Snippet;
  }

  let {
    chord,
    size = 'full',
    name,
    numeral,
    alternates = [],
    notes,
    score,
    tags = [],
    highlight = false,
    pianoSize = 'mini',
    onplay,
    extraTags,
    actions,
  }: Props = $props();

  /** White key width of the card piano, in px: the same on every card, so their keys line up. */
  const WHITE_KEY_PX = { mini: 20, large: 30 } as const;

  let piano = $state<ReturnType<typeof Piano>>();

  const title = $derived(name ?? chordName(chord));
  const voicing = $derived(chordVoicing(chord));
  const midi = $derived(voicing.map((n) => n.midi));
  const pills = $derived<readonly CardNote[]>(notes ?? voicing.map((n) => ({ note: n.note })));
  const family = $derived(chord.type.family);

  // The piano shows the voicing; pills decide which keys are missing.
  const absentPcs = $derived(new Set(pills.filter((p) => p.state === 'missing' || p.state === 'omitted').map((p) => pitchClass(p.note))));
  const pianoSelected = $derived(midi.filter((m) => !absentPcs.has(mod12(m))));
  const pianoMissing = $derived(midi.filter((m) => absentPcs.has(mod12(m))));
  const range = $derived(pianoRangeFor(midi));
  const pianoWidth = $derived(whiteKeyCount(range.start, range.end - range.start + 1) * WHITE_KEY_PX[pianoSize]);

  const STATE_TEXT: Record<CardNoteState, string> = { plain: '', selected: '', missing: ', missing', omitted: ', omitted' };

  function played(events: NoteEvent[]): void {
    piano?.flash(events);
    onplay?.(events);
  }
</script>

<article class="chord-card {size}" class:highlight style:--edge="var(--q-{family}-edge)">
  {#if numeral}<span class="numeral">{numeral}</span>{/if}
  <h3 class="chord-symbol name">{title}</h3>

  <p class="quality">
    <QualityBadge {family} />
    {#if chord.type.qualityName !== family}<span>{chord.type.qualityName}</span>{/if}
  </p>

  {#if alternates.length}
    <p class="alternates">also <span class="alt-names">{alternates.join(', ')}</span></p>
  {/if}

  <ul class="pills" aria-label="Notes">
    {#each pills as p, i (i)}
      <li class="pill {p.state ?? 'plain'}" class:labelled={p.label !== undefined}>
        <span class="pill-note">{formatNote(p.note)}</span>
        {#if p.label !== undefined}<span class="pill-label">{p.label}</span>{/if}
        <span class="visually-hidden">{STATE_TEXT[p.state ?? 'plain']}</span>
      </li>
    {/each}
  </ul>

  {#if size === 'full'}
    <div class="card-piano {pianoSize}" style:width="{pianoWidth}px">
      <Piano
        bind:this={piano}
        size="mini"
        start={range.start}
        end={range.end}
        selected={pianoSelected}
        missing={pianoMissing}
        bass={chord.bass ? midi[0] : null}
        label="{title} on the piano"
      />
    </div>
  {/if}

  {#if score !== undefined || tags.length || extraTags}
    <div class="tags">
      {#if score !== undefined}<ScoreBar {score} label="{title} score" />{/if}
      {#each tags as tag (tag)}<span class="tag">{tag}</span>{/each}
      {@render extraTags?.()}
    </div>
  {/if}

  <footer class="actions">
    <PlayButtons label={title} onplay={() => played(playChord(midi))} onarpeggio={() => played(playArpeggio(midi))} />
    {@render actions?.()}
  </footer>
</article>

<style>
  .chord-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-4) var(--space-4) var(--space-4) calc(var(--space-4) + 4px);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow);
    overflow: hidden;
    container-type: inline-size;
  }

  .chord-card.compact {
    gap: 6px;
    padding: var(--space-3) var(--space-3) var(--space-3) calc(var(--space-3) + 4px);
  }

  .chord-card::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 4px;
    background: var(--edge);
  }

  .chord-card.highlight {
    box-shadow:
      var(--shadow),
      inset 0 0 0 2px var(--edge);
  }

  .numeral {
    color: var(--accent-text);
    font-size: 0.875rem;
    font-weight: var(--font-weight-semibold);
    letter-spacing: 0.02em;
    line-height: 1.2;
  }

  .name {
    margin: 0;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }

  .quality {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-2);
    color: var(--text-muted);
    font-size: var(--font-size-sm);
  }

  .alternates {
    color: var(--text-muted);
    font-size: var(--font-size-sm);
  }

  .alt-names {
    color: var(--text);
    font-weight: var(--font-weight-semibold);
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
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    height: 26px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-pill);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    line-height: 1.1;
  }

  .pill.labelled {
    min-width: 40px;
    height: auto;
    padding: 3px var(--space-2);
    border-radius: var(--radius-sm);
  }

  .pill-label {
    font-size: 0.75rem;
    font-weight: var(--font-weight-regular);
    opacity: 0.8;
  }

  .pill.plain {
    background: var(--bg);
    color: var(--text);
  }

  .pill.plain .pill-label {
    color: var(--text-muted);
    opacity: 1;
  }

  .pill.selected {
    background: var(--accent);
    color: var(--accent-contrast);
  }

  .pill.missing {
    box-shadow: inset 0 0 0 1.5px var(--accent-text);
    color: var(--accent-text);
  }

  .pill.omitted {
    border: 1.5px dashed var(--text-muted);
    color: var(--text-muted);
    text-decoration: line-through;
  }

  .card-piano {
    max-width: 100%;
    margin-top: var(--space-1);
  }

  .card-piano.large :global(.piano-wrap.mini) {
    --white-h: 112px;
    --key-radius: 5px;
  }

  .tags {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-2);
  }

  /* Global so tags passed in `extraTags` can use the class too. */
  .tags :global(.tag) {
    padding: 2px var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--bg);
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: var(--font-weight-semibold);
  }

  .actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: auto;
    padding-top: var(--space-1);
  }
</style>
