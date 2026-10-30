<script lang="ts">
import FlaskConical from '@lucide/svelte/icons/flask-conical';
import type { HTMLAttributes } from 'svelte/elements';
import { Badge } from 'texuli/badge';
import { cx } from 'texuli/cx';
import { Icon } from 'texuli/icons';

/**
 * Marks a feature that is a proposal still under review — not a product promise.
 * Always includes a word — never color alone.
 */
type Props = Omit<HTMLAttributes<HTMLSpanElement>, 'title' | 'class' | 'children'> & {
  label?: string;
  title?: string;
  class?: string;
  /** The rendered root element (bindable). */
  ref?: HTMLElement | null;
};

let {
  label = 'Proposal under review',
  title = 'This is a proposal under review, not a committed product feature.',
  class: className,
  ref = $bindable(null),
  ...rest
}: Props = $props();
</script>

<!-- Protoyard's honesty label (AGENTS.md rule 10) on Texuli's Badge. -->
<Badge {...rest} bind:ref variant="info" class={cx('ui-honesty-tag ui-honesty-tag--proposal', className)} {title} data-py-tag="proposal">
  <Icon icon={FlaskConical} size="xs" aria-hidden="true" />
  {label}
</Badge>

<style>
  :global(.ui-honesty-tag--proposal) {
    border-style: dashed;
  }
</style>
