<script lang="ts">
/**
 * A blueprint `canvas` screen: one infinite canvas per record, stored in a
 * `json` field, over `@protoyard/views-ui/canvas`. A picker chooses the
 * record; every edit saves the field through the entity's update service
 * (permission, schema and transaction, like any other edit). The stored
 * value is untrusted: the view validates it, and a value that is not a
 * canvas is never repaired silently (the owner can start the record over).
 */
import type { Blueprint, EntityInput, EntityServices } from '@protoyard/blueprint';
import type { PrototypeRuntime } from '@protoyard/core';
import { can, liveQuery, runService, usePrincipal } from '@protoyard/renderer-svelte';
import { Button, FormField, Select } from '@protoyard/ui';
import { type CanvasDocument, CanvasView, validateCanvas } from '@protoyard/views-ui/canvas';
import { formatEntityHeading } from '../../format.ts';
import { blankCanvas, type CanvasScreenSpec, canvasRecordOptions, storedCanvas } from './model.ts';

let {
  runtime,
  blueprint,
  services,
  screen,
  title,
}: {
  runtime: PrototypeRuntime;
  blueprint: Blueprint;
  services: EntityServices;
  screen: CanvasScreenSpec;
  title?: string;
} = $props();

function requireEntity(name: string) {
  const found = blueprint.entities.find((candidate) => candidate.name === name);
  if (!found) throw new RangeError(`canvas screen: unknown entity "${name}"`);
  return found;
}

function requireService(name: string) {
  const found = services[name];
  if (!found) throw new RangeError(`canvas screen: no service for "${name}"`);
  return found;
}

// svelte-ignore state_referenced_locally
const entity = requireEntity(screen.entity);
// svelte-ignore state_referenced_locally
const service = requireService(screen.entity);

// svelte-ignore state_referenced_locally
const principal = usePrincipal(runtime);
let attempt = $state(0);
const rows = liveQuery(() => service.list(), {
  initial: undefined,
  deps: () => [attempt, principal.current?.persona.id],
});

const label = $derived(title ?? `${formatEntityHeading(entity)} canvas`);
const options = $derived(canvasRecordOptions(rows.current ?? [], entity));
let chosen = $state<string | undefined>(undefined);
const recordId = $derived(
  chosen && options.some((option) => option.value === chosen) ? chosen : options[0]?.value
);
const record = $derived(rows.current?.find((row) => String(row.id) === recordId));
const recordTitle = $derived(options.find((option) => option.value === recordId)?.label ?? '');
const stored = $derived(record ? storedCanvas(record, screen, recordTitle) : undefined);
const broken = $derived(stored !== undefined && !validateCanvas(stored).ok);
const query = {
  get current() {
    return stored;
  },
  get loading() {
    return rows.loading;
  },
  get error() {
    return rows.error;
  },
};
const canUpdate = $derived(
  can(`${entity.name}:update`, undefined, runtime) ||
    can(`${entity.name}:update:own`, undefined, runtime)
);

/** Saves the record's canvas field; the view puts the stored canvas back when it is refused. */
async function save(canvas: CanvasDocument): Promise<boolean> {
  if (!recordId) return false;
  await service.update(recordId, { [screen.field]: canvas } as EntityInput);
  return true;
}

function startOver(): Promise<unknown> {
  const id = recordId;
  if (!id) return Promise.resolve();
  return runService(() =>
    service.update(id, { [screen.field]: blankCanvas(recordTitle) } as EntityInput)
  );
}
</script>

<section class="grid gap-3" aria-labelledby="canvas-screen-title" data-py-canvas-screen={entity.name}>
  <div class="flex flex-wrap items-end justify-between gap-3">
    <h1 id="canvas-screen-title" class="text-xl font-semibold">{label}</h1>
    {#if options.length > 1}
      <FormField label={formatEntityHeading(entity)} class="min-w-56">
        {#snippet children(props)}
          <Select {...props} items={options} value={recordId} onValueChange={(value) => (chosen = value)} />
        {/snippet}
      </FormField>
    {/if}
  </div>
  {#if rows.current !== undefined && options.length === 0}
    <p class="text-sm text-muted-foreground">No {entity.plural} yet: create one to start its canvas.</p>
  {:else}
    <p class="text-sm text-muted-foreground">
      {canUpdate
        ? `Every change saves to ${recordTitle || 'this record'}.`
        : 'Your role can read this canvas but not edit it.'}
    </p>
    {#if broken && canUpdate}
      <Button variant="outline" size="sm" class="justify-self-start" onclick={startOver}>
        Start over with a blank canvas
      </Button>
    {/if}
    {#key recordId}
      <CanvasView
        {query}
        label={recordTitle ? `${label}: ${recordTitle}` : label}
        onChange={canUpdate ? save : undefined}
        onRetry={() => (attempt += 1)}
      />
    {/key}
  {/if}
</section>
