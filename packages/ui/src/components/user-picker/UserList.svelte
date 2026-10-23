<script lang="ts">
import { Check, Search } from '@lucide/svelte';
import { Command } from '@texuli/primitives/command';
import { cn } from '../../lib/cn.ts';
import Avatar from '../avatar/Avatar.svelte';
import type { PickerUser } from './types.ts';

interface Props {
  users: PickerUser[];
  selectedId: string;
  onPick: (user: PickerUser) => void;
  searchable: boolean;
  searchPlaceholder: string;
  emptyText: string;
  label: string;
  class?: string;
}

let {
  users,
  selectedId,
  onPick,
  searchable,
  searchPlaceholder,
  emptyText,
  label,
  class: className,
}: Props = $props();
</script>

<Command.Root {label} loop class={cn('flex flex-col', className)}>
  {#if searchable}
    <div class="flex items-center gap-2 border-b border-border px-3">
      <Search class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <Command.Input
        placeholder={searchPlaceholder}
        class="h-10 min-h-touch w-full bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground sm:min-h-0 sm:text-sm"
      />
    </div>
  {/if}
  <Command.List class="max-h-72 overflow-y-auto p-1">
    <Command.Empty class="px-2 py-6 text-center text-sm text-muted-foreground">{emptyText}</Command.Empty>
    {#each users as user (user.id)}
      <!-- Search matches what people see (the name, then the subtitle), never the id. -->
      <Command.Item
        value={user.id}
        label={user.name}
        keywords={user.subtitle ? [user.subtitle] : []}
        onSelect={() => onPick(user)}
        class="flex min-h-touch cursor-default items-center gap-3 rounded-md px-2 py-1.5 text-sm outline-none select-none data-disabled:opacity-50 data-highlighted:bg-muted sm:min-h-10"
      >
        <Avatar name={user.name} src={user.avatarUrl} srcset={user.avatarSrcset} size="sm" decorative />
        <span class="grid min-w-0 flex-1">
          <span class="truncate font-medium text-foreground">{user.name}</span>
          {#if user.subtitle}<span class="truncate text-xs text-muted-foreground">{user.subtitle}</span>{/if}
        </span>
        {#if user.id === selectedId}
          <Check class="size-4 shrink-0 text-primary" aria-hidden="true" />
          <span class="sr-only">(selected)</span>
        {/if}
      </Command.Item>
    {/each}
  </Command.List>
</Command.Root>
