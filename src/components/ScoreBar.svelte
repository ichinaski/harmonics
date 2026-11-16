<!-- A 0..100 score as a small bar with the number. -->
<script lang="ts">
  interface Props {
    score: number;
    label?: string;
  }

  let { score, label = 'Score' }: Props = $props();

  const value = $derived(Math.round(Math.min(100, Math.max(0, score))));
</script>

<span class="score" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
  <span class="track"><span class="fill" style:width="{value}%"></span></span>
  <span class="value">{value}</span>
</span>

<style>
  .score {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  .track {
    width: 56px;
    height: 6px;
    border-radius: var(--radius-pill);
    background: var(--divider);
    overflow: hidden;
  }

  .fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--accent);
    transition: width var(--duration) var(--easing);
  }

  .value {
    min-width: 2ch;
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: var(--font-weight-semibold);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
</style>
