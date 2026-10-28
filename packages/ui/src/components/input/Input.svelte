<script lang="ts">
import type { HTMLInputAttributes } from 'svelte/elements';
import { Input as TexuliInput } from 'texuli/input';
import type { WithElementRef } from '../../lib/types.ts';

type Props = WithElementRef<Omit<HTMLInputAttributes, 'files'>, HTMLInputElement> & {
  files?: FileList | null;
};

let {
  class: className,
  type = 'text',
  value = $bindable(),
  files = $bindable(null),
  ref = $bindable(null),
  oninput,
  ...rest
}: Props = $props();

const numeric = $derived(type === 'number' || type === 'range');
// A plain record keeps the spread onto Texuli's Input a finite type.
const forwarded = $derived(rest as Record<string, unknown>);

/**
 * A thin adapter over Texuli's `Input` (`texuli/input`), for two things it
 * cannot do yet:
 * - a caller's `oninput` replaces Texuli's internal handler, so `bind:value`
 *   would stop updating (Texuli gap G26). This handler updates the value
 *   first, then calls the caller's, as a native `bind:value` + `oninput` did;
 * - number and range inputs bind a number (`null` when empty), as Svelte's
 *   native `bind:value` does, while Texuli's value is always a string.
 */
function handleInput(event: Event & { currentTarget: EventTarget & HTMLInputElement }): void {
  const input = event.currentTarget;
  value = numeric ? (input.value === '' ? null : input.valueAsNumber) : input.value;
  oninput?.(event);
}
</script>

{#if type === 'file'}
  <TexuliInput bind:ref type="file" bind:files class={className ?? undefined} {oninput} {...forwarded} />
{:else}
  <TexuliInput
    bind:ref
    {type}
    value={value == null ? '' : String(value)}
    class={className ?? undefined}
    oninput={handleInput}
    {...forwarded}
  />
{/if}
