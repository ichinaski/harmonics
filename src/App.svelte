<script lang="ts">
  import type { Component } from 'svelte';
  import AboutFooter from './components/AboutFooter.svelte';
  import SoundControls from './components/SoundControls.svelte';
  import { canonicalHash, DEFAULT_ROUTE_PATH, resolveRoute, type Route, type SheetPage, type TabId } from './routes';
  import { session } from './stores/session.svelte';
  import { sheetLink } from './stores/sheetLink.svelte';
  import Chords from './views/Chords.svelte';
  import Harmonize from './views/Harmonize.svelte';
  import KeyFinder from './views/KeyFinder.svelte';
  import ScaleFinder from './views/ScaleFinder.svelte';

  /** The Sheet tab's pages load on demand, so the other tools don't pay for them. */
  const SHEET_PAGE_MODULES: Record<SheetPage, () => Promise<{ default: Component }>> = {
    editor: () => import('./views/Sheet.svelte'),
    syntax: () => import('./views/SheetSyntax.svelte'),
  };

  interface Tab {
    id: TabId;
    label: string;
    /** Path data of the bottom tab bar icon (24 x 24, stroked). */
    icon: string;
  }

  const TABS: readonly Tab[] = [
    // Piano keys.
    { id: 'chords', label: 'Chords', icon: 'M5 5h14a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5v-11A1.5 1.5 0 0 1 5 5zM8 5v7.5h3V5M13 5v7.5h3V5M9.5 12.5V19M14.5 12.5V19' },
    // A key.
    { id: 'key', label: 'Key', icon: 'M11 12a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0zM11 12h9.5M17 12v3M20 12v2.5' },
    // A chord: three stacked note heads on a stem.
    { id: 'harmonize', label: 'Harmonize', icon: 'M6.68 19.53a3 2.1-20 1 0 5.64-2.06 3 2.1-20 1 0-5.64 2.06zM6.68 13.53a3 2.1-20 1 0 5.64-2.06 3 2.1-20 1 0-5.64 2.06zM6.68 7.53a3 2.1-20 1 0 5.64-2.06 3 2.1-20 1 0-5.64 2.06zM12.4 17.5V2.5' },
    // A melody line.
    { id: 'scales', label: 'Scales', icon: 'M3 15c2.5 0 2.5-6 5-6s2.5 6 5 6 2.5-6 5-6c1.3 0 2 1 3 2' },
    // A chord sheet: a page with bar lines.
    { id: 'sheet', label: 'Sheet', icon: 'M6.5 3.5h11a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1zM8.5 9h7M8.5 14h7M12 7.5v3M12 12.5v3' },
  ];

  /** The route of the current hash; old and unknown routes are replaced in the address bar (the Sheet editor keeps its ?s= song). */
  function currentRoute(): Route {
    const hash = canonicalHash(location.hash);
    if (location.hash !== hash) history.replaceState(null, '', hash);
    return resolveRoute(hash).route;
  }

  let route = $state<Route>(currentRoute());

  let sheetPages = $state.raw<Partial<Record<SheetPage, Component>>>({});
  let sheetPageFailed = $state(false);

  $effect(() => {
    if (route.tab !== 'sheet') return;
    const page = route.page;
    if (sheetPages[page]) return;
    sheetPageFailed = false;
    SHEET_PAGE_MODULES[page]().then(
      (module) => (sheetPages = { ...sheetPages, [page]: module.default }),
      () => (sheetPageFailed = true),
    );
  });

  // The Chords tab link goes back to the side shown last.
  $effect(() => {
    if (route.tab === 'chords') session.chordsSide = route.side;
  });

  function tabHref(id: TabId): string {
    if (id === 'chords' && session.chordsSide === 'notes') return '#/chords/notes';
    // The Sheet tab link carries the song, so it comes back even from the syntax guide.
    if (id === 'sheet') return sheetLink.hash;
    return `#/${id}`;
  }

  /** The Sheet editor uses a wider page (editor and preview side by side) and prints only the sheet. */
  const sheetEditor = $derived(route.tab === 'sheet' && route.page === 'editor');

  /** A new tab starts at the top, also when opened from a link further down a page ("Open in Harmonize"). */
  function onHashChange(): void {
    const next = currentRoute();
    if (next.tab !== route.tab) window.scrollTo(0, 0);
    route = next;
  }
</script>

<svelte:window onhashchange={onHashChange} />

