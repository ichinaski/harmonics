<!--
  Colored quality badge. The text (family or a quality name) is always shown,
  so color is never the only signal.
-->
<script lang="ts">
  import type { QualityFamily } from '../theory';

  interface Props {
    family: QualityFamily;
    /** Text shown; defaults to the family name. */
    label?: string;
  }

  let { family, label }: Props = $props();
</script>

<span class="badge" style:--badge-bg="var(--q-{family}-bg)" style:--badge-fg="var(--q-{family}-fg)">{label ?? family}</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--badge-bg);
    color: var(--badge-fg);
    font-size: 0.75rem;
    font-weight: var(--font-weight-semibold);
    line-height: 1;
    white-space: nowrap;
  }
</style>
