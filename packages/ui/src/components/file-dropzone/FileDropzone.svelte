<script lang="ts">
import type { FileDropRejection } from '@texuli/primitives/file-drop';
import type { Snippet } from 'svelte';
import { FileUpload } from 'texuli/file-upload';
import { formatBytes } from './accept.ts';
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
  /**
   * Extra content shown above the drop zone. Texuli's FileUpload has no slot
   * inside the zone yet, so it no longer replaces the zone's empty state.
   */
  children?: Snippet;
  class?: string;
  /** @deprecated Texuli's FileUpload styles its own list; this class is ignored. */
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
}: Props = $props();

let idSeq = 0;
/** Texuli's own rejection list, which its FileUpload renders as an inline alert. */
let texuliRejects = $state<FileDropRejection[]>([]);

/** Texuli keys a file by name, size and modification time. */
function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

const hint = $derived.by(() => {
  const parts: string[] = [];
  if (description) parts.push(description);
  if (accept) parts.push(`Accepted: ${accept}`);
  if (maxSize !== undefined) parts.push(`Max size: ${formatBytes(maxSize)}`);
  if (Number.isFinite(maxFiles)) parts.push(`Max files: ${maxFiles}`);
  return parts.join(' · ');
});

const labels = $derived({
  label,
  inputLabel: label,
  browse: browseLabel,
  description: hint,
  rejectType: accept ? `Type not allowed (${accept})` : 'Type not allowed',
  rejectSize: maxSize !== undefined ? `Larger than ${formatBytes(maxSize)}` : 'Too large',
  rejectCount: multiple
    ? `Only ${maxFiles} file${maxFiles === 1 ? '' : 's'} allowed`
    : 'Only one file allowed',
});

// Protoyard's per-file progress and status, keyed the way Texuli keys files.
const progress = $derived(
  Object.fromEntries(files.map((item) => [fileKey(item.file), item.progress]))
);
const status = $derived(
  Object.fromEntries(
    files.map((item): [string, 'pending' | 'uploading' | 'done' | 'error'] => [
      fileKey(item.file),
      item.status === 'ready' ? 'pending' : item.status,
    ])
  )
);

/**
 * Texuli's FileUpload owns the File list; this keeps Protoyard's DropzoneFile
 * list (stable ids, progress, status) in step with it and reports additions
 * and removals, which FileUpload cannot report yet (Texuli gap G8).
 */
function syncFiles(next: File[]): void {
  if (disabled) return;
  const byFile = new Map(files.map((item) => [item.file, item]));
  const kept: DropzoneFile[] = [];
  const added: File[] = [];
  for (const file of next) {
    const existing = byFile.get(file);
    if (existing) {
      kept.push(existing);
      byFile.delete(file);
    } else {
      idSeq += 1;
      kept.push({ id: `dz-${uid}-${idSeq}`, file, progress: null, status: 'ready' });
      added.push(file);
    }
  }
  files = kept;
  for (const removed of byFile.values()) onRemove?.(removed);
  if (added.length > 0) {
    rejects = [];
    onAdd?.(added);
  }
}

function syncRejects(next: FileDropRejection[]): void {
  texuliRejects = next;
  rejects = next.map((rejection) => ({
    name: rejection.file.name,
    reason:
      rejection.reason === 'type'
        ? labels.rejectType
        : rejection.reason === 'size'
          ? labels.rejectSize
          : labels.rejectCount,
  }));
}
</script>

<!--
  A thin adapter over Texuli's FileUpload (`texuli/file-upload`): drop zone,
  keyboard-reachable file input, accept/size/count validation, image previews
  (object URLs, revoked on remove and destroy), per-file progress and inline
  rejection messages are Texuli's.
-->
<div class={className} data-file-dropzone data-disabled={disabled ? 'true' : 'false'}>
  {@render children?.()}
  <FileUpload
    bind:files={() => files.map((item) => item.file), syncFiles}
    bind:rejects={() => texuliRejects, syncRejects}
    {accept}
    {maxSize}
    {maxFiles}
    {multiple}
    {disabled}
    {progress}
    {status}
    {labels}
    aria-invalid={rejects.length > 0 ? 'true' : undefined}
    data-file-dropzone-input=""
  />
</div>
