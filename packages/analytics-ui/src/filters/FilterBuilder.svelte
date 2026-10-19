<script lang="ts">
import type { FilterGroup } from '@protoyard/analytics';
import { Button } from '@protoyard/ui';
import { untrack } from 'svelte';
import FilterGroupEditor from './FilterGroupEditor.svelte';
import { describeFilter, type FilterProperty, validateFilter } from './model.ts';

type Props = {
  /** The applied filter (data). */
  value: FilterGroup;
  properties: readonly FilterProperty[];
  /** Receives the validated filter on Apply. Return a promise to show pending feedback. */
  onchange: (filter: FilterGroup) => unknown;
  label?: string;
};

let { value, properties, onchange, label = 'Filters' }: Props = $props();

let draft = $state<FilterGroup>({ combinator: 'and', conditions: [] });
let errors = $state<Record<string, string>>({});
let status = $state('');

// A new applied value (saved segment, URL, scenario load) replaces the draft.
$effect.pre(() => {
  const next = structuredClone($state.snapshot(value) as FilterGroup);
  untrack(() => {
    draft = next;
    errors = {};
  });
});

const summary = $derived(describeFilter(draft, properties));
const count = $derived(Object.keys(errors).length);

async function apply() {
  const result = validateFilter($state.snapshot(draft) as FilterGroup, properties);
  errors = result.errors;
  if (!result.ok || !result.data) {
    status = `Fix ${count === 1 ? 'the highlighted field' : `${count} highlighted fields`} to apply`;
    return;
  }
  status = '';
  await onchange(result.data);
}
</script>

<section class="grid gap-3" aria-label={label}>
  <FilterGroupEditor group={draft} {properties} {errors} onchange={(next) => (draft = next)} />
  <div class="flex flex-wrap items-center justify-between gap-2">
    <p class="m-0 text-xs text-muted-foreground" data-filter-summary="">{summary}</p>
    <div class="flex gap-2">
      <Button
        variant="ghost"
        size="sm"
        onclick={() => {
          draft = { combinator: 'and', conditions: [] };
          errors = {};
          status = '';
        }}>Clear</Button
      >
      <Button size="sm" onclick={apply}>Apply filters</Button>
    </div>
  </div>
  <p class="m-0 text-xs text-destructive empty:hidden" role="status">{status}</p>
</section>