<div class="app" class:print-sheet={sheetEditor}>
  <header class="header">
    <a class="brand" href="#/{DEFAULT_ROUTE_PATH}">Harmonics</a>
    <nav class="tabs" aria-label="Tools">
      {#each TABS as tab (tab.id)}
        <a class="tab" href={tabHref(tab.id)} aria-current={tab.id === route.tab ? 'page' : undefined}>
          <svg class="tab-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d={tab.icon} fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          {tab.label}
        </a>
      {/each}
    </nav>
    <div class="header-end">
      <SoundControls />
    </div>
  </header>

  <main class="main" class:wide={sheetEditor}>
    {#if route.tab === 'chords'}
      <Chords side={route.side} />
    {:else if route.tab === 'key'}
      <KeyFinder />
    {:else if route.tab === 'harmonize'}
      <Harmonize />
    {:else if route.tab === 'sheet'}
      {@const SheetPageView = sheetPages[route.page]}
      {#if SheetPageView}
        <SheetPageView />
      {:else if sheetPageFailed}
        <p class="sheet-loading" role="alert">The Sheet couldn’t load. Check your connection and reload the page.</p>
      {:else}
        <p class="sheet-loading">Loading the Sheet…</p>
      {/if}
    {:else}
      <ScaleFinder />
    {/if}
  </main>

  <AboutFooter />
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    min-height: 100dvh;
  }

  .header {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: var(--space-5);
    height: var(--header-height);
    padding: 0 var(--space-5);
    background: color-mix(in srgb, var(--bg) 94%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  .brand {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--text);
    text-decoration: none;
    letter-spacing: -0.01em;
  }

  .tabs {
    display: flex;
    gap: var(--space-1);
  }

  .header-end {
    margin-left: auto;
  }

  .tab {
    display: inline-flex;
    align-items: center;
    min-height: 36px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-pill);
    color: var(--text-muted);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    text-decoration: none;
    transition:
      background-color var(--duration) var(--easing),
      color var(--duration) var(--easing);
  }

  .tab:hover {
    color: var(--text);
    background: var(--surface);
  }

  /* Icons only in the mobile bottom tab bar. */
  .tab-icon {
    display: none;
  }

  .tab[aria-current='page'] {
    color: var(--accent-contrast);
    background: var(--accent);
  }

  .main {
    flex: 1;
    width: 100%;
    max-width: var(--content-width);
    margin: 0 auto;
    padding: var(--space-4) var(--space-4) var(--space-5);
  }

  .main.wide {
    max-width: var(--content-width-wide);
  }

  /* Shown only if loading the Sheet takes a moment. */
  .sheet-loading {
    color: var(--text-muted);
    font-size: var(--font-size-sm);
    animation: sheet-loading-in 0s 150ms both;
  }

  @keyframes sheet-loading-in {
    from {
      visibility: hidden;
    }
  }

  /* Printing the Sheet: only the sheet, on white (see Sheet.svelte and the @page rule in app.css). */
  @media print {
    :global(body:has(.print-sheet)) {
      background: #fff;
    }

    .print-sheet .header,
    .print-sheet :global(.footer) {
      display: none;
    }

    .print-sheet .main.wide {
      max-width: none;
      padding: 0;
    }
  }

  /* Mobile: the tabs become a bottom tab bar. */
  @media (max-width: 640px) {
    /* No backdrop-filter here: it would make the header the containing block
       of the fixed bottom tab bar. */
    .header {
      padding: 0 var(--space-4);
      background: var(--bg);
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }

    .tabs {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 10;
      justify-content: space-around;
      gap: 0;
      height: calc(var(--tabbar-height) + env(safe-area-inset-bottom, 0px));
      padding: var(--space-2) var(--space-2) env(safe-area-inset-bottom, 0px);
      background: var(--surface);
      box-shadow: 0 -1px 0 var(--divider);
    }

    .tab {
      flex: 1;
      flex-direction: column;
      justify-content: center;
      gap: 2px;
      min-height: var(--touch-target);
      padding: var(--space-1);
      border-radius: var(--radius);
      font-size: 0.75rem;
      line-height: 1.2;
    }

    .tab-icon {
      display: block;
    }

    .tab:hover {
      background: transparent;
    }

    .tab[aria-current='page'] {
      color: var(--accent-text);
      background: var(--accent-soft);
    }
  }
</style>
