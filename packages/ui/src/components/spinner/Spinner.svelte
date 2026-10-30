<script lang="ts">
import type { HTMLAttributes } from 'svelte/elements';
import { Spinner as TexuliSpinner } from 'texuli/feedback';

type Props = Omit<HTMLAttributes<HTMLSpanElement>, 'class' | 'children'> & {
  class?: string;
  /** When set, the spinner is announced; otherwise it is decorative. */
  label?: string;
  /** Pixels (16 by default) or Texuli's `sm` / `md` / `lg`. */
  size?: number | string;
  /** The rendered root element (bindable). */
  ref?: HTMLElement | null;
};

let { class: className, label, size, ref = $bindable(null), ...rest }: Props = $props();

// Protoyard sizes are pixels; Texuli's spinner comes in three steps.
const texuliSize = $derived.by((): 'sm' | 'md' | 'lg' => {
  if (size === 'sm' || size === 'md' || size === 'lg') return size;
  const px = typeof size === 'number' ? size : Number.parseFloat(size ?? '16');
  if (!Number.isFinite(px) || px <= 16) return 'sm';
  return px <= 24 ? 'md' : 'lg';
});
</script>

<!-- A thin adapter over Texuli's Spinner (`texuli/feedback`). -->
<TexuliSpinner {...rest} bind:ref {label} size={texuliSize} class={className} />
