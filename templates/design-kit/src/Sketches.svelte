<script lang="ts">
import { can, getRuntime, liveQuery, runService } from '@protoyard/renderer-svelte';
import { Button, Input, Select, Skeleton } from '@protoyard/ui';
import { type CanvasDocument, CanvasView } from '@protoyard/views-ui/canvas';
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

<section class="content sketches-content">
  <div class="page-heading">
    <div>
      <p class="eyebrow">LIBRARY / SKETCHES</p>
      <h1>Screen sketches</h1>
      <p class="lede">
        Wireframe a screen with the kit's parts and pin review notes to them.
        {canSketch
          ? 'Every change saves in this browser. Tab moves between shapes; arrow keys move them.'
          : 'Your role can look at sketches but not change them.'}
      </p>
    </div>
    <span class="version-pill">{sketches.current?.length ?? 0} sketches</span>
  </div>

  {#if sketches.current === undefined}
    <Skeleton class="h-96 w-full" />
  {:else}
    <div class="sketch-toolbar">
      {#if sketches.current.length > 1}
        <label>Sketch<Select bind:value={chosen} items={sketches.current.map((sketch) => ({ value: sketch.id, label: sketch.title }))} /></label>
      {/if}
      {#if canSketch}
        <form class="sketch-create" onsubmit={(event) => event.preventDefault()}>
          <label>New sketch title<Input bind:value={title} maxlength={80} placeholder="Checkout screen" /></label>
          <Button type="submit" loadingLabel="Creating sketch" onclick={() => create()}>New sketch</Button>
          {#if titleError}<p class="error" role="alert">{titleError}</p>{/if}
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
      <div class="empty-search"><span>✎</span><h2>No sketches yet</h2><p>{canSketch ? 'Give your first sketch a title above.' : 'A designer has not drawn a sketch yet.'}</p></div>
    {/if}
  {/if}
</section>

<style>
  .sketch-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 16px;
    margin-bottom: 16px;
  }
  .sketch-toolbar label {
    display: grid;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
  }
  .sketch-create {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 8px;
  }
  .sketch-surface {
    height: 70dvh;
    min-height: 24rem;
  }
</style>
