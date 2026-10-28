<script lang="ts">
import FlaskConical from '@lucide/svelte/icons/flask-conical';
import { Badge } from 'texuli/badge';
import { cx } from 'texuli/cx';
import { Icon } from 'texuli/icons';

/**
 * Marks a feature that is a proposal still under review — not a product promise.
 * Always includes a word — never color alone.
 */
let {
  label = 'Proposal under review',
  title = 'This is a proposal under review, not a committed product feature.',
  class: className,
}: {
  label?: string;
  title?: string;
  class?: string;
} = $props();
</script>

<!-- Protoyard's honesty label (AGENTS.md rule 10) on Texuli's Badge. -->
<Badge variant="info" class={cx('ui-honesty-tag ui-honesty-tag--proposal', className)} {title} data-py-tag="proposal">
  <Icon icon={FlaskConical} size="xs" aria-hidden="true" />
  {label}
</Badge>

<style>
  :global(.ui-honesty-tag--proposal) {
    border-style: dashed;
  }
</style>
