<!--
  The Sheet tab's editor (#/sheet): type a song's chords as text and get a
  chord sheet to print or save as PDF. Title and Artist fields and a plain
  textarea on one side, the live preview (what prints) on the other; on
  narrow screens an Edit / Preview switch shows one at a time. The toolbar
  starts a new sheet, prints, copies the text or the link, downloads and
  opens .txt files, and
  has the Layout group: bars per row (as typed, or 4, 6 or 8 reflowed) and
  Fit to (1 or 2 pages). The preview is the print layout, scaled to the pane
  (or at 100%, scrolling); its header says how long the printout is, at what
  scale, and which bars (if any) are too busy to fit on one line.
  SheetPageMeasure measures the pages, the sheet's one scale and the page
  breaks, which the preview shows and the printout applies. The song
  lives in the URL (stores/sheet.svelte.ts).
  New, Load example, Open file and pasting a full song act at once and show
  an Undo toast for UNDO_MS. An empty sheet on a new visit offers to continue
  the last song kept in the browser.
  The syntax guide (#/sheet/syntax) is SheetSyntax.svelte.

  Problems are hard to miss: they're listed under the editor (about 600 ms
  after typing stops, the first 5 and then "Show all"; picking one selects its
  token), marked in the preview (screen only) and announced by a banner above
  the preview and a count on the Edit switch. Errors (what won't print as
  intended) are red, and Print asks first while there are any; warnings
  ("notes": a line read as lyrics or as a section) are amber and never ask.
  On narrow screens the Layout group folds behind a Layout button.
