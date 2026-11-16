<!--
  Chord notes, one side of the Chords tab: pick or type one chord (the latest
  wins, kept in session.chordNotes) and see its notes bottom to top as voiced,
  each with its interval, the inversion (from the bass), other names for the
  same notes, and a large piano, in one full ChordCard, which can add the
  chord to the Key finder progression. Typing something that isn't a chord
  clears the card.
-->
<script lang="ts">
  import AddToProgression from '../components/AddToProgression.svelte';
  import ChordCard from '../components/ChordCard.svelte';
  import ChordPicker from '../components/ChordPicker.svelte';
  import { session } from '../stores/session.svelte';
  import { chordName, chordNoteDetails, type Chord } from '../theory';

  const chord = $derived(session.chordNotes);
  const details = $derived(chord ? chordNoteDetails(chord) : null);

  function pick(chords: Chord[]): void {
    session.chordNotes = chords[chords.length - 1] ?? null;
  }
</script>

<div class="view">
  <div class="card">
    <ChordPicker mode="single" bassRow chord={session.chordNotes} onpick={pick} placeholder="Type a chord, e.g. C7/E" />
  </div>

  {#if chord && details}
    <ChordCard
      {chord}
      pianoSize="large"
      notes={details.notes.map((n) => ({ note: n.note, label: n.label }))}
      alternates={details.alternates.map((c) => chordName(c))}
      tags={[details.inversion]}
    >
      {#snippet actions()}<AddToProgression {chord} />{/snippet}
    </ChordCard>
  {:else}
    <div class="card empty-state">
      <p class="empty-title">Pick a chord or type e.g. C7/E</p>
      <p class="empty-hint">Its notes show up here bottom to top, with their intervals and the inversion. Add a bass for an inversion or a slash chord.</p>
    </div>
  {/if}
</div>
