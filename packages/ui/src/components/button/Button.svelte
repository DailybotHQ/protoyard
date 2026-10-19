<script lang="ts">
import { cn } from '../../lib/cn.ts';
import Spinner from '../spinner/Spinner.svelte';
import { type ButtonProps, buttonVariants } from './button-variants.ts';

let {
  class: className,
  variant = 'default',
  size = 'md',
  href = undefined,
  type = 'button',
  disabled = false,
  loading = false,
  loadingLabel,
  autoLoading = true,
  onclick,
  ref = $bindable(null),
  children,
  ...rest
}: ButtonProps = $props();

/** Set while a promise returned by `onclick` is unsettled (unless `autoLoading` is false). */
let pending = $state(false);
const busy = $derived(loading || pending);
const inactive = $derived(Boolean(disabled) || busy);
const classes = $derived(cn(buttonVariants({ variant, size }), className));

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

// biome-ignore lint/suspicious/noExplicitAny: shared by <a> and <button>, whose event types differ.
function handleClick(event: any): void {
  // A click while busy is a double submit; a disabled link must not act either.
  if (inactive) {
    event.preventDefault();
    return;
  }
  // biome-ignore lint/suspicious/noExplicitAny: the handler is typed for one of the two elements.
  const result: unknown = (onclick as any)?.(event);
  if (!autoLoading || !isThenable(result)) return;
  pending = true;
  // `finally` keeps a rejection unhandled-visible, exactly as before (runService never rejects).
  Promise.resolve(result).finally(() => {
    pending = false;
  });
}
</script>

{#snippet content()}
  {#if busy}
    <!-- The label stays in place (invisible) so the width never changes; the spinner overlays it. -->
    <span class="pointer-events-none absolute inset-0 flex items-center justify-center" data-ui-button-spinner>
      <Spinner />
    </span>
    <span class="inline-flex items-center justify-center gap-[inherit] opacity-0">{@render children?.()}</span>
    {#if loadingLabel}<span class="sr-only">{loadingLabel}</span>{/if}
  {:else}
    {@render children?.()}
  {/if}
{/snippet}

{#if href}
  <a
    bind:this={ref}
    class={cn('ui-button', classes)}
    href={inactive ? undefined : href}
    role={inactive ? 'link' : undefined}
    aria-disabled={inactive || undefined}
    aria-busy={busy || undefined}
    tabindex={inactive ? -1 : undefined}
    {...rest}
    onclick={handleClick}
  >
    {@render content()}
  </a>
{:else}
  <button
    bind:this={ref}
    class={cn('ui-button', classes)}
    {type}
    disabled={inactive}
    aria-busy={busy || undefined}
    {...rest}
    onclick={handleClick}
  >
    {@render content()}
  </button>
{/if}
