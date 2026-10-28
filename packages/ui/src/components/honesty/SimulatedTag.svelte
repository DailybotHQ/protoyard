<script lang="ts">
import Sparkles from '@lucide/svelte/icons/sparkles';
import { Badge } from 'texuli/badge';
import { cx } from 'texuli/cx';
import { Icon } from 'texuli/icons';

/**
 * Marks a step that is simulated in the prototype (sign-in, billing, AI, …).
 * Always includes a word — never color alone (AGENTS.md honesty).
 */
let {
  label = 'Simulated',
  title = 'This step is simulated. It is not real security, billing or AI.',
  class: className,
}: {
  label?: string;
  /** Longer explanation for hover / assistive tech via the title attribute. */
  title?: string;
  class?: string;
} = $props();
</script>

<!-- Protoyard's honesty label (AGENTS.md rule 10) on Texuli's Badge. -->
<Badge variant="warning" class={cx('ui-honesty-tag', className)} {title} data-py-tag="simulated">
  <Icon icon={Sparkles} size="xs" aria-hidden="true" />
  {label}
</Badge>
