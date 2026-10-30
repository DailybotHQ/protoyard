<script lang="ts">
import Sparkles from '@lucide/svelte/icons/sparkles';
import type { HTMLAttributes } from 'svelte/elements';
import { Badge } from 'texuli/badge';
import { cx } from 'texuli/cx';
import { Icon } from 'texuli/icons';

/**
 * Marks a step that is simulated in the prototype (sign-in, billing, AI, …).
 * Always includes a word — never color alone (AGENTS.md honesty).
 */
type Props = Omit<HTMLAttributes<HTMLSpanElement>, 'title' | 'class' | 'children'> & {
  label?: string;
  /** Longer explanation for hover / assistive tech via the title attribute. */
  title?: string;
  class?: string;
  /** The rendered root element (bindable). */
  ref?: HTMLElement | null;
};

let {
  label = 'Simulated',
  title = 'This step is simulated. It is not real security, billing or AI.',
  class: className,
  ref = $bindable(null),
  ...rest
}: Props = $props();
</script>

<!-- Protoyard's honesty label (AGENTS.md rule 10) on Texuli's Badge. -->
<Badge {...rest} bind:ref variant="warning" class={cx('ui-honesty-tag', className)} {title} data-py-tag="simulated">
  <Icon icon={Sparkles} size="xs" aria-hidden="true" />
  {label}
</Badge>
