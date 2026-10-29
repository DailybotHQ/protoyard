<script lang="ts">
import type { Snippet } from 'svelte';
import { MobileHeader as TexuliMobileHeader } from 'texuli/layouts/mobile';

interface Props {
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
}

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
}: Props = $props();
</script>

<TexuliMobileHeader
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
