<script lang="ts" generics="T">
import { Plus, X } from '@lucide/svelte';
import { Button, Input, Select } from '@protoyard/ui';
import {
  FILTER_LIMITS,
  type FilterCondition,
  type FilterGroup,
  type FilterNode,
  type FilterOperator,
  type GridColumnDef,
  OPERATORS_BY_TYPE,
} from '@protoyard/views/grid';
import { Checkbox } from 'texuli/choice';
import { cx } from 'texuli/cx';
import { Icon } from 'texuli/icons';
import { newCondition, newGroup, typedScalar, updateAt, valueFor } from './model.ts';

/**
 * Edits a filter as nested and/or groups of conditions. Every control has a
 * label and every add or remove button a name. The value is the engine's
 * filter AST (bindable); `null` means no filter.
 */
let {
  columns,
  value = $bindable(null),
  label = 'Filters',
  onchange,
  class: className,
}: {
  columns: readonly GridColumnDef<T>[];
  value?: FilterNode | null;
  label?: string;
  /** Called with every change (`null` when the filter is cleared). */
  onchange?: (value: FilterNode | null) => void;
  class?: string;
} = $props();

const uid = $props.id();
const OPERATOR_LABELS: Record<FilterOperator, string> = {
  eq: 'is',
  neq: 'is not',
  contains: 'contains',
  in: 'is any of',
  between: 'is between',
  before: 'is before',
  after: 'is after',
  isEmpty: 'is empty',
  isNotEmpty: 'is not empty',
};

const root = $derived<FilterGroup | null>(
  value === null
    ? null
    : value.type === 'group'
      ? value
      : { type: 'group', op: 'and', children: [value] }
);
const byKey = $derived(new Map(columns.map((column) => [column.key, column])));

function set(path: readonly number[], next: FilterNode | null) {
  if (!root) return;
  const updated = updateAt(root, path, next);
  emit(updated && updated.type === 'group' && updated.children.length === 0 ? null : updated);
}

function emit(next: FilterNode | null) {
  value = next;
  onchange?.(next);
}

function inputType(column: GridColumnDef<T> | undefined) {
  return column?.type === 'number' ? 'number' : column?.type === 'date' ? 'date' : 'text';
}

const control =
  'h-9 rounded-md border border-input bg-surface px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';
</script>

