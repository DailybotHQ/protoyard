<script lang="ts">
import * as PopoverPrimitive from '@texuli/primitives/popover';
import type { HTMLAttributes } from 'svelte/elements';
import { cardClass } from 'texuli/card';
import { cx } from 'texuli/cx';
import { Icon } from 'texuli/icons';
import { PopoverContent } from 'texuli/popover';
import { selectTriggerClass, selectValueClass } from 'texuli/select';
import Avatar from '../avatar/Avatar.svelte';
import type { PickerUser } from './types.ts';
import UserList from './UserList.svelte';

interface OwnProps {
  /**
   * The picker's root element (bindable): the trigger button for `popover`,
   * the list card for `inline`.
   */
  ref?: HTMLElement | null;
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

/**
 * Extra attributes (`data-*`, `aria-*`, handlers…) land on the root: the
 * trigger button (`popover`, where it is the focusable control) or the list
 * card (`inline`). A caller `onclick` on the trigger runs first; calling
 * `preventDefault()` keeps the list closed.
 */
type Props = OwnProps & Omit<HTMLAttributes<HTMLElement>, keyof OwnProps>;

let {
  users,
  // No fallback: a caller may bind a value that starts undefined (a map entry);
  // a `$bindable('')` would throw (props_invalid_value). Read as ''.
  value = $bindable(),
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
  ref = $bindable(null),
  ...rest
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
  <div
    {...rest}
    bind:this={ref}
    class={cardClass({ class: cx('ui-user-picker--inline', className) })}
    data-tx-card=""
  >
    <UserList
      {users}
      selectedId={value ?? ''}
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
      {...rest}
      bind:ref
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
          <span class={selectValueClass({ placeholder: true })} data-placeholder="">{placeholder}</span>
        {/if}
      </span>
      <Icon icon="chevron-down" size="sm" class="tx-select-trigger__chevron" aria-hidden="true" />
    </PopoverPrimitive.Trigger>
    <!-- The list opens in the top layer; no portal is needed. -->
    <PopoverContent arrow={false} class="ui-user-picker__content">
      <UserList
        {users}
        selectedId={value ?? ''}
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