-->
<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import SheetPageMeasure from '../components/SheetPageMeasure.svelte';
  import SheetPreview from '../components/SheetPreview.svelte';
  import { resolveRoute, SHEET_EDITOR_PATH } from '../routes';
  import { EXAMPLE_SONG } from '../sheet/example';
  import { formatSheetIssue, type SheetIssue } from '../sheet/model';
  import { LYRIC_LINE_MESSAGE } from '../sheet/parse';
  import { likelyPaperSize, PRINT_WIDTH_PX, SHEET_FIT_PAGES, sheetLengthText, type PageStarts, type SheetFitPages, type SheetLength } from '../sheet/fit';
  import { barsScaleLimit, SHEET_BARS_PER_ROW, textOffset, type SheetBarsPerRow } from '../sheet/render';
  import { session, type SheetPane, type SheetZoom } from '../stores/session.svelte';
  import { sheet } from '../stores/sheet.svelte';

  const SYNTAX_GUIDE_HREF = '#/sheet/syntax';
  const STATUS_MS = 4000;
  /** How long the Undo toast stays (paused while it's hovered or focused). */
  const UNDO_MS = 6000;
  /** New problems show this long after the last keystroke, so half-typed chords aren't flagged. */
  const ISSUES_DELAY_MS = 600;
  /** Problems listed before "Show all". */
  const COLLAPSED_ISSUES = 5;

  const FIT_LABELS: Record<SheetFitPages, string> = { 0: 'Off', 1: '1 page', 2: '2 pages' };
  const BARS_PER_ROW_LABELS: Record<SheetBarsPerRow, string> = { typed: 'As typed', 4: '4', 6: '6', 8: '8' };
  const ZOOMS: { id: SheetZoom; label: string }[] = [
    { id: 'fit', label: 'Fit width' },
    { id: 'full', label: '100%' },
  ];
  const PANES: { id: SheetPane; label: string }[] = [
    { id: 'edit', label: 'Edit' },
    { id: 'preview', label: 'Preview' },
  ];
  const PLACEHOLDER = '[Verse]\n| C | Am | F | G |\n| Dm7 G7 | C ||';

  let textarea = $state<HTMLTextAreaElement>();
  let fileInput = $state<HTMLInputElement>();
  let printDialog = $state<HTMLDialogElement>();
  let issueList = $state<HTMLUListElement>();
  /** The last action's confirmation or error ("Link copied"); a polite live region announces it. */
  let status = $state<{ text: string; id: number } | null>(null);
  let statusTimer: ReturnType<typeof setTimeout> | undefined;
  let undoTimer: ReturnType<typeof setTimeout> | undefined;
  /** The pointer or the focus is on the Undo toast, so it doesn't go away under it. */
  let undoHeld = $state(false);
  /** document.title while printing: Chrome uses it as the PDF file name. */
  let titleBeforePrint: string | null = null;
  /** False while typing, until ISSUES_DELAY_MS after the last keystroke. */
  let settled = $state(true);
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  let showAllIssues = $state(false);
  /** The Layout group on narrow screens (folded by default; always open on wide ones). */
  let layoutOpen = $state(false);
  /** The printed length and the sheet's scale, and where the pages start, from SheetPageMeasure. */
  let length = $state<SheetLength | null>(null);
  let pageStarts = $state.raw<PageStarts | null>(null);
  let pageMeasure = $state<{ measureNow(): void }>();

  const song = $derived(sheet.sheet.song);
  const issues = $derived(sheet.sheet.issues);
  /** The problems on show: the parser's, but not while typing (the list keeps the last ones until typing stops). */
  let shownIssues = $state<readonly SheetIssue[]>(sheet.sheet.issues);
  const errorCount = $derived(shownIssues.filter((i) => i.severity === 'error').length);
  const warningCount = $derived(shownIssues.length - errorCount);
  /** Every warning is a lyric line, so the banner can say what happened. */
  const onlyLyricWarnings = $derived(shownIssues.every((i) => i.severity === 'error' || i.message === LYRIC_LINE_MESSAGE));
  /** Errors right now (not the delayed list): Print asks first only for these. */
  const printErrors = $derived(issues.filter((i) => i.severity === 'error'));
  const listedIssues = $derived(showAllIssues ? shownIssues : shownIssues.slice(0, COLLAPSED_ISSUES));
  const bodyEmpty = $derived(sheet.body.trim() === '');
  const songEmpty = $derived(song.sections.length === 0 && !song.title && !song.artist);
  /** The scale the busiest bar allows, and the bars too busy to fit even at the smallest scale. */
  const barsLimit = $derived(barsScaleLimit(song, sheet.barsPerRow, PRINT_WIDTH_PX));
  /** The sheet's one scale: 100% or the busiest bar's limit without Fit to; Fit to's, once measured. */
  const scale = $derived(sheet.fitPages === 0 ? Math.min(1, barsLimit.scale) : (length?.scale ?? Math.min(1, barsLimit.scale)));
  /** Without Fit to, the page count is for this paper size (the other one is in a tooltip when it differs). */
  const paper = likelyPaperSize(typeof navigator === 'undefined' ? '' : navigator.language);
  const lengthText = $derived(length && !songEmpty ? sheetLengthText(length, sheet.fitPages, paper, barsLimit.crowdedLines) : null);
  /** Fit to is on but the sheet can't fit even at the smallest size. */
  const cantFit = $derived(sheet.fitPages !== 0 && length !== null && !length.fits);

  // Each new Undo toast stays UNDO_MS, counted again after it's let go.
  $effect(() => {
    const notice = sheet.undoNotice;
    clearTimeout(undoTimer);
    if (!notice || undoHeld) return;
    undoTimer = setTimeout(() => {
      if (sheet.undoNotice?.id === notice.id) sheet.dismissUndo();
    }, UNDO_MS);
  });

  $effect(() => {
    const next = issues;
    if (settled || next.length === 0) shownIssues = next;
  });

  function errorsText(count: number): string {
    return count === 1 ? '1 error' : `${count} errors`;
  }

  /** Warnings are called notes in the app: things read in a way you may not have meant. */
  function notesText(count: number): string {
    return count === 1 ? '1 note' : `${count} notes`;
  }

  function loadFromLocation(): void {
    if (resolveRoute(location.hash).path === SHEET_EDITOR_PATH) void sheet.loadFromHash(location.hash);
  }

  onMount(loadFromLocation);

  onDestroy(() => {
    clearTimeout(statusTimer);
    clearTimeout(settleTimer);
    clearTimeout(undoTimer);
  });

  function showStatus(text: string): void {
    status = { text, id: (status?.id ?? 0) + 1 };
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => (status = null), STATUS_MS);
  }

  function typed(): void {
    settled = false;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => (settled = true), ISSUES_DELAY_MS);
  }

  /** Typing in the editor. Finished Title: and Artist: lines at the top move into the fields; the caret stays put. */
  async function onBodyInput(event: Event & { currentTarget: HTMLTextAreaElement }): Promise<void> {
    const el = event.currentTarget;
    const value = el.value;
    const caret = el.selectionStart;
    typed();
    sheet.setBody(value);
    if (sheet.body === value) return;
    await tick();
    const position = Math.max(0, caret - (value.length - sheet.body.length));
    el.setSelectionRange(position, position);
  }

  function onPaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (sheet.pasteSong(text)) event.preventDefault();
  }

  async function copyText(): Promise<void> {
    showStatus((await sheet.copyText()) ? 'Text copied' : 'Couldn’t copy: the browser blocked the clipboard');
  }

  async function copyLink(): Promise<void> {
    showStatus((await sheet.copyLink()) ? 'Link copied' : 'Couldn’t copy: the browser blocked the clipboard. Copy the address bar instead.');
  }

  function download(): void {
    sheet.download();
  }

  async function onFileChosen(): Promise<void> {
    const input = fileInput;
    const file = input?.files?.[0];
    if (!input || !file) return;
    const result = await sheet.openFile(file);
    input.value = '';
    if (!result.ok) showStatus(result.error);
  }

  function loadExample(): void {
    sheet.replaceSong(EXAMPLE_SONG, 'Example loaded');
  }

  function undo(): void {
    // The toast goes away under the pointer and the focus, so neither leaves it.
    undoHeld = false;
    // The Undo button goes away, so focus returns to the editor instead of the page body.
    void sheet.undo().then(() => textarea?.focus({ preventScroll: true }));
  }

  function onUndoFocusOut(event: FocusEvent & { currentTarget: HTMLElement }): void {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) undoHeld = false;
  }

  /** Selects the issue's token in the editor and scrolls it into view. */
  async function goToIssue(issue: SheetIssue): Promise<void> {
    session.sheetPane = 'edit';
    await tick();
    const el = textarea;
    if (!el) return;
    const start = textOffset(sheet.body, issue.line, issue.column);
    const lineEnd = textOffset(sheet.body, issue.line, Number.MAX_SAFE_INTEGER);
    el.focus();
    el.setSelectionRange(start, Math.min(lineEnd, start + issue.token.length));
    el.scrollTop = Math.max(0, offsetTop(el, start) - el.clientHeight / 3);
  }

  /** How far down the textarea's content the text at `offset` is, with soft wrapping: measured on a hidden copy. */
  function offsetTop(el: HTMLTextAreaElement, offset: number): number {
    const style = getComputedStyle(el);
    const copy = document.createElement('div');
    for (const name of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'tabSize', 'whiteSpace', 'overflowWrap', 'wordBreak'] as const) {
      copy.style[name] = style[name];
    }
    const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    Object.assign(copy.style, { position: 'absolute', visibility: 'hidden', top: '0', left: '0', boxSizing: 'content-box', padding: '0', width: `${el.clientWidth - padding}px` });
    copy.textContent = el.value.slice(0, offset);
    const marker = document.createElement('span');
    marker.textContent = '\u200b';
    copy.append(marker);
    document.body.append(copy);
    const top = marker.offsetTop + parseFloat(style.paddingTop);
    copy.remove();
    return top;
  }

  /** The banner's Show: the editor with the whole problem list, scrolled to it, focus on the first problem. */
  async function showIssues(): Promise<void> {
    session.sheetPane = 'edit';
    showAllIssues = true;
    await tick();
    const first = issueList?.querySelector('button');
    issueList?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    first?.focus({ preventScroll: true });
  }

  /** Print, asking first when the sheet has errors (warnings print as shown). */
  function print(): void {
    if (printErrors.length > 0) printDialog?.showModal();
    else window.print();
  }

  function printAnyway(): void {
    printDialog?.close();
    // After the dialog has closed, so it isn't in the printout.
    setTimeout(() => window.print(), 0);
  }

  function fixFirst(): void {
    printDialog?.close();
    const first = printErrors[0];
    if (first) void goToIssue(first);
  }

  function onBeforePrint(): void {
    // The page breaks for the song as it is now, even right after a keystroke.
    pageMeasure?.measureNow();
    if (titleBeforePrint !== null) return;
    titleBeforePrint = document.title;
    const name = [song.title, song.artist].filter(Boolean).join(' – ');
    if (name) document.title = name;
  }

  function onAfterPrint(): void {
    if (titleBeforePrint === null) return;
    document.title = titleBeforePrint;
    titleBeforePrint = null;
  }
