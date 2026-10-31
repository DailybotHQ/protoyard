<script lang="ts">
import type { FileDropRejection } from '@texuli/primitives/file-drop';
import type { Snippet } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';
import { FileUpload } from 'texuli/file-upload';
import { formatBytes } from './accept.ts';
import type { DropzoneFile, DropzoneReject } from './types.ts';

interface OwnProps {
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
  /** Id of the file input, so a `<label for>` or a FormField names the focusable control. */
  id?: string;
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
  /** The rendered root element (bindable). */
  ref?: HTMLElement | null;
}

/**
 * Extra attributes go to Texuli's FileUpload inside the root: `aria-*`,
 * `data-*`, `onfocus` and `onblur` reach the file input (the focusable
 * control), handlers and other attributes its wrapper, after its own handling.
 */
type Props = OwnProps & Omit<HTMLAttributes<HTMLDivElement>, keyof OwnProps>;

const uid = $props.id();

let {
  accept,
  maxSize,
  maxFiles = Number.POSITIVE_INFINITY,
  multiple = true,
  disabled = false,
  files = $bindable<DropzoneFile[]>([]),
  rejects = $bindable<DropzoneReject[]>([]),
  id,
  label = 'Upload files',
  description,
  browseLabel = 'Browse files',
  onAdd,
  onRemove,
  children,
  class: className,
  listClass: _listClass,
  ref = $bindable(null),
  ...rest
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

/** Every listed file's Protoyard entry (stable id, progress, status), kept across list changes. */
const entries = new WeakMap<File, DropzoneFile>();

function entryFor(file: File): DropzoneFile {
  const known = files.find((item) => item.file === file) ?? entries.get(file);
  if (known) return known;
  idSeq += 1;
  const entry: DropzoneFile = { id: `dz-${uid}-${idSeq}`, file, progress: null, status: 'ready' };
  entries.set(file, entry);
  return entry;
}

/** Texuli's FileUpload owns the File list; Protoyard's list follows it with stable entries. */
function syncFiles(next: File[]): void {
  if (disabled) return;
  // Remember the current entries (host-set ones too): Texuli reports a removal after the list changed.
  for (const item of files) entries.set(item.file, item);
  files = next.map(entryFor);
}

function handleAdd(added: File[]): void {
  rejects = [];
  onAdd?.(added);
}

function handleRemove(file: File): void {
  onRemove?.(entryFor(file));
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
<div bind:this={ref} class={className} data-file-dropzone data-disabled={disabled ? 'true' : 'false'}>
  {@render children?.()}
  <FileUpload
    {...rest}
    bind:files={() => files.map((item) => item.file), syncFiles}
    bind:rejects={() => texuliRejects, syncRejects}
    {accept}
    {maxSize}
    {maxFiles}
    {multiple}
    {disabled}
    {...id ? { id } : {}}
    {progress}
    {status}
    {labels}
    onFilesAdd={handleAdd}
    onFileRemove={handleRemove}
    aria-invalid={rejects.length > 0 ? 'true' : rest['aria-invalid']}
    data-file-dropzone-input=""
  />
</div>
