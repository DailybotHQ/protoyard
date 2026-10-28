<script lang="ts">
import * as PopoverPrimitive from '@texuli/primitives/popover';
import { cardClass } from 'texuli/card';
import { cx } from 'texuli/cx';
import { Icon } from 'texuli/icons';
import { PopoverContent } from 'texuli/popover';
import { selectTriggerClass } from 'texuli/select';
import Avatar from '../avatar/Avatar.svelte';
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

<!--
  A person picker composed of Texuli parts: the select-style trigger
  (`texuli/select` classes), Texuli's popover surface and command list.
-->
{#if variant === 'inline'}
  <div class={cardClass({ class: cx('ui-user-picker--inline', className) })} data-tx-card="">
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
  <PopoverPrimitive.Root bind:open sideOffset={4} align="start">
    <PopoverPrimitive.Trigger
      {id}
      {disabled}
      aria-label={selected ? `${label}: ${selected.name}` : label}
      class={selectTriggerClass({ class: className })}
      data-tx-select-trigger=""
    >
      <span class="tx-select-trigger__body ui-user-picker__value">
        {#if selected}
          <Avatar name={selected.name} src={selected.avatarUrl} srcset={selected.avatarSrcset} size="xs" decorative />
          <span class="tx-select-value">{selected.name}</span>
        {:else}
          <span class="tx-select-value" data-placeholder="">{placeholder}</span>
        {/if}
      </span>
      <Icon icon="chevron-down" size="sm" class="tx-select-trigger__chevron" aria-hidden="true" />
    </PopoverPrimitive.Trigger>
    <!-- The list opens in the top layer; no portal is needed. -->
    <PopoverContent arrow={false} class="ui-user-picker__content">
      <UserList
        {users}
        selectedId={value}
        onPick={pick}
        {searchable}
        {searchPlaceholder}
        {emptyText}
        {label}
      />
    </PopoverContent>
  </PopoverPrimitive.Root>
{/if}

<style>
  .ui-user-picker__value {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    min-inline-size: 0;
  }
  :global(.ui-user-picker__content) {
    padding: 0;
    overflow: hidden;
  }
  .ui-user-picker--inline {
    overflow: hidden;
    padding: 0;
  }
</style>
