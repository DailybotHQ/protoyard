<script lang="ts" generics="T">
import { Button } from '@protoyard/ui';
import type { FilterNode, GridColumnDef } from '@protoyard/views/grid';
import {
  type FilterField,
  newCondition,
  FilterBuilder as TexuliFilterBuilder,
  type FilterGroup as TexuliFilterGroup,
} from '@texuli/data/filter-builder';
import { Icon } from 'texuli/icons';

/** Stable Protoyard wrapper around Texuli's grid-filter editor. */
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
  onchange?: (value: FilterNode | null) => void;
  class?: string;
} = $props();

const fields = $derived<FilterField[]>(
  columns.map(({ key, header, type, options, accessor }) => ({
    key,
    header,
    type,
    options,
    accessor,
  }))
);
const root = $derived<TexuliFilterGroup | null>(
  value === null
    ? null
    : value.type === 'group'
      ? value
      : { type: 'group', op: 'and', children: [value] }
);

function update(next: TexuliFilterGroup) {
  const normalized = next.children.length === 0 ? null : next;
  value = normalized;
  onchange?.(normalized);
}

function start() {
  const first = fields[0];
  if (!first) return;
  update({
    type: 'group',
    op: 'and',
    children: [newCondition(first)],
  });
}
</script>

<section aria-label={label} class={className}>
  {#if root}
    <TexuliFilterBuilder fields={fields} value={root} onValueChange={update} />
  {:else}
    <Button variant="outline" size="sm" disabled={fields.length === 0} onclick={start}>
      <Icon icon="plus" class="size-4" aria-hidden="true" />Add a filter
    </Button>
  {/if}
</section>
