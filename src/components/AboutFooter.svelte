<!-- The one-line footer: Harmonics · About (opens AboutDialog) · GitHub. -->
<script lang="ts">
  import AboutDialog, { REPO_URL } from './AboutDialog.svelte';

  let dialog = $state<ReturnType<typeof AboutDialog>>();
</script>

<footer class="footer">
  <span class="name">Harmonics</span>
  <span aria-hidden="true">·</span>
  <button type="button" class="about" aria-haspopup="dialog" onclick={(e) => dialog?.open(e.currentTarget)}>About</button>
  <span aria-hidden="true">·</span>
  <a href={REPO_URL} target="_blank" rel="noopener">GitHub</a>
</footer>

<AboutDialog bind:this={dialog} />

<style>
  .footer {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: var(--space-2);
    padding: var(--space-4) var(--space-4) var(--space-5);
    color: var(--text-muted);
    font-size: 0.8125rem;
    line-height: 1.5;
  }

  .name {
    font-weight: var(--font-weight-semibold);
  }

  .about,
  a {
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font-size: inherit;
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, currentColor 40%, transparent);
    text-underline-offset: 2px;
    cursor: pointer;
  }

  .about:hover,
  a:hover {
    color: var(--text);
  }

  /* Mobile: the footer sits above the fixed bottom tab bar. */
  @media (max-width: 640px) {
    .footer {
      padding-bottom: calc(var(--tabbar-height) + env(safe-area-inset-bottom, 0px) + var(--space-4));
    }
  }
</style>
