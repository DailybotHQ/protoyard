<script lang="ts">
import { FileUp, X } from '@lucide/svelte';
import type { Snippet } from 'svelte';
import { onDestroy } from 'svelte';
import { Progress } from 'texuli/feedback';
import { cn } from '../../lib/cn.ts';
import { formatBytes, validateFiles } from './accept.ts';
import type { DropzoneFile, DropzoneReject } from './types.ts';

interface Props {
  /** Same syntax as `<input accept>` (e.g. `image/*,.pdf`). */
  accept?: string;
  /** Max bytes per file. */
  maxSize?: number;
  /** Max files kept at once (with `multiple`). */
  maxFiles?: number;
  multiple?: boolean;
  disabled?: boolean;
  /** Selected files (bindable). Emits real `File` objects; never file HTML. */
  files?: DropzoneFile[];
  /** Last batch of rejected files (bindable, cleared on the next successful pick). */
  rejects?: DropzoneReject[];
  label?: string;
  description?: string;
  browseLabel?: string;
  /** Called with newly accepted File objects after they are added. */
  onAdd?: (files: File[]) => void;
  /** Called when a listed file is removed. */
  onRemove?: (item: DropzoneFile) => void;
  /** Optional custom empty-state content inside the drop target. */
  children?: Snippet;
  class?: string;
  listClass?: string;
}

const uid = $props.id();

let {
  accept,
  maxSize,
  maxFiles = Number.POSITIVE_INFINITY,
  multiple = true,
  disabled = false,
  files = $bindable<DropzoneFile[]>([]),
  rejects = $bindable<DropzoneReject[]>([]),
  label = 'Upload files',
  description,
  browseLabel = 'Browse files',
  onAdd,
  onRemove,
  children,
  class: className,
  listClass,
}: Props = $props();

let inputEl = $state<HTMLInputElement | null>(null);
let dragging = $state(false);
let idSeq = 0;

const inputId = `file-dropzone-${uid}`;
const errorId = `file-dropzone-errors-${uid}`;

const hint = $derived.by(() => {
  const parts: string[] = [];
  if (description) parts.push(description);
  if (accept) parts.push(`Accepted: ${accept}`);
  if (maxSize !== undefined) parts.push(`Max size: ${formatBytes(maxSize)}`);
  if (Number.isFinite(maxFiles)) {
    parts.push(`Max files: ${maxFiles}`);
  }
  return parts.join(' · ');
});

const describedBy = $derived(
  [hint ? `${inputId}-hint` : null, rejects.length > 0 ? errorId : null]
    .filter((id): id is string => Boolean(id))
    .join(' ') || undefined
);

function revokePreview(item: DropzoneFile): void {
  if (item.previewUrl) {
    URL.revokeObjectURL(item.previewUrl);
  }
}

function revokeAll(): void {
  for (const item of files) revokePreview(item);
}

onDestroy(() => {
  revokeAll();
});

function toDropzoneFile(file: File): DropzoneFile {
  idSeq += 1;
  const item: DropzoneFile = {
    id: `dz-${uid}-${idSeq}`,
    file,
    progress: null,
    status: 'ready',
  };
  // Previews only for image/* via object URLs — never read contents as HTML.
  if (file.type.startsWith('image/')) {
    item.previewUrl = URL.createObjectURL(file);
  }
  return item;
}

function ingest(list: Iterable<File>): void {
  if (disabled) return;
  const { accepted, rejects: nextRejects } = validateFiles(list, {
    accept,
    maxSize,
    maxFiles,
    currentCount: files.length,
    multiple,
  });
  rejects = nextRejects;
  if (accepted.length === 0) return;

  const added = accepted.map(toDropzoneFile);
  files = multiple ? [...files, ...added] : added.slice(0, 1);
  onAdd?.(accepted);
}

function onInputChange(event: Event): void {
  const input = event.currentTarget as HTMLInputElement;
  const list = input.files ? Array.from(input.files) : [];
  // Allow selecting the same file again after remove.
  input.value = '';
  ingest(list);
}

function openPicker(): void {
  if (disabled) return;
  inputEl?.click();
}

function removeItem(item: DropzoneFile): void {
  revokePreview(item);
  files = files.filter((entry) => entry.id !== item.id);
  onRemove?.(item);
}

function onDragEnter(event: DragEvent): void {
  event.preventDefault();
  if (disabled) return;
  dragging = true;
}