{#snippet conditionRow(condition: FilterCondition, path: number[], n: number)}
  {@const column = byKey.get(condition.field)}
  {@const id = `filter-${uid}-${path.join('-')}`}
  <div class="flex flex-wrap items-end gap-2" data-filter-condition>
    <div class="grid gap-1 text-xs text-muted-foreground">
      <label for={`${id}-field`}>Field</label>
      <Select
        id={`${id}-field`}
        class={control}
        items={columns.map((option) => ({ value: option.key, label: option.header }))}
        value={condition.field}
        onValueChange={(field) => {
          const next = byKey.get(field);
          const operator = next ? (OPERATORS_BY_TYPE[next.type][0] ?? 'eq') : condition.operator;
          set(path, { type: 'condition', field: next?.key ?? '', operator, value: valueFor(next, operator) });
        }}
      />
    </div>
    <div class="grid gap-1 text-xs text-muted-foreground">
      <label for={`${id}-op`}>Condition</label>
      <Select
        id={`${id}-op`}
        class={control}
        items={(column ? OPERATORS_BY_TYPE[column.type] : []).map((operator) => ({ value: operator, label: OPERATOR_LABELS[operator] }))}
        value={condition.operator}
        onValueChange={(value) => {
          const operator = value as FilterOperator;
          set(path, { ...condition, operator, value: valueFor(column, operator) });
        }}
      />
    </div>
    {#if condition.operator === 'between'}
      {@const range = Array.isArray(condition.value) ? condition.value : ['', '']}
      {#each ['From', 'To'] as bound, i (bound)}
        <div class="grid gap-1 text-xs text-muted-foreground">
          <label for={`${id}-${bound}`}>{bound}</label>
          <Input
            id={`${id}-${bound}`}
            class={cx(control, 'w-32')}
            type={inputType(column)}
            value={String(range[i] ?? '')}
            oninput={(event) => {
              const next = [...range];
              next[i] = typedScalar(column, (event.currentTarget as HTMLInputElement).value);
              set(path, { ...condition, value: next });
            }}
          />
        </div>
      {/each}
    {:else if condition.operator === 'in' && column?.type === 'enum' && column.options}
      {@const chosen = Array.isArray(condition.value) ? condition.value.map(String) : []}
      <fieldset class="flex flex-wrap gap-2 text-sm">
        <legend class="mb-1 text-xs text-muted-foreground">Values</legend>
        {#each column.options as option (option)}
          <label class="flex items-center gap-1">
            <Checkbox
              checked={chosen.includes(option)}
              onCheckedChange={(on) => {
                set(path, { ...condition, value: on ? [...chosen, option] : chosen.filter((v) => v !== option) });
              }}
            />
            {option}
          </label>
        {/each}
      </fieldset>
    {:else if condition.operator === 'in'}
      <div class="grid gap-1 text-xs text-muted-foreground">
        <label for={`${id}-values`}>Values (comma-separated)</label>
        <Input
          id={`${id}-values`}
          class={control}
          value={Array.isArray(condition.value) ? condition.value.join(', ') : ''}
          oninput={(event) => {
            const parts = (event.currentTarget as HTMLInputElement).value.split(',').map((part) => part.trim()).filter(Boolean);
            set(path, { ...condition, value: parts.map((part) => typedScalar(column, part)) });
          }}
        />
      </div>
    {:else if condition.operator !== 'isEmpty' && condition.operator !== 'isNotEmpty'}
      <div class="grid gap-1 text-xs text-muted-foreground">
        <label for={`${id}-value`}>Value</label>
        {#if column?.type === 'boolean'}
          <Select
            id={`${id}-value`}
            class={control}
            items={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]}
            value={String(condition.value)}
            onValueChange={(value) => set(path, { ...condition, value: value === 'true' })}
          />
        {:else if column?.type === 'enum' && column.options}
          <Select
            id={`${id}-value`}
            class={control}
            items={[{ value: '', label: 'Choose…', disabled: true }, ...column.options.map((option) => ({ value: option, label: option }))]}
            value={String(condition.value ?? '')}
            onValueChange={(value) => set(path, { ...condition, value })}
          />
        {:else}
          <Input
            id={`${id}-value`}
            class={control}
            type={inputType(column)}
            value={String(condition.value ?? '')}
            oninput={(event) => set(path, { ...condition, value: typedScalar(column, (event.currentTarget as HTMLInputElement).value) })}
          />
        {/if}
      </div>
    {/if}
    <Button variant="ghost" size="icon" aria-label={`Remove condition ${n}`} onclick={() => set(path, null)}>
      <Icon icon="close" class="size-4" aria-hidden="true"  />
    </Button>
  </div>
{/snippet}

{#snippet group(node: FilterGroup, path: number[], depth: number)}
  <fieldset class={cx('grid gap-2 rounded-lg border border-border p-3', depth > 0 && 'bg-muted/30')} data-filter-group>
    <legend class="flex items-center gap-2 px-1 text-sm">
      <label for={`filter-${uid}-g${path.join('-')}`}>
        Match<span class="sr-only">{depth === 0 ? ' for these conditions' : ` for this group (level ${depth + 1})`}</span>
      </label>
      <Select
          id={`filter-${uid}-g${path.join('-')}`}
          class={cx(control, 'h-8')}
          items={[{ value: 'and', label: 'all of' }, { value: 'or', label: 'any of' }]}
          value={node.op}
          onValueChange={(op) => set(path, { ...node, op: op as 'and' | 'or' })}
        />
    </legend>
    {#each node.children as child, i (i)}
      {#if child.type === 'group'}
        {@render group(child, [...path, i], depth + 1)}
      {:else}
        {@render conditionRow(child, [...path, i], i + 1)}
      {/if}
    {/each}
    <div class="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onclick={() => set(path, { ...node, children: [...node.children, newCondition(columns)] })}>
        <Icon icon="plus" class="size-4" aria-hidden="true"  />Add condition
      </Button>
      {#if depth + 2 < FILTER_LIMITS.depth}
        <Button variant="outline" size="sm" onclick={() => set(path, { ...node, children: [...node.children, newGroup(columns)] })}>
          <Icon icon="plus" class="size-4" aria-hidden="true"  />Add group
        </Button>
      {/if}
      {#if depth > 0}
        <Button variant="ghost" size="sm" onclick={() => set(path, null)}>Remove group</Button>
      {/if}
    </div>
  </fieldset>
{/snippet}

<section aria-label={label} class={cx('grid gap-2', className)}>
  {#if root}
    {@render group(root, [], 0)}
    <div>
      <Button variant="ghost" size="sm" onclick={() => emit(null)}>Clear filters</Button>
    </div>
  {:else}
    <Button variant="outline" size="sm" onclick={() => emit(newGroup(columns))}>
      <Icon icon="plus" class="size-4" aria-hidden="true"  />Add a filter
    </Button>
  {/if}
</section>
