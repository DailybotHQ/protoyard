<script lang="ts">
import { X } from '@lucide/svelte';
import { type FilterCondition, type FilterGroup, OPERATOR_LABELS } from '@protoyard/analytics';
import { Button } from 'texuli/button';
import { Checkbox } from 'texuli/choice';
import { LucideIcon } from 'texuli/icons/lucide';
import { Input } from 'texuli/input';
import { Select } from 'texuli/select';
// Self-import for nested groups, under another name: the emitted declaration
// already declares `FilterGroupEditor`.
import NestedGroupEditor from './FilterGroupEditor.svelte';
import {
  adjustCondition,
  type FilterProperty,
  newCondition,
  operatorsFor,
  parseScalar,
  takesList,
  takesValue,
} from './model.ts';

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
}: Props = $props();

const uid = $props.id();
const field =
  'h-8 min-w-0 rounded-md border border-input bg-surface px-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-invalid:border-destructive';
const ghost =
  'inline-flex h-8 items-center rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

const propertyOf = (c: FilterCondition) => properties.find((p) => p.path === c.property);
const setAt = (i: number, next: FilterCondition | FilterGroup) =>
  onchange({ ...group, conditions: group.conditions.map((c, k) => (k === i ? next : c)) });
const removeAt = (i: number) =>
  onchange({ ...group, conditions: group.conditions.filter((_, k) => k !== i) });
const errorAt = (i: number, key: string) => errors[`${path}conditions.${i}.${key}`];
const text = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const inputType = (p: FilterProperty | undefined) =>
  p?.type === 'number' ? 'number' : p?.type === 'date' ? 'date' : 'text';
</script>

