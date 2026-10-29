<script lang="ts">
import { onDestroy } from 'svelte';
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

interface Props {
  label?: string;
  hint?: string;
  /** Same syntax as `<input accept>`. Defaults to common raster image types. */
  accept?: string;
  multiple?: boolean;
  required?: boolean;
  disabled?: boolean;
  /**
   * @deprecated Texuli's FileUpload sets its own input id (Texuli gap N16);
   * this value names the component's wrapper instead.
   */
  inputId?: string;
  clearLabel?: string;
  /** The browse control's text. */
  addLabel?: string;
  /** Called with the whole selection (raw `File` objects) after each pick, removal or clear. */
  onFilesSelected?: (files: File[]) => void;
  class?: string;
}

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
  id={inputId}
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
    bind:files={() => files, setFiles}
    {accept}
    {multiple}
    {required}
    {disabled}
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
