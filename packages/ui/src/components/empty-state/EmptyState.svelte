<script lang="ts">
import Inbox from '@lucide/svelte/icons/inbox';
import type { Snippet } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';
import { EmptyState as TexuliEmptyState } from 'texuli/empty';
import { Icon } from 'texuli/icons';
import type { IconComponent } from '../../lib/types.ts';

type Props = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  title: string;
  description?: string;
  /** A Lucide-compatible icon component; defaults to an inbox. */
  icon?: IconComponent;
  action?: Snippet;
  size?: 'sm' | 'md';
  /** The rendered root element (bindable). */
  ref?: HTMLElement | null;
};

let { icon = Inbox, size = 'md', ref = $bindable(null), ...rest }: Props = $props();
</script>

<!-- A thin adapter over Texuli's EmptyState (`texuli/empty`) that takes an icon component. -->
{#snippet illustration()}
  <Icon {icon} size={size === 'sm' ? 'md' : 'lg'} aria-hidden="true" />
{/snippet}

<TexuliEmptyState bind:ref {illustration} {size} {...rest} />
