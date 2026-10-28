<script lang="ts">
import type { Snippet } from 'svelte';
import { IconButton } from 'texuli/button';
import { cx } from 'texuli/cx';
import { Icon } from 'texuli/icons';
import { getAppShellContext } from '../app-shell/context.ts';

interface Props {
  title?: string;
  /** Element for the title; use `p`/`div` when the page renders its own `<h1>`. */
  titleAs?: 'h1' | 'h2' | 'p' | 'div';
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
  titleAs = 'h1',
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

<!-- The page header: Texuli has no standalone one (gap G15), so this lays out Texuli's IconButton and Protoyard's slots. -->
<header
  class={cx(
    'z-30 flex min-h-14 shrink-0 items-center gap-3 border-b border-border bg-background/85 px-4 pt-safe backdrop-blur-md sm:px-6',
    sticky && 'sticky top-0',
    className
  )}
>
  {#if menuHandler}
    <IconButton
      label={menuLabel}
      class="-ml-2 shrink-0 lg:hidden"
      aria-expanded={shell ? shell.sidebarOpen : undefined}
      onclick={menuHandler}
    >
      <Icon icon="menu" aria-hidden="true" />
    </IconButton>
  {/if}
  {#if leading}<div class="flex min-w-0 items-center gap-2">{@render leading()}</div>{/if}
  <div class="min-w-0 flex-1 py-2">
    {#if title}
      <svelte:element this={titleAs} class="truncate font-heading text-base leading-tight font-semibold sm:text-lg">{title}</svelte:element>
    {/if}
    {#if description}<p class="truncate text-xs text-muted-foreground sm:text-sm">{description}</p>{/if}
  </div>
  {#if actions}<div class="flex shrink-0 items-center gap-2">{@render actions()}</div>{/if}
</header>
