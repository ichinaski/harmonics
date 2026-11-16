<!--
  The About dialog, opened from the footer: what Harmonics is, short tips per
  tool, credits and the version (commit and build date, set at build time by
  Vite `define`, see vite.config.ts). A native modal <dialog>: it keeps focus
  inside, closes with Esc, the ✕ button or a tap outside, and gives focus
  back to the button that opened it.
-->
<script module lang="ts">
  export const REPO_URL = 'https://github.com/ichinaski/harmonics';
</script>

<script lang="ts">
  const base = import.meta.env.BASE_URL;
  const version = `${__APP_COMMIT__} · ${__APP_BUILD_DATE__}`;

  let dialog = $state<HTMLDialogElement>();
  let opener: HTMLElement | null = null;

  /** Opens the dialog; focus goes back to `from` when it closes. */
  export function open(from?: HTMLElement): void {
    opener = from ?? (document.activeElement as HTMLElement | null);
    dialog?.showModal();
  }

  function close(): void {
    dialog?.close();
  }

  function onClose(): void {
    opener?.focus();
    opener = null;
  }

  /** A tap on the backdrop lands on the <dialog> itself, outside its content box. */
  function onClick(event: MouseEvent): void {
    if (event.target === dialog) close();
  }
</script>

<dialog bind:this={dialog} class="about-dialog" aria-labelledby="about-title" onclose={onClose} onclick={onClick}>
  <div class="content">
    <header class="head">
      <h2 id="about-title">About Harmonics</h2>
      <button type="button" class="close" aria-label="Close" onclick={close}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
      </button>
    </header>

    <p>
      Music theory tools for transcribing and composing, right in the browser. The code is on
      <a href={REPO_URL} target="_blank" rel="noopener">GitHub</a>.
    </p>

    <section aria-labelledby="about-tips">
      <h3 id="about-tips">How to use</h3>
      <dl class="tips">
        <dt>Find chord</dt>
        <dd>Select the notes you hear on the piano or by name. On the piano the lowest note is the bass; to pick another, tap it in the Bass row below the keys. Add to progression sends a chord to the Key tab.</dd>
        <dt>Chord notes</dt>
        <dd>Pick a chord or type one like <code>C7/E</code> to see its notes bottom to top, with intervals and the inversion.</dd>
        <dt>Key</dt>
        <dd>Add a few chords, or type <code>Am F C G</code>, to rank the likely keys. Play progression plays them in order.</dd>
        <dt>Harmonize</dt>
        <dd>Pick a key or mode to see its chords on each degree, secondary dominants and borrowed chords.</dd>
        <dt>Scales</dt>
        <dd>Select the notes of a melody to find the scales that contain them.</dd>
        <dt>Sheet</dt>
        <dd>Type a song’s chords as text, like <code>| C | Am F |</code>, to get a chord sheet to print or save as PDF. The song is kept in the page address, so bookmark it, or use Copy link to share it. New clears the sheet (with Undo); a new visit starts empty, and Continue last song picks up where you left off. The app picks one text size for the whole sheet, small enough for the busiest bar; Bars per row and Fit to (1 or 2 pages) keep long songs short. The Syntax guide shows everything it understands.</dd>
      </dl>
    </section>

    <section aria-labelledby="about-credits">
      <h3 id="about-credits">Credits</h3>
      <ul class="credits">
        <li>Instruments played with <a href="https://github.com/danigb/smplr" target="_blank" rel="noopener">smplr</a> (MIT).</li>
        <li>
          <a href="https://github.com/gleitz/midi-js-soundfonts" target="_blank" rel="noopener">FluidR3_GM</a> samples by Frank Wen
          (<a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener">CC BY 3.0</a>,
          <a href="{base}samples/CREDITS.txt" target="_blank" rel="noopener">details</a>).
        </li>
        <li>
          <a href="https://rsms.me/inter/" target="_blank" rel="noopener">Inter</a> font
          (<a href="{base}fonts/Inter-LICENSE.txt" target="_blank" rel="noopener">SIL OFL 1.1</a>).
        </li>
      </ul>
    </section>

    <p class="version">Version {version}</p>
  </div>
</dialog>

<style>
  .about-dialog {
    width: min(32rem, calc(100vw - 2 * var(--space-4)));
    max-height: calc(100dvh - 2 * var(--space-4));
    padding: 0;
    border: 0;
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }

  .about-dialog::backdrop {
    background: rgb(15 23 42 / 0.45);
  }

  .content {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-5);
    font-size: var(--font-size-sm);
    line-height: 1.5;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  h2 {
    font-size: var(--font-size-lg);
  }

  h3 {
    margin-bottom: var(--space-2);
    color: var(--text-muted);
    font-size: 0.8125rem;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 36px;
    height: 36px;
    margin-right: calc(-1 * var(--space-2));
    border: 0;
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }

  .close:hover {
    background: var(--surface-muted);
    color: var(--text);
  }

  .tips {
    display: grid;
    gap: var(--space-2);
    margin: 0;
  }

  dt {
    font-weight: var(--font-weight-semibold);
  }

  dd {
    margin: 0 0 var(--space-1);
    color: var(--text-muted);
  }

  code {
    padding: 0 4px;
    border-radius: var(--radius-sm);
    background: var(--bg);
    color: var(--text);
    font-family: inherit;
    font-weight: var(--font-weight-semibold);
  }

  .credits {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: 0;
    padding-left: var(--space-4);
    color: var(--text-muted);
  }

  .version {
    color: var(--text-muted);
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
  }

  @media (pointer: coarse) {
    .close {
      width: 44px;
      height: 44px;
    }
  }
</style>
