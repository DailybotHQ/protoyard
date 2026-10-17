<script lang="ts">
import { ChevronsUpDown } from '@lucide/svelte';
import { Popover as PopoverPrimitive } from 'bits-ui';
import { cn } from '../../lib/cn.ts';
import { floatingSurface } from '../../lib/overlay.ts';
import Avatar from '../avatar/Avatar.svelte';
import { fieldClasses } from '../input/input-classes.ts';
import type { PickerUser } from './types.ts';
import UserList from './UserList.svelte';

interface Props {
  users: PickerUser[];
  /** Selected user id. */
  value?: string;
  onValueChange?: (value: string, user: PickerUser) => void;
  /** `inline` renders the searchable list directly (persona switchers, sign-in screens). */
  variant?: 'popover' | 'inline';
  searchable?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  label?: string;
  disabled?: boolean;
  open?: boolean;
  id?: string;
  class?: string;
}

let {
  users,
  value = $bindable(''),
  onValueChange,
  variant = 'popover',
  searchable = true,
  placeholder = 'Select a person',
  searchPlaceholder = 'Search people…',
  emptyText = 'No one found',
  label = 'People',
  disabled = false,
  open = $bindable(false),
  id,
  class: className,
}: Props = $props();

const selected = $derived(users.find((user) => user.id === value));

function pick(user: PickerUser): void {
  value = user.id;
  onValueChange?.(user.id, user);
  open = false;
}
</script>

{#if variant === 'inline'}
  <div class={cn('overflow-hidden rounded-xl border border-border bg-surface shadow-soft', className)}>
    <UserList
      {users}
      selectedId={value}
      onPick={pick}
      {searchable}
      {searchPlaceholder}
      {emptyText}
      {label}
    />
  </div>
{:else}
  <PopoverPrimitive.Root bind:open>
    <PopoverPrimitive.Trigger
      {id}
      {disabled}
      aria-label={selected ? `${label}: ${selected.name}` : label}
      class={cn(
        fieldClasses,
        'flex h-10 min-h-touch items-center gap-2 px-2.5 text-left sm:min-h-0',
        className
      )}
    >
      {#if selected}
        <Avatar name={selected.name} src={selected.avatarUrl} size="xs" decorative />
        <span class="min-w-0 flex-1 truncate">{selected.name}</span>
      {:else}
        <span class="min-w-0 flex-1 truncate text-muted-foreground">{placeholder}</span>
      {/if}
      <ChevronsUpDown class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </PopoverPrimitive.Trigger>
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={4}
        align="start"
        class={cn(floatingSurface, 'w-(--bits-popover-anchor-width) min-w-64 overflow-hidden p-0')}
      >
        <UserList
          {users}
          selectedId={value}
          onPick={pick}
          {searchable}
          {searchPlaceholder}
          {emptyText}
          {label}
        />
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  </PopoverPrimitive.Root>
{/if}
