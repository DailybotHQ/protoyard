<script lang="ts">
import { Menu } from '@lucide/svelte';
import type { Snippet } from 'svelte';
import { cn } from '../../lib/cn.ts';
import { getAppShellContext } from '../app-shell/context.ts';

interface Props {
  title?: string;
  description?: string;
  /** Content before the title (breadcrumbs, logo…). */
  leading?: Snippet;
  actions?: Snippet;
  /** Opens navigation on small screens; defaults to the enclosing AppShell drawer. */
  onMenuClick?: () => void;
  menuLabel?: string;
  sticky?: boolean;
  class?: string;
}

let {
  title,
  description,
  leading,
  actions,
  onMenuClick,
  menuLabel = 'Open navigation',
  sticky = true,
  class: className,
}: Props = $props();

const shell = getAppShellContext();
const menuHandler = $derived(onMenuClick ?? shell?.openSidebar);
</script>

<header
  class={cn(
    'z-30 flex min-h-14 shrink-0 items-center gap-3 border-b border-border bg-background/85 px-4 pt-safe backdrop-blur-md sm:px-6',
    sticky && 'sticky top-0',
    className
  )}
>
  {#if menuHandler}
    <button
      type="button"
      class="-ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:hidden"
      aria-label={menuLabel}
      aria-expanded={shell ? shell.sidebarOpen : undefined}
      onclick={menuHandler}
    >
      <Menu class="size-5" aria-hidden="true" />
    </button>
  {/if}
  {#if leading}<div class="flex min-w-0 items-center gap-2">{@render leading()}</div>{/if}
  <div class="min-w-0 flex-1 py-2">
    {#if title}
      <h1 class="truncate font-heading text-base leading-tight font-semibold sm:text-lg">{title}</h1>
    {/if}
    {#if description}<p class="truncate text-xs text-muted-foreground sm:text-sm">{description}</p>{/if}
  </div>
  {#if actions}<div class="flex shrink-0 items-center gap-2">{@render actions()}</div>{/if}
</header>