</script>

<svelte:window onhashchange={loadFromLocation} onbeforeprint={onBeforePrint} onafterprint={onAfterPrint} />

{#snippet icon(path: string)}
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <path d={path} fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
{/snippet}

<section class="view sheet-view" aria-labelledby="sheet-title">
  <div class="sheet-top">
    <h1 id="sheet-title" class="view-title">Sheet</h1>
    <div class="segmented pane-switch" role="group" aria-label="Show">
      {#each PANES as pane (pane.id)}
        <button type="button" aria-pressed={session.sheetPane === pane.id} onclick={() => (session.sheetPane = pane.id)}>
          {pane.label}{#if pane.id === 'edit' && errorCount > 0}<span class="count-badge" aria-hidden="true">{errorCount}</span><span
              class="visually-hidden">, {errorsText(errorCount)}</span
            >{:else if pane.id === 'edit' && warningCount > 0}<span class="count-badge count-notes" aria-hidden="true">{warningCount}</span><span
              class="visually-hidden">, {notesText(warningCount)}</span
            >{/if}
        </button>
      {/each}
    </div>
  </div>

  {#if sheet.linkError}
    <p class="link-error" role="alert">{sheet.linkError}</p>
  {/if}

  <div class="toolbar">
    <div class="actions" role="group" aria-label="Sheet actions">
      <button type="button" class="tool" onclick={() => sheet.newSheet()}>
        {@render icon('M4 2.5h5l3 3v8H4zM8 7.25v4.5M5.75 9.5h4.5')}New
      </button>
      <button type="button" class="tool" onclick={print}>
        {@render icon('M4.5 6V2.5h7V6M4.5 11.5h-2v-5.5h11v5.5h-2M4.5 9h7v4.5h-7z')}Print / PDF
      </button>
      <button type="button" class="tool" onclick={copyText}>
        {@render icon('M5.5 5.5h7v8h-7zM3.5 10.5v-8h7')}Copy text
      </button>
      <button type="button" class="tool" onclick={download}>
        {@render icon('M8 2.5v8M4.5 7l3.5 3.5L11.5 7M3 13.5h10')}Download text
      </button>
      <button type="button" class="tool" onclick={() => fileInput?.click()}>
        {@render icon('M2.5 4h4l1.5 1.5h5.5v7.5h-11z')}Open file
      </button>
      <input bind:this={fileInput} class="visually-hidden" type="file" accept=".txt,text/plain" tabindex="-1" aria-hidden="true" onchange={onFileChosen} />
      <button type="button" class="tool" onclick={copyLink}>
        {@render icon('M6.5 9.5l3-3M7.5 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M8.5 11.5l-1 1A2.5 2.5 0 0 1 4 9l1-1')}Copy link
      </button>
    </div>
    <div class="toolbar-links">
      <a class="guide-link" href={SYNTAX_GUIDE_HREF} target="_blank" rel="noopener">
        {@render icon('M8 4.5C6.5 3.3 4.6 3 2.5 3.2v9.3c2.1-.2 4 .1 5.5 1.3 1.5-1.2 3.4-1.5 5.5-1.3V3.2C11.4 3 9.5 3.3 8 4.5zM8 4.5v9.3')}Syntax guide<span class="visually-hidden"> (opens in a new tab)</span>
      </a>
      <!-- Narrow screens only: the Layout group folds behind this. -->
      <button type="button" class="tool layout-toggle" aria-expanded={layoutOpen} aria-controls="sheet-layout" onclick={() => (layoutOpen = !layoutOpen)}>
        {@render icon('M2.5 4.5h11M2.5 8h11M2.5 11.5h11M5.5 3v3M10.5 6.5v3M7 10v3')}Layout{#if cantFit}<span class="fit-warning" aria-hidden="true">!</span><span
            class="visually-hidden">, doesn’t fit</span
          >{/if}<svg class="chevron" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"
          ><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg
        >
      </button>
    </div>
    <div id="sheet-layout" class="layout-group" class:folded={!layoutOpen} role="group" aria-label="Layout">
      <div class="layout-control">
        <span class="layout-label" id="bars-per-row-label">Bars per row</span>
        <div class="segmented" role="group" aria-labelledby="bars-per-row-label">
          {#each SHEET_BARS_PER_ROW as bars (bars)}
            <button type="button" aria-pressed={sheet.barsPerRow === bars} onclick={() => sheet.setBarsPerRow(bars)}>{BARS_PER_ROW_LABELS[bars]}</button>
          {/each}
        </div>
      </div>
      <div class="layout-control">
        <span class="layout-label" id="fit-to-label">Fit to</span>
        <div class="segmented" role="group" aria-labelledby="fit-to-label">
          {#each SHEET_FIT_PAGES as pages (pages)}
            <button type="button" aria-pressed={sheet.fitPages === pages} onclick={() => sheet.setFitPages(pages)}
              >{FIT_LABELS[pages]}{#if cantFit && sheet.fitPages === pages}<span class="fit-warning" aria-hidden="true">!</span><span class="visually-hidden"
                  >, doesn’t fit</span
                >{/if}</button
            >
          {/each}
        </div>
      </div>
    </div>
    <!-- In the gap under the toolbar, so a message never moves the page. -->
    <p class="sheet-status" role="status">
      {#if status}{#key status.id}<span class="status-text" title={status.text}>{status.text}</span>{/key}{/if}
    </p>
  </div>

  <div class="panes" data-pane={session.sheetPane}>
    <div class="card editor-pane">
      <!-- A new visit (or New) starts empty; the last song kept in the browser loads only from here. -->
      {#if sheet.lastSong && sheet.isEmpty}
        <p class="start-hint">
          <button type="button" class="link-button continue-button" onclick={() => sheet.continueLastSong()}
            >{sheet.lastSong.title ? `Continue last song: ${sheet.lastSong.title}` : 'Continue last song'}</button
          >
        </p>
      {/if}
      <div class="fields">
        <label class="field">
          <span class="field-label">Title</span>
          <input type="text" data-qa="sheet-title" value={sheet.title} autocomplete="off" oninput={(e) => sheet.setTitle(e.currentTarget.value)} />
        </label>
        <label class="field">
          <span class="field-label">Artist</span>
          <input type="text" value={sheet.artist} autocomplete="off" oninput={(e) => sheet.setArtist(e.currentTarget.value)} />
        </label>
      </div>
      <label class="field">
        <span class="field-label">Chords</span>
        <textarea
          bind:this={textarea}
          class="song-text"
          rows="16"
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"
          placeholder={PLACEHOLDER}
          value={sheet.body}
          aria-describedby={shownIssues.length > 0 ? 'sheet-issues-title' : undefined}
          oninput={onBodyInput}
          onpaste={onPaste}
        ></textarea>
      </label>

      {#if bodyEmpty}
        <p class="start-hint">
          New here?
          <button type="button" class="link-button" onclick={loadExample}>Load example</button>
          to see how it works.
        </p>
      {/if}

      {#if shownIssues.length > 0}
        <div class="issues">
          <h2 id="sheet-issues-title" class="issues-title">
            {[errorCount && errorsText(errorCount), warningCount && notesText(warningCount)].filter(Boolean).join(', ')}
            <span class="issues-hint"
              >{errorCount > 0 ? '(the sheet still prints; what can’t be read prints as typed)' : '(the sheet prints as shown; check these were read as you meant)'}</span
            >
          </h2>
          <ul class="issue-list" bind:this={issueList}>
            {#each listedIssues as issue, i (i)}
              <li>
                <button type="button" class="issue issue-{issue.severity}" onclick={() => goToIssue(issue)}>
                  <span class="issue-mark" aria-hidden="true">{issue.severity === 'error' ? '!' : 'i'}</span>
                  <span><span class="visually-hidden">{issue.severity === 'error' ? 'Error' : 'Note'}: </span>{formatSheetIssue(issue)}</span>
                </button>
              </li>
            {/each}
          </ul>
          {#if shownIssues.length > COLLAPSED_ISSUES}
            <button type="button" class="link-button show-all" aria-expanded={showAllIssues} onclick={() => (showAllIssues = !showAllIssues)}>
              {showAllIssues ? 'Show fewer' : `Show all ${shownIssues.length}`}
            </button>
          {/if}
        </div>
      {/if}
    </div>

    <div class="preview-pane" role="region" aria-label="Preview">
      {#if songEmpty}
        <div class="card empty-state preview-empty">
          <p class="empty-title">Your chord sheet shows up here</p>
          <p class="empty-hint">Type a song in the editor, or load the example to see how it works.</p>
        </div>
      {:else}
        {#if errorCount > 0}
          <div class="problem-banner">
            <span class="problem-icon" aria-hidden="true">⚠</span>
            <span class="problem-text"
              ><strong>{errorsText(errorCount)}:</strong> these won’t print as intended.{warningCount > 0 ? ` Also ${notesText(warningCount)}.` : ''}</span
            >
            <button type="button" class="link-button problem-show" onclick={showIssues}>Show<span class="visually-hidden"> the errors</span></button>
          </div>
        {:else if warningCount > 0}
          <div class="problem-banner notes-banner">
            <span class="problem-icon" aria-hidden="true">ℹ</span>
            <span class="problem-text"
              ><strong>{notesText(warningCount)}:</strong>
              {onlyLyricWarnings ? 'lyric lines are shown as notes.' : 'check these lines were read as you meant.'}</span
            >
            <button type="button" class="link-button problem-show" onclick={showIssues}>Show<span class="visually-hidden"> the notes</span></button>
          </div>
        {/if}
        <div class="preview-head">
          <p class="sheet-length" class:does-not-fit={cantFit} title={lengthText?.detail ?? undefined} aria-live="polite">
            {#if lengthText}{@render icon('M4 2.5h5.5l2.5 2.5v8.5H4zM9.5 2.5V5H12')}<span
                >{lengthText.text}{#if lengthText.detail}<span class="visually-hidden"> ({lengthText.detail})</span>{/if}{#if lengthText.crowded}. {lengthText.crowded}{/if}</span
              >{/if}
          </p>
          <div class="segmented zoom" role="group" aria-label="Preview zoom">
            {#each ZOOMS as zoom (zoom.id)}
              <button type="button" aria-pressed={session.sheetZoom === zoom.id} onclick={() => (session.sheetZoom = zoom.id)}>{zoom.label}</button>
            {/each}
          </div>
        </div>
        <SheetPreview
          {song}
          barsPerRow={sheet.barsPerRow}
          {scale}
          {pageStarts}
          screenPaper={paper}
          fitWidth={session.sheetZoom === 'fit'}
          marks={settled}
        />
      {/if}
    </div>
  </div>

  {#if !songEmpty}
    <SheetPageMeasure bind:this={pageMeasure} {song} barsPerRow={sheet.barsPerRow} fitPages={sheet.fitPages} bind:length bind:pageStarts />
  {/if}

  <!-- The Undo toast after New, Load example, Open file or a pasted song. -->
  <div
    class="undo-toast-region"
    role="status"
    aria-live="polite"
    onmouseenter={() => (undoHeld = true)}
    onmouseleave={() => (undoHeld = false)}
    onfocusin={() => (undoHeld = true)}
    onfocusout={onUndoFocusOut}
  >
    {#if sheet.undoNotice}
      {#key sheet.undoNotice.id}
        <div class="undo-toast">
          <span class="undo-text">{sheet.undoNotice.message}.</span>
          <button type="button" class="undo-button" onclick={undo}>Undo</button>
        </div>
      {/key}
    {/if}
  </div>

  <dialog bind:this={printDialog} class="print-dialog" aria-labelledby="print-dialog-title">
    <h2 id="print-dialog-title" class="print-dialog-title">This sheet has {errorsText(printErrors.length)}. Print anyway?</h2>
    <p class="print-dialog-text">What can’t be read prints as typed.</p>
    <div class="print-dialog-actions">
      <button type="button" class="tool" onclick={printAnyway}>Print anyway</button>
      <!-- svelte-ignore a11y_autofocus -->
      <button type="button" class="tool tool-primary" autofocus onclick={fixFirst}>Fix first</button>
    </div>
  </dialog>
</section>

<style>
  .sheet-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .link-error {
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius);
    background: var(--q-dominant-bg);
    color: var(--q-dominant-fg);
    font-size: var(--font-size-sm);
  }

  .toolbar,
  .actions,
  .toolbar-links,
  .layout-group {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }

  .toolbar {
    position: relative;
  }

  .tool,
  .guide-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 36px;
    padding: 0 var(--space-3);
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--divider);
    color: var(--text);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    white-space: nowrap;
    text-decoration: none;
    cursor: pointer;
    transition: background-color var(--duration) var(--easing);
  }

  .tool:hover,
  .guide-link:hover {
    background: var(--surface-muted);
  }

  .guide-link {
    box-shadow: none;
    background: transparent;
    color: var(--accent-text);
  }

  .guide-link:hover {
    background: var(--accent-soft);
  }

  /* Phones: the six actions in one row, icon above a short label, like the bottom tab bar. */
  @media (max-width: 560px) {
    .toolbar {
      flex-direction: column;
      align-items: stretch;
    }

    .toolbar-links {
      justify-content: space-between;
    }

    .actions {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: var(--space-1);
    }

    .actions .tool {
      flex-direction: column;
      justify-content: center;
      gap: 2px;
      min-height: 52px;
      padding: var(--space-1) 2px;
      border-radius: var(--radius);
      font-size: 0.6875rem;
      line-height: 1.2;
      white-space: normal;
      text-align: center;
    }
  }

  /* The Layout group gets a line of its own under the actions. */
  .layout-group {
    flex-basis: 100%;
    gap: var(--space-2) var(--space-4);
  }

  .layout-toggle {
    display: none;
  }

  .layout-toggle .chevron {
    transition: transform var(--duration) var(--easing);
  }

  .layout-toggle[aria-expanded='true'] .chevron {
    transform: rotate(180deg);
  }

  /* Narrow screens: the Layout group folds behind the Layout button (the page count stays above the preview). */
  @media (max-width: 799.98px) {
    .layout-toggle {
      display: inline-flex;
    }

    .layout-group.folded {
      display: none;
    }
  }

  .layout-control {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  .layout-label {
    color: var(--text-muted);
    font-size: 0.8125rem;
    font-weight: var(--font-weight-semibold);
    white-space: nowrap;
  }

  .layout-control .segmented > button {
    padding: 0 var(--space-2);
  }

  /* Fit to can't make it: a mark on the selected button (the preview header says why). */
  .fit-warning {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 15px;
    height: 15px;
    margin-left: 5px;
    border-radius: 50%;
    background: var(--q-major-bg);
    color: var(--q-major-fg);
    box-shadow: inset 0 0 0 1px var(--q-major-edge);
    font-size: 0.6875rem;
    font-weight: var(--font-weight-semibold);
    line-height: 1;
  }

  /* Above the paper: the printed length and the zoom (screen only). */
  .preview-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2) var(--space-3);
    margin-bottom: var(--space-2);
  }

  .sheet-length {
    display: flex;
    flex: 1 1 12rem;
    align-items: flex-start;
    gap: 6px;
    min-width: 0;
    color: var(--text-muted);
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
  }

  .sheet-length :global(svg) {
    flex: none;
    margin-top: 1px;
  }

  .sheet-length.does-not-fit {
    padding: 2px var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--q-major-bg);
    color: var(--q-major-fg);
  }

  .zoom > button {
    padding: 0 var(--space-2);
    font-size: 0.8125rem;
  }

  /* Phones: labels above the buttons. */
  @media (max-width: 560px) {
    .layout-control {
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
    }
  }

  /* One line in the gap under the toolbar (the view's gap is 16px), so messages never move anything. */
  .sheet-status {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    height: var(--space-4);
    color: var(--text-muted);
    font-size: 0.8125rem;
    line-height: var(--space-4);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
  }

  .status-text {
    display: inline-block;
    animation: status-in var(--duration) var(--easing);
  }

  @keyframes status-in {
    from {
      transform: translateY(2px);
    }
  }

  .panes {
    display: grid;
    gap: var(--space-4);
    align-items: start;
  }

  .editor-pane {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
    min-width: 0;
  }

  .fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: var(--space-3);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }

  .field-label {
    color: var(--text-muted);
    font-size: 0.8125rem;
    font-weight: var(--font-weight-semibold);
  }

  input[type='text'],
  .song-text {
    width: 100%;
    border: 0;
    border-radius: var(--radius-sm);
    background: var(--surface-muted);
    box-shadow: inset 0 0 0 1px var(--divider);
    color: var(--text);
    font: inherit;
    /* 16px or more, so phones don't zoom in on focus. */
    font-size: 1rem;
  }

  input[type='text'] {
    min-height: 40px;
    padding: 0 var(--space-3);
  }

  .song-text {
    min-height: 16rem;
    padding: var(--space-3);
    font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
    line-height: 1.6;
    tab-size: 4;
    resize: vertical;
    /* Long lines wrap so they're visible; line numbers in problems still count text lines. */
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  input[type='text']:focus-visible,
  .song-text:focus-visible {
    outline: 2px solid var(--accent-text);
    outline-offset: 0;
  }

  .start-hint {
    color: var(--text-muted);
    font-size: var(--font-size-sm);
  }

  .start-hint .link-button {
    margin: 0 -2px;
  }

  /* Left-aligned with the field labels; the hover background sticks out. */
  .start-hint .continue-button {
    margin: calc(-1 * var(--space-1)) 0 calc(-1 * var(--space-1)) calc(-1 * var(--space-2));
    text-align: left;
    overflow-wrap: anywhere;
  }

  /* Bottom centre, above the mobile tab bar; inverse colours so it stands out in both themes. */
  .undo-toast-region {
    position: fixed;
    left: 50%;
    bottom: var(--space-5);
    z-index: 20;
    width: max-content;
    max-width: calc(100vw - 2 * var(--space-4));
    transform: translateX(-50%);
  }

  @media (max-width: 640px) {
    .undo-toast-region {
      bottom: calc(var(--tabbar-height) + env(safe-area-inset-bottom, 0px) + var(--space-3));
    }
  }

  .undo-toast {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
    border-radius: var(--radius);
    background: var(--text);
    color: var(--bg);
    box-shadow: var(--shadow);
    font-size: var(--font-size-sm);
    animation: status-in var(--duration) var(--easing);
  }

  .undo-text {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .undo-button {
    flex: none;
    min-height: 36px;
    padding: 0 var(--space-3);
    border: 0;
    border-radius: var(--radius-pill);
    background: transparent;
    color: inherit;
    font: inherit;
    font-weight: var(--font-weight-semibold);
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }

  .undo-button:hover {
    background: color-mix(in srgb, var(--bg) 16%, transparent);
  }

  .undo-button:focus-visible {
    outline: 2px solid var(--bg);
    outline-offset: 1px;
  }

  @media (pointer: coarse) {
    .undo-button {
      min-height: var(--touch-target);
    }
  }

  .issues {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .issues-title {
    font-size: var(--font-size-sm);
  }

  .issues-hint {
    color: var(--text-muted);
    font-weight: var(--font-weight-regular);
  }

  .issue-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .issue {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    width: 100%;
    min-height: 32px;
    padding: var(--space-1) var(--space-2);
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text);
    font-size: var(--font-size-sm);
    text-align: left;
    overflow-wrap: anywhere;
    cursor: pointer;
  }

  .issue:hover {
    background: var(--surface-muted);
  }

  .issue-mark {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--q-dominant-bg);
    color: var(--q-dominant-fg);
    font-size: 0.75rem;
    font-weight: var(--font-weight-semibold);
    transform: translateY(3px);
  }

  .issue-warning .issue-mark {
    background: var(--q-major-bg);
    color: var(--q-major-fg);
  }

  .count-badge.count-notes {
    background: var(--q-major-bg);
    color: var(--q-major-fg);
  }

  .show-all {
    align-self: flex-start;
    margin-left: calc(-1 * var(--space-2));
  }

  .count-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    margin-left: 6px;
    padding: 0 5px;
    border-radius: var(--radius-pill);
    background: var(--q-dominant-bg);
    color: var(--q-dominant-fg);
    font-size: 0.75rem;
    line-height: 1;
  }

  /* Above the preview while there are problems (screen only). */
  .problem-banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
    margin-bottom: var(--space-3);
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
    border-radius: var(--radius);
    background: var(--q-dominant-bg);
    color: var(--q-dominant-fg);
    font-size: var(--font-size-sm);
  }

  .problem-text {
    flex: 1;
    min-width: 12rem;
  }

  .problem-show {
    color: var(--q-dominant-fg);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .problem-show:hover {
    background: color-mix(in srgb, var(--q-dominant-fg) 12%, transparent);
  }

  /* Warnings only: amber, nothing is wrong with the printout. */
  .notes-banner {
    background: var(--q-major-bg);
    color: var(--q-major-fg);
  }

  .notes-banner .problem-show {
    color: var(--q-major-fg);
  }

  .notes-banner .problem-show:hover {
    background: color-mix(in srgb, var(--q-major-fg) 12%, transparent);
  }

  .print-dialog {
    width: min(26rem, calc(100vw - 2 * var(--space-4)));
    padding: var(--space-5);
    border: 0;
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }

  .print-dialog::backdrop {
    background: rgb(15 23 42 / 0.45);
  }

  .print-dialog-title {
    font-size: var(--font-size-lg);
  }

  .print-dialog-text {
    margin-top: var(--space-2);
    color: var(--text-muted);
    font-size: var(--font-size-sm);
  }

  .print-dialog-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-5);
  }

  .tool-primary {
    background: var(--accent);
    box-shadow: none;
    color: var(--accent-contrast);
  }

  .tool-primary:hover {
    background: var(--accent-hover);
  }

  /* The paper scales to this pane's width (see SheetPreview). */
  .preview-pane {
    min-width: 0;
  }

  /* Side by side on wide screens; one pane at a time on narrow ones. */
  @media (min-width: 800px) {
    .pane-switch {
      display: none;
    }

    .panes {
      grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
    }
  }

  @media (max-width: 799.98px) {
    .panes[data-pane='edit'] .preview-pane,
    .panes[data-pane='preview'] .editor-pane {
      display: none;
    }
  }

  /* Phones: the editor fits between the header and the bottom tab bar, and scrolling to it keeps it above the bar. */
  @media (max-width: 640px) {
    .song-text {
      min-height: 12rem;
      max-height: calc(100dvh - var(--header-height) - var(--tabbar-height) - env(safe-area-inset-bottom, 0px) - var(--space-6));
      scroll-margin-bottom: calc(var(--tabbar-height) + env(safe-area-inset-bottom, 0px) + var(--space-3));
    }
  }

  @media (pointer: coarse) {
    .tool,
    .guide-link {
      min-height: var(--touch-target);
    }
  }

  /* Print only the sheet (App hides the header and footer). */
  @media print {
    .sheet-view {
      display: block;
    }

    .sheet-top,
    .link-error,
    .toolbar,
    .sheet-status,
    .editor-pane,
    .preview-empty,
    .problem-banner,
    .preview-head,
    .undo-toast-region,
    .print-dialog {
      display: none !important;
    }

    .panes {
      display: block;
    }

    .panes .preview-pane {
      display: block !important;
    }
  }
</style>
