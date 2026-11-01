<script lang="ts">
import type { FilterGroup } from '@protoyard/analytics';
import {
  type FilterField,
  type FilterGroup as FilterModel,
  type FilterOperatorDef,
  FilterBuilder as TexuliFilterBuilder,
} from '@texuli/data/filter-builder';
import { Button } from 'texuli/button';
import {
  BUILDER_OPERATOR_LABELS,
  BUILDER_OPERATORS,
  type BuilderGroup,
  builderFields,
  builderIssues,
  type FilterProperty,
  fromBuilderFilter,
  toBuilderFilter,
} from './model.ts';

/**
 * Edits one filter group with Texuli's filter builder (G49): nested and/or
 * groups, operators by property type, and Protoyard's extra operators as
 * catalog operators. The model stays Protoyard's `FilterGroup`.
 */
type Props = {
  group: FilterGroup;
  properties: readonly FilterProperty[];
  /** Field errors keyed by path (`conditions.0.value`). */
  errors?: Record<string, string>;
  /** This group's path prefix inside the root filter ('' for the root). */
  path?: string;
  depth?: number;
  maxDepth?: number;
  onchange: (group: FilterGroup) => void;
  /** Present for nested groups. */
  onremove?: () => void;
  label?: string;
};

let {
  group,
  properties,
  errors = {},
  path = '',
  depth = 1,
  maxDepth = 3,
  onchange,
  onremove,
  label = 'Filter conditions',
}: Props = $props();

const uid = $props.id();
const fields = $derived(builderFields(properties) as unknown as FilterField[]);
const operators = BUILDER_OPERATORS as unknown as FilterOperatorDef[];
const model = $derived(toBuilderFilter(group, properties) as FilterModel);
/**
 * The catalog checks run on Apply. Errors on a condition go to the builder as
 * host issues (G101), which marks that condition's control; errors on a group
 * are listed under the builder by name.
 */
const split = $derived(builderIssues(errors, path));
const issues = $derived(split.other);
</script>

<div class="grid gap-2" data-py-filter-group={path || 'root'}>
  <TexuliFilterBuilder
    {fields}
    {operators}
    value={model}
    onValueChange={(next) => onchange(fromBuilderFilter(next as BuilderGroup, properties))}
    maxDepth={Math.max(1, maxDepth - depth + 1)}
    issues={split.issues}
    labels={{ builder: label, operators: BUILDER_OPERATOR_LABELS }}
  />
  {#if issues.length}
    <ul id="{uid}-issues" class="m-0 grid list-none gap-0.5 p-0 text-xs text-destructive" aria-label="Filter errors" data-filter-issues>
      {#each issues as issue (issue.key)}
        <li>{issue.name}: {issue.message}</li>
      {/each}
    </ul>
  {/if}
  {#if onremove}
    <Button type="button" variant="ghost" size="sm" class="justify-self-start" onclick={onremove}>Remove group</Button>
  {/if}
</div>
