<script lang="ts">
import { Button } from '@protoyard/ui';
import type { Ring } from '@protoyard/views/map';
import { ringProblem } from './model.ts';

/**
 * The keyboard way to edit a fence: one row per corner with latitude and
 * longitude, add and remove corners, then Save (through the prototype's
 * service) or Reset. The map's vertex handles edit the same draft.
 */
let {
  name,
  ring = $bindable(),
  dirty,
  onSave,
  onReset,
}: {
  name: string;
  ring: [number, number][];
  dirty: boolean;
  onSave: () => Promise<unknown>;
  onReset: () => void;
} = $props();

const problem = $derived(ringProblem(ring as Ring));

function set(index: number, axis: 0 | 1, text: string) {
  const value = Number(text);
  ring = ring.map((corner, i) => {
    if (i !== index) return corner;
    const next: [number, number] = [corner[0], corner[1]];
    next[axis] = Number.isFinite(value) ? value : Number.NaN;
    return next;
  });
}

function addAfter(index: number) {
  const a = ring[index] as [number, number];
  const b = ring[(index + 1) % ring.length] as [number, number];
  const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  ring = [...ring.slice(0, index + 1), mid, ...ring.slice(index + 1)];
}

function remove(index: number) {
  ring = ring.filter((_, i) => i !== index);
}
</script>

<section class="grid gap-2 border-t border-border p-3 text-sm" aria-label={`Corners of ${name}`} data-fence-editor>
  <h3 class="font-medium">Edit {name}</h3>
  <ol class="grid gap-1.5">
    {#each ring as corner, i (i)}
      <li class="flex flex-wrap items-center gap-2" data-corner={i}>
        <span class="w-16 text-muted-foreground">Corner {i + 1}</span>
          <input
            type="number"
            step="0.0001"
            class="w-28 rounded-md border border-input bg-background px-2 py-1"
            value={Number.isFinite(corner[1]) ? corner[1] : ''}
            aria-label={`Corner ${i + 1} latitude`}
            oninput={(e) => set(i, 1, (e.currentTarget as HTMLInputElement).value)}
          />
          <input
            type="number"
            step="0.0001"
            class="w-28 rounded-md border border-input bg-background px-2 py-1"
            value={Number.isFinite(corner[0]) ? corner[0] : ''}
            aria-label={`Corner ${i + 1} longitude`}
            oninput={(e) => set(i, 0, (e.currentTarget as HTMLInputElement).value)}
          />
        <Button variant="ghost" size="sm" onclick={() => addAfter(i)} aria-label={`Add a corner after corner ${i + 1}`}>Add</Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={ring.length <= 3}
          onclick={() => remove(i)}
          aria-label={`Remove corner ${i + 1}`}>Remove</Button
        >
      </li>
    {/each}
  </ol>
  {#if problem}<p class="text-destructive" role="alert">{problem}</p>{/if}
  <div class="flex gap-2">
    <Button size="sm" disabled={!dirty || problem !== null} onclick={() => onSave()}>Save fence</Button>
    <Button size="sm" variant="outline" disabled={!dirty} onclick={onReset}>Reset</Button>
  </div>
</section>
