<script lang="ts">
import type { HTMLInputAttributes } from 'svelte/elements';

let {
  accept,
  class: className,
  label,
  hidden = false,
  onchange,
  tabindex = 0,
  ref = $bindable(null),
}: {
  accept: string;
  class?: string;
  label: string;
  hidden?: boolean;
  onchange?: HTMLInputAttributes['onchange'];
  tabindex?: number;
  ref?: HTMLInputElement | null;
} = $props();
</script>

<input
  bind:this={ref}
  type="file"
  {accept}
  class={className}
  aria-label={label}
  aria-hidden={hidden || undefined}
  tabindex={hidden ? -1 : tabindex}
  {onchange}
  data-tx-gap="G8"
/>