<fieldset class="m-0 grid gap-2 rounded-lg border border-border p-3 {depth > 1 ? 'bg-muted/30' : ''}">
  <legend class="sr-only">{depth > 1 ? 'Condition group' : 'Filter'}</legend>
  <div class="flex flex-wrap items-center gap-1" role="group" aria-label="Match">
    <span class="mr-1 text-xs text-muted-foreground" aria-hidden="true">Match</span>
    {#each [['and', 'All conditions'], ['or', 'Any condition']] as [combinator, label] (combinator)}
      <Button
        type="button"
        class="rounded-md px-2 py-1 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {group.combinator ===
        combinator
          ? 'bg-primary text-primary-foreground'
          : 'hover:bg-muted'}"
        aria-pressed={group.combinator === combinator}
        onclick={() => onchange({ ...group, combinator: combinator as 'and' | 'or' })}>{label}</Button
      >
    {/each}
    {#if onremove}
      <Button type="button" variant="ghost" class="{ghost} ml-auto" onclick={onremove}>Remove group</Button>
    {/if}
  </div>

  {#each group.conditions as condition, i (i)}
    {#if 'combinator' in condition}
      <NestedGroupEditor
        group={condition}
        {properties}
        {errors}
        path="{path}conditions.{i}."
        depth={depth + 1}
        {maxDepth}
        onchange={(next) => setAt(i, next)}
        onremove={() => removeAt(i)}
      />
    {:else}
      {@const property = propertyOf(condition)}
      {@const errorId = `${uid}-error-${i}`}
      {@const message = errorAt(i, 'value') ?? errorAt(i, 'property') ?? errorAt(i, 'operator')}
      <div class="grid gap-1" data-condition={i}>
        <div class="flex flex-wrap items-center gap-1.5">
          <Select.Root
            value={condition.property}
            onValueChange={(value) => {
              const next = properties.find((p) => p.path === value);
              if (next) setAt(i, adjustCondition({ ...condition, property: next.path }, next));
            }}
          >
            <Select.Trigger
              class={field}
              aria-label="Property"
              aria-invalid={errorAt(i, 'property') ? 'true' : undefined}
            ><Select.Value placeholder="Property" /></Select.Trigger>
            <Select.Content>
              <Select.Viewport>
                {#if !property}<Select.Item value={condition.property}>{condition.property}</Select.Item>{/if}
                {#each properties as p (p.path)}<Select.Item value={p.path}>{p.label}</Select.Item>{/each}
              </Select.Viewport>
            </Select.Content>
          </Select.Root>
          <Select.Root
            value={condition.operator}
            onValueChange={(value) =>
              property && setAt(i, adjustCondition({ ...condition, operator: value as never }, property))}
          >
            <Select.Trigger
              class={field}
              aria-label="Operator"
              aria-invalid={errorAt(i, 'operator') ? 'true' : undefined}
            ><Select.Value placeholder="Operator" /></Select.Trigger>
            <Select.Content>
              <Select.Viewport>
                {#each operatorsFor(property) as op (op)}<Select.Item value={op}>{OPERATOR_LABELS[op]}</Select.Item>{/each}
              </Select.Viewport>
            </Select.Content>
          </Select.Root>

          {#if takesValue(condition.operator) && property}
            {#if property.type === 'boolean'}
              <Select.Root
                value={String(condition.value ?? true)}
                onValueChange={(value) => setAt(i, { ...condition, value: value === 'true' })}
              >
                <Select.Trigger class={field} aria-label="Value"><Select.Value /></Select.Trigger>
                <Select.Content>
                  <Select.Viewport>
                    <Select.Item value="true">true</Select.Item>
                    <Select.Item value="false">false</Select.Item>
                  </Select.Viewport>
                </Select.Content>
              </Select.Root>
            {:else if condition.operator === 'between'}
              {@const pair = Array.isArray(condition.value) ? condition.value : [null, null]}
              {#each [0, 1] as k (k)}
                <Input
                  class="{field} w-28"
                  type={inputType(property)}
                  aria-label={k === 0 ? 'From' : 'To'}
                  aria-invalid={errorAt(i, 'value') ? 'true' : undefined}
                  aria-describedby={message ? errorId : undefined}
                  value={text(pair[k])}
                  onValueChange={(value) => {
                    const next = [...pair];
                    next[k] = parseScalar(value, property.type) as never;
                    setAt(i, { ...condition, value: next as never });
                  }}
                />
              {/each}
            {:else if takesList(condition.operator) && property.options}
              <div class="grid gap-1 rounded-md border border-input bg-surface p-2" role="group" aria-label="Values">
                {#each property.options as o (o.value)}
                  <Checkbox
                    label={o.label}
                    checked={Array.isArray(condition.value) && condition.value.includes(o.value)}
                    onCheckedChange={(checked) => {
                      const values = Array.isArray(condition.value) ? condition.value : [];
                      setAt(i, {
                        ...condition,
                        value: checked ? [...values, o.value] : values.filter((value) => value !== o.value),
                      });
                    }}
                  />
                {/each}
              </div>
            {:else if takesList(condition.operator)}
              <Input
                class="{field} w-48"
                aria-label="Values, separated by commas"
                aria-invalid={errorAt(i, 'value') ? 'true' : undefined}
                aria-describedby={message ? errorId : undefined}
                value={Array.isArray(condition.value) ? condition.value.join(', ') : ''}
                onValueChange={(value) =>
                  setAt(i, {
                    ...condition,
                    value: value
                      .split(',')
                      .map((part) => parseScalar(part, property.type))
                      .filter((v): v is string | number => v !== null && typeof v !== 'boolean'),
                  })}
              />
            {:else if property.options}
              <Select.Root
                value={text(condition.value)}
                onValueChange={(value) => setAt(i, { ...condition, value: value || null })}
              >
                <Select.Trigger
                  class={field}
                  aria-label="Value"
                  aria-invalid={errorAt(i, 'value') ? 'true' : undefined}
                  aria-describedby={message ? errorId : undefined}
                ><Select.Value placeholder="Choose…" /></Select.Trigger>
                <Select.Content>
                  <Select.Viewport>
                    {#each property.options as o (o.value)}<Select.Item value={o.value}>{o.label}</Select.Item>{/each}
                  </Select.Viewport>
                </Select.Content>
              </Select.Root>
            {:else}
              <Input
                class="{field} w-40"
                type={inputType(property)}
                aria-label="Value"
                aria-invalid={errorAt(i, 'value') ? 'true' : undefined}
                aria-describedby={message ? errorId : undefined}
                value={text(condition.value)}
                onValueChange={(value) => setAt(i, { ...condition, value: parseScalar(value, property.type) })}
              />
            {/if}
          {/if}
          <Button type="button" variant="ghost" class={ghost} aria-label="Remove condition {i + 1}" onclick={() => removeAt(i)}>
            <LucideIcon icon={X} class="size-3.5" />
          </Button>
        </div>
        {#if message}<p id={errorId} class="m-0 text-xs text-destructive">{message}</p>{/if}
      </div>
    {/if}
  {/each}

  <div class="flex flex-wrap gap-1">
    <Button
      type="button"
      variant="ghost"
      class={ghost}
      disabled={properties.length === 0}
      onclick={() =>
        properties[0] && onchange({ ...group, conditions: [...group.conditions, newCondition(properties[0])] })}
      >+ Add condition</Button
    >
    {#if depth < maxDepth}
      <Button
        type="button"
        variant="ghost"
        class={ghost}
        disabled={properties.length === 0}
        onclick={() =>
          properties[0] &&
          onchange({
            ...group,
            conditions: [...group.conditions, { combinator: 'or', conditions: [newCondition(properties[0])] }],
          })}>+ Add group</Button
      >
    {/if}
  </div>
</fieldset>
