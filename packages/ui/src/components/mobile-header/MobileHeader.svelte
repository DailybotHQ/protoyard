<script lang="ts">
import type { Snippet } from 'svelte';
import type { Attachment } from 'svelte/attachments';
import type { HTMLAttributes } from 'svelte/elements';
import { MobileHeader as TexuliMobileHeader } from 'texuli/layouts/mobile';

type Props = Omit<HTMLAttributes<HTMLElement>, 'title' | 'class' | 'children'> & {
  title: string;
  subtitle?: string;
  /** Element for the title; use `p`/`div` when the page renders its own `<h1>`. */
  titleAs?: 'h1' | 'h2' | 'p' | 'div';
  /** Back as a link (hash route) … */
  backHref?: string;
  /** … or as a callback. */
  onBack?: () => void;
  /** Visible text and accessible name of Back. */
  backLabel?: string;
  actions?: Snippet;
  sticky?: boolean;
  class?: string;
  /** The rendered `header` (bindable). */
  ref?: HTMLElement | null;
};

let {
  title,
  titleAs = 'h1',
  subtitle,
  backHref,
  onBack,
  backLabel = 'Back',
  actions,
  sticky = true,
  class: className,
  ref = $bindable(null),
  ...rest
}: Props = $props();

// Texuli's MobileHeader (0.8) spreads rest attributes on its `header` but has no
// `ref`; an attachment travels with that spread and reports the element.
const captureRef: Attachment<HTMLElement> = (node) => {
  ref = node;
  return () => {
    if (ref === node) ref = null;
  };
};
</script>

<TexuliMobileHeader
  {...rest}
  {@attach captureRef}
  {title}
  {subtitle}
  {titleAs}
  {backHref}
  onBack={onBack ? () => onBack() : undefined}
  {backLabel}
  {actions}
  {sticky}
  class={className}
/>