function onDragOver(event: DragEvent): void {
  event.preventDefault();
  if (disabled) return;
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  dragging = true;
}

function onDragLeave(event: DragEvent): void {
  event.preventDefault();
  const current = event.currentTarget as HTMLElement;
  const related = event.relatedTarget as Node | null;
  if (related && current.contains(related)) return;
  dragging = false;
}

function onDrop(event: DragEvent): void {
  event.preventDefault();
  dragging = false;
  if (disabled) return;
  const list = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : [];
  ingest(list);
}

function onZoneKeydown(event: KeyboardEvent): void {
  if (disabled) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    openPicker();
  }
}
</script>

<div
  class={cn('grid gap-3', className)}
  data-file-dropzone
  data-disabled={disabled ? 'true' : 'false'}
>
  <input
    bind:this={inputEl}
    id={inputId}
    type="file"
    class="sr-only"
    {accept}
    multiple={multiple || undefined}
    disabled={disabled || undefined}
    aria-label={label}
    aria-describedby={describedBy}
    aria-invalid={rejects.length > 0 ? 'true' : undefined}
    onchange={onInputChange}
    data-file-dropzone-input
  />

  <!-- Drop target; the primary control remains the labelled file input. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    role="group"
    aria-label={label}
    class={cn(
      'relative flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center transition-colors',
      dragging && 'border-primary bg-primary/5',
      disabled && 'cursor-not-allowed opacity-60',
      !disabled && 'hover:border-muted-foreground/40 hover:bg-muted/50'
    )}
    data-file-dropzone-zone
    data-dragging={dragging ? 'true' : 'false'}
    ondragenter={onDragEnter}
    ondragover={onDragOver}
    ondragleave={onDragLeave}
    ondrop={onDrop}
  >
    {#if children}
      {@render children()}
    {:else}
      <div
        class="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
        aria-hidden="true"
      >
        <FileUp class="size-6" />
      </div>
      <div class="grid max-w-sm gap-1">
        <p class="font-heading text-sm font-semibold text-foreground">{label}</p>
        {#if hint}
          <p id={`${inputId}-hint`} class="text-xs text-muted-foreground">{hint}</p>
        {/if}
      </div>
    {/if}

    <label
      for={inputId}
      class={cn(
        'inline-flex h-9 cursor-pointer items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-within:ring-2 focus-within:ring-ring',
        disabled && 'pointer-events-none'
      )}
    >
      {browseLabel}
    </label>

    <!-- Keyboard activation of the zone also opens the picker. -->
    <button
      type="button"
      class="sr-only"
      disabled={disabled || undefined}
      onclick={openPicker}
      onkeydown={onZoneKeydown}
      data-file-dropzone-keyboard
    >
      {browseLabel}
    </button>
  </div>

  {#if rejects.length > 0}
    <ul
      id={errorId}
      class="grid gap-1 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
      role="alert"
      data-file-dropzone-errors
    >
      {#each rejects as reject (reject.name + reject.reason)}
        <li>
          <span class="font-medium">{reject.name}</span>
          — {reject.reason}
        </li>
      {/each}
    </ul>
  {/if}

  {#if files.length > 0}
    <ul class={cn('grid gap-2', listClass)} data-file-dropzone-list>
      {#each files as item (item.id)}
        <li
          class="flex items-start gap-3 rounded-lg border border-border bg-surface px-3 py-2"
          data-file-id={item.id}
          data-file-status={item.status}
        >
          {#if item.previewUrl}
            <img
              src={item.previewUrl}
              alt=""
              class="size-12 shrink-0 rounded-md object-cover"
              data-file-preview
            />
          {:else}
            <div
              class="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground"
              aria-hidden="true"
            >
              FILE
            </div>
          {/if}
          <div class="min-w-0 flex-1 grid gap-1">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-foreground">{item.file.name}</p>
                <p class="text-xs text-muted-foreground">{formatBytes(item.file.size)}</p>
              </div>
              <button
                type="button"
                class="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-label={`Remove ${item.file.name}`}
                disabled={disabled || undefined}
                onclick={() => removeItem(item)}
                data-file-remove
              >
                <X class="size-4" aria-hidden="true" />
              </button>
            </div>
            {#if item.status === 'uploading' || item.progress !== null}
              <Progress
                value={item.progress}
                size="sm"
                ariaLabel={`Upload progress for ${item.file.name}`}
              />
            {/if}
            {#if item.error}
              <p class="text-xs text-destructive">{item.error}</p>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>
