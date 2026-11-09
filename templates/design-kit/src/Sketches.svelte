<script lang="ts">
import { PenLine } from '@lucide/svelte';
import { can, getRuntime, liveQuery, runService } from '@protoyard/renderer-svelte';
import { Badge, Button, EmptyState, Input, Select, Skeleton } from '@protoyard/ui';
import { type CanvasDocument, CanvasView } from '@protoyard/views-ui/canvas';
import { Heading, Text } from 'texuli/typography';
import type { DesignKitDatabase, Sketch } from './database/schema.ts';
import { CAPABILITIES } from './domain/policy.ts';
import { createSketchServices } from './domain/sketches.ts';

/**
 * Screen sketches: wireframes drawn with the kit's parts on an infinite
 * canvas (`@protoyard/views-ui/canvas`). Loaded lazily by App.svelte, so the
 * canvas editor never ships with the catalog.
 */
const runtime = getRuntime<DesignKitDatabase>();
const services = createSketchServices(runtime);
const sketches = liveQuery(() => runtime.db.sketches.orderBy('updatedAt').reverse().toArray(), {
  initial: undefined as Sketch[] | undefined,
});
const canSketch = $derived(can(CAPABILITIES.sketch));

let chosen = $state('');
let title = $state('');
let titleError = $state('');
const selected = $derived(
  (sketches.current ?? []).find((sketch) => sketch.id === chosen) ?? sketches.current?.[0]
);
const selectedId = $derived(selected?.id ?? '');
const canvas = {
  get current() {
    return selected?.canvas;
  },
  get loading() {
    return sketches.loading;
  },
  get error() {
    return sketches.error;
  },
};

/** Every editor change saves through the sketch service (checked again there). */
function save(next: CanvasDocument) {
  return services.save(selectedId, next);
}

async function create() {
  titleError = '';
  const result = await runService(() => services.create({ title }), { success: 'Sketch created' });
  if (result.ok) {
    chosen = result.value.id;
    title = '';
  } else {
    titleError =
      result.error instanceof Error ? result.error.message : 'The sketch was not created.';
  }
}
</script>

<section class="dk-content">
  <div class="mb-7 flex items-start justify-between gap-3">
    <div class="min-w-0">
      <Text size="xs" weight="semibold" tone="primary" tracking="wide">LIBRARY / SKETCHES</Text>
      <Heading level={1} size="xl" class="mt-1">Screen sketches</Heading>
      <Text tone="muted" class="mt-2">
        Wireframe a screen with the kit's parts and pin review notes to them.
        {canSketch
          ? 'Every change saves in this browser. Tab moves between shapes; arrow keys move them.'
          : 'Your role can look at sketches but not change them.'}
      </Text>
    </div>
    <Badge variant="outline" class="shrink-0">{sketches.current?.length ?? 0} sketches</Badge>
  </div>

  {#if sketches.current === undefined}
    <Skeleton class="h-96 w-full" />
  {:else}
    <div class="mb-4 flex flex-wrap items-end gap-4">
      {#if sketches.current.length > 1}
        <Text as="label" size="sm" weight="semibold" class="grid gap-1.5">Sketch<Select bind:value={chosen} items={sketches.current.map((sketch) => ({ value: sketch.id, label: sketch.title }))} /></Text>
      {/if}
      {#if canSketch}
        <form class="flex flex-wrap items-end gap-2" onsubmit={(event) => event.preventDefault()}>
          <Text as="label" size="sm" weight="semibold" class="grid gap-1.5">New sketch title<Input bind:value={title} maxlength={80} placeholder="Checkout screen" /></Text>
          <Button type="submit" loadingLabel="Creating sketch" onclick={() => create()}>New sketch</Button>
          {#if titleError}<Text size="sm" tone="destructive" role="alert">{titleError}</Text>{/if}
        </form>
      {/if}
    </div>
    {#if selected}
      <div class="sketch-surface">
        {#key selectedId}
          <CanvasView query={canvas} label={selected.title} onChange={canSketch ? save : undefined} class="h-full" />
        {/key}
      </div>
    {:else}
      <EmptyState icon={PenLine} title="No sketches yet" description={canSketch ? 'Give your first sketch a title above.' : 'A designer has not drawn a sketch yet.'} />
    {/if}
  {/if}
</section>

<style>
  .sketch-surface {
    height: 70dvh;
    min-height: 24rem;
  }
</style>
