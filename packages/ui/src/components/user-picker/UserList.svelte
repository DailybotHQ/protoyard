<script lang="ts">
import { Check, Search } from '@lucide/svelte';
import { Command } from 'bits-ui';
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

const byId = $derived(new Map(users.map((user) => [user.id, user])));

// Match on what people see (name/subtitle), never on opaque ids.
function filter(value: string, search: string): number {
  const user = byId.get(value);
  if (!user) return 0;
  const needle = search.trim().toLowerCase();
  if (!needle) return 1;
  const name = user.name.toLowerCase();
  if (name.startsWith(needle)) return 1;
  if (name.includes(needle)) return 0.8;
  return user.subtitle?.toLowerCase().includes(needle) ? 0.5 : 0;
}
</script>

<Command.Root {label} {filter} loop class={cn('flex flex-col', className)}>
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
    <Command.Viewport>
      <Command.Empty class="px-2 py-6 text-center text-sm text-muted-foreground">{emptyText}</Command.Empty>
      {#each users as user (user.id)}
        <Command.Item
          value={user.id}
          onSelect={() => onPick(user)}
          class="flex min-h-touch cursor-default items-center gap-3 rounded-md px-2 py-1.5 text-sm outline-none select-none data-disabled:opacity-50 data-selected:bg-muted sm:min-h-10"
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
    </Command.Viewport>
  </Command.List>
</Command.Root>
