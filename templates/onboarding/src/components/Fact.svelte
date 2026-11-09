<script lang="ts">
import { Text } from 'texuli/typography';

/** One term and value of a `<dl>` summary: a muted label over a medium-weight value. */
let {
  label,
  value,
  truncate = false,
}: { label: string; value: string; truncate?: boolean } = $props();
</script>

<div class="min-w-0">
  <dt><Text as="div" size="sm" tone="muted">{label}</Text></dt>
  <dd><Text as="div" size="sm" weight="medium" {truncate}>{value}</Text></dd>
</div>
