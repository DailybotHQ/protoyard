<script lang="ts" module>
/** The parts of a nav model every desktop layout renders the same way. */
export type ChromePart = 'skip' | 'brand' | 'actions' | 'user';
</script>

<script lang="ts">
import Avatar from '../components/avatar/Avatar.svelte';
import { Button } from 'texuli/button';
import { cn } from '../lib/cn.ts';
import NavIcon from './NavIcon.svelte';
import type { NavModel } from './nav-model.ts';

/*
 * Shared desktop layout chrome: the skip link (focuses the screen region,
 * since hash routers would treat `#main` as a route), the brand, the primary
 * actions (a promise returned by `onSelect` keeps the button pending) and the
 * signed-in user. Each layout places the parts it needs.
 */
interface Props {
  part: ChromePart;
  nav?: NavModel;
  /** `id` of the screen region the skip link focuses. */
  mainId?: string;
  /** Icon-only rendering (rail). */
  compact?: boolean;
  class?: string;
}

let { part, nav, mainId, compact = false, class: className }: Props = $props();
</script>

{#if part === 'skip' && mainId}
  <a
    href={`#${mainId}`}
    class="sr-only z-[70] rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
    onclick={(event) => {
      event.preventDefault();
      document.getElementById(mainId)?.focus();
    }}
  >
    Skip to content
  </a>
{:else if part === 'brand' && nav?.brand}
  <a
    href={nav.brand.href ?? '#/'}
    class={cn(
      'flex min-w-0 items-center gap-2 rounded-md text-sm font-semibold text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
      compact && 'justify-center',
      className
    )}
  >
    <span
      class="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground [&_svg]:size-4"
      aria-hidden="true"
    >
      {#if nav.brand.icon}<NavIcon icon={nav.brand.icon} />{:else}{nav.brand.label.slice(0, 1)}{/if}
    </span>
    <span class={compact ? 'sr-only' : 'truncate'}>{nav.brand.label}</span>
  </a>
{:else if part === 'actions' && nav?.actions?.length}
  <div class={cn('flex items-center gap-2', compact && 'flex-col', className)}>
    {#each nav.actions as action (action.id)}
      <Button
        size={compact ? 'icon' : 'sm'}
        href={action.href}
        aria-label={compact ? action.label : undefined}
        onclick={action.onSelect ? () => action.onSelect?.() : undefined}
      >
        {#if action.icon}<NavIcon icon={action.icon} />{/if}
        {#if !compact}{action.label}{/if}
      </Button>
    {/each}
  </div>
{:else if part === 'user' && nav?.user}
  <svelte:element
    this={nav.user.href ? 'a' : 'div'}
    href={nav.user.href}
    class={cn(
      'flex min-w-0 items-center gap-2 rounded-md p-1 text-sm',
      nav.user.href && 'hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
      compact && 'justify-center',
      className
    )}
  >
    <Avatar name={nav.user.name} src={nav.user.image?.src} srcset={nav.user.image?.srcset} size="sm" decorative />
    <span class={compact ? 'sr-only' : 'grid min-w-0'}>
      <span class="truncate font-medium">{nav.user.name}</span>
      {#if nav.user.detail}<span class="truncate text-xs text-muted-foreground">{nav.user.detail}</span>{/if}
    </span>
  </svelte:element>
{/if}
