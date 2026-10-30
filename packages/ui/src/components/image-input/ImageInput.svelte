<script lang="ts">
import { onDestroy } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';
import { Badge } from 'texuli/badge';
import { Button } from 'texuli/button';
import { cx } from 'texuli/cx';
import { FileUpload } from 'texuli/file-upload';
import { Icon } from 'texuli/icons';
import {
  buildImagePreviews,
  DEFAULT_IMAGE_ACCEPT,
  type ImagePreview,
  revokeImagePreviews,
} from './preview.ts';

/**
 * Labeled local image picker with object-URL previews, on Texuli's
 * `FileUpload` (`texuli/file-upload`): the drop zone, the keyboard-reachable
 * file input and the selected list with per-file remove are Texuli's.
 *
 * Persistence, upload and business validation stay in the caller's service.
 * The previews are this component's: `<img>` only for raster types, so SVG and
 * HTML are never rendered (Texuli's own previews are off). Every object URL is
 * revoked when the selection changes or the component unmounts.
 */

interface OwnProps {
  label?: string;
  hint?: string;
  /** Same syntax as `<input accept>`. Defaults to common raster image types. */
  accept?: string;
  multiple?: boolean;
  required?: boolean;
  disabled?: boolean;
  /** Id of the file input, so a `<label for>` or a FormField names the focusable control. */
  inputId?: string;
  clearLabel?: string;
  /** The browse control's text. */
  addLabel?: string;
  /** Called with the whole selection (raw `File` objects) after each pick, removal or clear. */
  onFilesSelected?: (files: File[]) => void;
  class?: string;
  /** The rendered root element (bindable). */
  ref?: HTMLElement | null;
}

/**
 * Extra attributes go to Texuli's FileUpload inside the root: `aria-*`,
 * `data-*`, `onfocus` and `onblur` reach the file input (the focusable
 * control), handlers and other attributes its wrapper, after its own handling.
 */
type Props = OwnProps & Omit<HTMLAttributes<HTMLDivElement>, keyof OwnProps | 'children'>;

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
  ref = $bindable(null),
  ...rest
}: Props = $props();

// A plain record keeps the spread onto Texuli's FileUpload a finite type.
const forwarded = $derived(rest as Record<string, unknown>);

let files = $state<File[]>([]);
let previews = $state<ImagePreview[]>([]);

const labels = $derived({ label, inputLabel: label, browse: addLabel, description: hint });

function setFiles(next: File[]): void {
  revokeImagePreviews(previews);
  files = next;
  previews = buildImagePreviews(next);
  onFilesSelected?.(next);
}

onDestroy(() => {
  revokeImagePreviews(previews);
});
</script>

<div
  bind:this={ref}
  class={cx('grid gap-2', className)}
  data-image-input
  data-disabled={disabled ? 'true' : undefined}
>
  {#if required}
    <Badge variant="info" class="w-fit" data-image-input-required>Required</Badge>
  {/if}

  {#if previews.length > 0}
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
    </div>
  {/if}

  <FileUpload
    {...forwarded}
    bind:files={() => files, setFiles}
    {accept}
    {multiple}
    {required}
    {disabled}
    {...inputId ? { inputId } : {}}
    variant="compact"
    showPreviews={false}
    {labels}
    data-image-input-control=""
  />

  {#if files.length > 0}
    <Button
      variant="link"
      size="sm"
      class="w-fit"
      {disabled}
      onclick={() => setFiles([])}
      data-image-input-clear=""
    >
      <Icon icon="close" size="sm" aria-hidden="true" />
      {clearLabel}
    </Button>
  {/if}
</div>
