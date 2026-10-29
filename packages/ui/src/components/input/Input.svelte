<script lang="ts">
import type { HTMLInputAttributes } from 'svelte/elements';
import { Input as TexuliInput } from 'texuli/input';
import type { WithElementRef } from '../../lib/types.ts';

type Props = WithElementRef<Omit<HTMLInputAttributes, 'files'>, HTMLInputElement> & {
  files?: FileList | null;
};

/**
 * Texuli's `Input` (`texuli/input`), with this package's prop types (an
 * `HTMLInputElement` ref). Texuli keeps `bind:value` in step when a caller
 * passes `oninput`, and binds a number (`null` when empty) for number and
 * range inputs, as Svelte's native `bind:value` does.
 */
let {
  class: className,
  type = 'text',
  value = $bindable(),
  files = $bindable(null),
  ref = $bindable(null),
  ...rest
}: Props = $props();

// An unset value reaches Texuli as empty: `''`, or `null` for number and range inputs.
const empty = $derived(type === 'number' || type === 'range' ? null : '');
// A plain record keeps the spread onto Texuli's Input a finite type.
const forwarded = $derived(rest as Record<string, unknown>);
</script>

<TexuliInput
  bind:ref={() => ref, (node) => (ref = node as HTMLInputElement | null)}
  bind:value={() => value ?? empty, (next) => (value = next)}
  bind:files
  {type}
  class={className ?? undefined}
  {...forwarded}
/>
