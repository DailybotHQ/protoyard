<script lang="ts">
import './print.css';

import { Button, type ButtonSize, type ButtonVariant } from '@protoyard/ui';

/**
 * Opens the browser's print dialog for the page or doc. It has a visible
 * label (default "Print"), never prints itself (`data-py-print-button` is
 * hidden by the print stylesheet), and calls `window.print()` once per click.
 */
let {
  label = 'Print',
  variant = 'outline',
  size = 'sm',
  class: className,
}: {
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  class?: string;
} = $props();

function print() {
  if (typeof window !== 'undefined' && typeof window.print === 'function') window.print();
}
</script>

<Button {variant} {size} class={className} data-py-print-button onclick={print}>
  <!-- Printer glyph (inline: pages-ui has no icon dependency). -->
  <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <path d="M6 9V2h12v7" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <path d="M6 14h12v8H6z" />
  </svg>{label}
</Button>
