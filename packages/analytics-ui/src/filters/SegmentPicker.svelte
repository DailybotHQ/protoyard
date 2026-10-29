<script lang="ts">
import type { FilterGroup, Segment } from '@protoyard/analytics';
import { Button } from '@protoyard/ui';
import { Input } from 'texuli/input';
import { Toggle } from 'texuli/toggle';
import { describeFilter, type FilterProperty, saveErrorOf } from './model.ts';

type Props = {
  segments: readonly Segment[];
  /** Id of the applied segment, or null for everyone. */
  activeId?: string | null;
  onapply: (segment: Segment | null) => void;
  properties: readonly FilterProperty[];
  /** The filter a new segment would save (usually the applied filter). */
  filter: FilterGroup;
  /**
   * Saves a segment through the prototype's service and returns its promise
   * (e.g. `(input) => runService(() => saveSegment(runtime, input))`). A
   * resolved `{ ok: false, error }` or a rejection shows the error inline.
   */
  onsave?: (input: { name: string; filter: FilterGroup }) => unknown;
};

let { segments, activeId = null, onapply, properties, filter, onsave }: Props = $props();

const uid = $props.id();
let name = $state('');
let nameError = $state('');
let status = $state('');
let failure = $state('');
let selectedId = $state<string | null>(null);
$effect(() => {
  selectedId = activeId;
});

async function save() {
  nameError = '';
  failure = '';
  status = '';
  const trimmed = name.trim();
  if (!trimmed) {
    nameError = 'Name the segment';
    return;
  }
  let error: unknown = null;
  try {
    const result = (await onsave?.({
      name: trimmed,
      filter: $state.snapshot(filter) as FilterGroup,
    })) as { ok?: boolean; error?: unknown } | undefined;
    if (result && result.ok === false)
      error = result.error ?? new Error('Could not save the segment');
  } catch (caught) {
    error = caught;
  }
  if (error) {
    const reason = saveErrorOf(error);
    if (reason.field?.name) nameError = reason.field.name;
    else failure = reason.message;
    return;
  }
  status = `Saved “${trimmed}”`;
  name = '';
}
</script>

<section class="grid gap-3" aria-label="Segments">
  <div role="group" aria-label="Saved segments" class="flex flex-wrap gap-1">
    {#each [null, ...segments] as segment (segment?.id ?? '__everyone')}
      {@const segmentId = segment?.id ?? null}
      {@const active = segmentId === selectedId}
      <Toggle
        pressed={active}
        onPressedChange={(pressed) => {
          if (!pressed) return;
          selectedId = segmentId;
          onapply(segment);
        }}
        title={segment ? describeFilter(segment.filter, properties) : 'No filter'}
        class="rounded-full border px-3 py-1 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border text-foreground hover:bg-muted'}"
        >{segment?.name ?? 'Everyone'}</Toggle
      >
    {/each}
  </div>

  {#if onsave}
    <form
      class="grid gap-1"
      onsubmit={(event) => {
        event.preventDefault();
      }}
    >
      <label for="{uid}-name" class="text-xs font-medium text-foreground">Save current filter as a segment</label>
      <div class="flex flex-wrap gap-2">
        <Input
          id="{uid}-name"
          class="h-8 min-w-0 flex-1 rounded-md border border-input bg-surface px-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-invalid:border-destructive"
          placeholder="e.g. Pro users in Europe"
          maxlength={60}
          bind:value={name}
          aria-invalid={nameError ? 'true' : undefined}
          aria-describedby={nameError ? `${uid}-name-error` : undefined}
        />
        <Button size="sm" onclick={save}>Save segment</Button>
      </div>
      {#if nameError}<p id="{uid}-name-error" class="m-0 text-xs text-destructive">{nameError}</p>{/if}
      {#if failure}<p role="alert" class="m-0 text-xs text-destructive">{failure}</p>{/if}
      <p role="status" class="m-0 text-xs text-success empty:hidden">{status}</p>
    </form>
  {/if}
</section>
