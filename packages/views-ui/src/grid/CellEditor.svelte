<script lang="ts" generics="T">
import { Button, Input, Select } from '@protoyard/ui';
import { Checkbox } from 'texuli/choice';
import type { DataGridColumn } from './model.ts';

/**
 * The inline editor of one DataGrid cell, by column type: a switch, a native
 * select or an input. Native controls edit in place (no overlay layers inside
 * a cell). It loads with the first edit, so read-only grids never download it.
 */
let {
  column,
  row,
  draft,
  onDraft,
  onKeydown,
  onSave,
}: {
  column: DataGridColumn<T>;
  row: T;
  draft: string | boolean;
  onDraft: (draft: string | boolean) => void;
  onKeydown: (event: KeyboardEvent) => void;
  onSave: () => void;
} = $props();
</script>

{#if column.type === 'boolean'}
  <Checkbox
    data-editor
    role="switch"
    aria-label={column.header}
    class="size-4 accent-primary"
    checked={draft === true}
    onCheckedChange={onDraft}
    onkeydown={onKeydown}
  />
  <Button size="sm" variant="ghost" onclick={onSave}>Save</Button>
{:else if column.type === 'enum' && column.options}
  <Select
    data-editor
    aria-label={column.header}
    class="h-7 rounded border border-input bg-background px-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
    items={column.options.map((option) => ({ value: option, label: column.format ? column.format(option, row) : option }))}
    value={String(draft)}
    onValueChange={onDraft}
    onkeydown={onKeydown}
  />
  <Button size="sm" variant="ghost" onclick={onSave}>Save</Button>
{:else}
  <Input
    data-editor
    aria-label={column.header}
    type={column.type === 'number' ? 'number' : column.type === 'date' ? 'date' : 'text'}
    class="h-7 w-full rounded border border-input bg-background px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    value={String(draft)}
    oninput={(event) => onDraft((event.currentTarget as HTMLInputElement).value)}
    onkeydown={onKeydown}
    onblur={onSave}
  />
{/if}
