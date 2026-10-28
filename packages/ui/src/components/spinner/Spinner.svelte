<script lang="ts">
import { Spinner as TexuliSpinner } from 'texuli/feedback';

interface Props {
  class?: string;
  /** When set, the spinner is announced; otherwise it is decorative. */
  label?: string;
  /** Pixels (16 by default) or Texuli's `sm` / `md` / `lg`. */
  size?: number | string;
}

let { class: className, label, size }: Props = $props();

// Protoyard sizes are pixels; Texuli's spinner comes in three steps.
const texuliSize = $derived.by((): 'sm' | 'md' | 'lg' => {
  if (size === 'sm' || size === 'md' || size === 'lg') return size;
  const px = typeof size === 'number' ? size : Number.parseFloat(size ?? '16');
  if (!Number.isFinite(px) || px <= 16) return 'sm';
  return px <= 24 ? 'md' : 'lg';
});
</script>

<!-- A thin adapter over Texuli's Spinner (`texuli/feedback`). -->
<TexuliSpinner {label} size={texuliSize} class={className} />
