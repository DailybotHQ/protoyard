<script lang="ts">
import { CommandEmpty, CommandInput, CommandItem, CommandList, CommandRoot } from 'texuli/command';
import { Icon } from 'texuli/icons';
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

<!-- Texuli's command list (`texuli/command`) with an avatar row per person. -->
<CommandRoot {label} loop class={className}>
  {#if searchable}
    <CommandInput placeholder={searchPlaceholder} showEscHint={false} />
  {/if}
  <CommandList>
    <CommandEmpty>{emptyText}</CommandEmpty>
    {#each users as user (user.id)}
      <!-- Search matches what people see (the name, then the subtitle), never the id. -->
      <CommandItem
        value={user.id}
        label={user.name}
        keywords={user.subtitle ? [user.subtitle] : []}
        onSelect={() => onPick(user)}
        hideIcon
      >
        <span class="ui-user-row">
          <Avatar name={user.name} src={user.avatarUrl} srcset={user.avatarSrcset} size="sm" decorative />
          <span class="ui-user-row__text">
            <span class="tx-command__item-label">{user.name}</span>
            {#if user.subtitle}<span class="tx-command__item-description">{user.subtitle}</span>{/if}
          </span>
          {#if user.id === selectedId}
            <Icon icon="check" size="sm" class="ui-user-row__check" aria-hidden="true" />
            <span class="tx-sr-only">(selected)</span>
          {/if}
        </span>
      </CommandItem>
    {/each}
  </CommandList>
</CommandRoot>

<style>
  .ui-user-row {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    min-inline-size: 0;
  }
  .ui-user-row__text {
    display: grid;
    flex: 1 1 auto;
    min-inline-size: 0;
  }
  .ui-user-row :global(.ui-user-row__check) {
    flex-shrink: 0;
    color: var(--tx-primary, Highlight);
  }
</style>
