<script lang="ts">
import { ImagePlus, X } from '@lucide/svelte';
import { onDestroy } from 'svelte';
import { cn } from '../../lib/cn.ts';
import {
  buildImagePreviews,
  DEFAULT_IMAGE_ACCEPT,
  type ImagePreview,
  revokeImagePreviews,
} from './preview.ts';

/**
 * Labeled local image picker with object-URL previews.
 *
 * Persistence, upload and business validation stay in the caller's service.
 * Previews use `<img>` only for raster types; SVG/HTML are never rendered as
 * markup. Every object URL is revoked when the selection changes or the
 * component unmounts.
 */

interface Props {
  label?: string;
  hint?: string;
  /** Same syntax as `<input accept>`. Defaults to common raster image types. */
  accept?: string;
  multiple?: boolean;
  required?: boolean;
  disabled?: boolean;
  /** Stable id for the file input; auto-generated when omitted. */
  inputId?: string;
  clearLabel?: string;
  addLabel?: string;
  /** Called with the raw `File` list after each pick or clear. */
  onFilesSelected?: (files: File[]) => void;
  class?: string;
}

const uid = $props.id();

let {
  label = 'Photos',
  hint = 'Choose local images. Nothing is uploaded until you save.',
  accept = DEFAULT_IMAGE_ACCEPT,
  multiple = true,
  required = false,
  disabled = false,
  inputId,
  clearLabel = 'Remove images',
  addLabel = 'Add images',
  onFilesSelected,
  class: className = '',
}: Props = $props();

let previews = $state<ImagePreview[]>([]);
let inputEl = $state<HTMLInputElement | null>(null);

const resolvedInputId = $derived(inputId ?? `image-input-${uid}`);
const labelId = $derived(`${resolvedInputId}-label`);
const hintId = $derived(`${resolvedInputId}-hint`);

function revokeCurrent(): void {
  revokeImagePreviews(previews);
}

function handleChange(event: Event): void {
  const input = event.currentTarget as HTMLInputElement;
  revokeCurrent();
  const files = Array.from(input.files ?? []);
  previews = buildImagePreviews(files);
  onFilesSelected?.(files);
}

function clear(): void {
  revokeCurrent();
  previews = [];
  onFilesSelected?.([]);
  if (inputEl) inputEl.value = '';
}

onDestroy(() => {
  revokeCurrent();
});
</script>

<div
  class={cn('grid gap-2', className)}
  data-image-input
  data-disabled={disabled ? 'true' : undefined}
>
  <div class="flex items-center justify-between gap-3">
    <!-- Visible title only — the file input is the single labelled control. -->
    <span id={labelId} class="text-sm font-semibold text-foreground">{label}</span>
    {#if required}
      <span
        class="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
        data-image-input-required
      >
        Required
      </span>
    {/if}
  </div>

  <div class="flex flex-wrap gap-2" data-image-input-previews>
    {#each previews as preview (preview.url)}
      <div
        class="relative size-20 overflow-hidden rounded-lg border border-border bg-muted"
        data-image-input-preview
      >
        <img
          src={preview.url}
          alt={preview.file.name}
          class="size-full object-cover"
          loading="lazy"
          decoding="async"
        />
      </div>
    {/each}

    <label
      for={resolvedInputId}
      class={cn(
        'grid size-20 cursor-pointer place-items-center rounded-lg border border-dashed border-border bg-muted/40 text-muted-foreground transition-colors',
        'hover:border-primary/40 hover:bg-primary/5 hover:text-primary',
        'focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
        disabled && 'pointer-events-none cursor-not-allowed opacity-60'
      )}
      data-image-input-add
      aria-label={addLabel}
    >
      <ImagePlus class="size-7" strokeWidth={1.75} aria-hidden="true" />
      <input
        bind:this={inputEl}
        id={resolvedInputId}
        class="sr-only"
        type="file"
        {accept}
        multiple={multiple || undefined}
        required={required || undefined}
        disabled={disabled || undefined}
        aria-labelledby={labelId}
        aria-describedby={hintId}
        onchange={handleChange}
        data-image-input-control
      />
    </label>
  </div>

  {#if previews.length > 0}
    <button
      type="button"
      class="inline-flex w-fit items-center gap-1 text-sm font-medium text-primary underline-offset-2 hover:underline disabled:pointer-events-none disabled:opacity-60"
      onclick={clear}
      disabled={disabled || undefined}
      data-image-input-clear
    >
      <X class="size-3.5" aria-hidden="true" />
      {clearLabel}
    </button>
  {/if}

  <p id={hintId} class="m-0 text-sm text-muted-foreground">{hint}</p>
</div>
