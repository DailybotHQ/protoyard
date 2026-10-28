<script lang="ts">
import { Mail } from '@lucide/svelte';
import { Badge } from 'texuli/badge';
import { Button } from 'texuli/button';
import { LucideIcon } from 'texuli/icons/lucide';

interface Props {
  unreadCount?: number;
  onopen?: () => void;
  label?: string;
}

let { unreadCount = 0, onopen, label = 'Open simulated inbox' }: Props = $props();
</script>

<Button
  type="button"
  variant="outline"
  class="gap-2 shadow-sm"
  aria-label={unreadCount > 0 ? `${label}, ${unreadCount} unread messages` : label}
  onclick={onopen}
>
  <LucideIcon icon={Mail} size="sm" />
  <span>Inbox</span>
  {#if unreadCount > 0}
    <Badge class="min-w-5 px-1.5 py-0.5 text-xs" aria-hidden="true">{unreadCount > 99 ? '99+' : unreadCount}</Badge>
  {/if}
</Button>
