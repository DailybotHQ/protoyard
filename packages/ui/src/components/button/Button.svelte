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
  ref = $bindable(null),
  children,
  ...rest
}: ButtonProps = $props();

const inactive = $derived(Boolean(disabled) || loading);
const classes = $derived(cn(buttonVariants({ variant, size }), className));
</script>

{#snippet content()}
  {#if loading}
    <Spinner />
    {#if loadingLabel}<span class="sr-only">{loadingLabel}</span>{/if}
    {#if size !== 'icon'}{@render children?.()}{/if}
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
    aria-busy={loading || undefined}
    tabindex={inactive ? -1 : undefined}
    {...rest}
  >
    {@render content()}
  </a>
{:else}
  <button
    bind:this={ref}
    class={cn('ui-button', classes)}
    {type}
    disabled={inactive}
    aria-busy={loading || undefined}
    {...rest}
  >
    {@render content()}
  </button>
{/if}
