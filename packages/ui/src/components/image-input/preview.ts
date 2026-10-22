/**
 * Local image preview helpers for {@link ImageInput}.
 *
 * Object URLs are created only for raster image MIME types. SVG and HTML are
 * never turned into markup; SVG is also refused as a preview source so a
 * selected file cannot inject scripted content through an `<img>`.
 */

/** Raster types safe to show via `URL.createObjectURL` + `<img>`. */
export const RASTER_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
] as const;

const RASTER_SET = new Set<string>(RASTER_IMAGE_TYPES);

/** Default `accept` for the file input: common raster images only. */
export const DEFAULT_IMAGE_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,image/avif';

/**
 * True when the browser reports a raster image type that is safe to preview
 * as an `<img src>` object URL. SVG (`image/svg+xml`), HTML and unknown types
 * return false.
 */
export function isPreviewableImage(file: Pick<File, 'type' | 'name'>): boolean {
  const type = file.type.trim().toLowerCase();
  if (type === 'image/svg+xml' || type === 'image/svg') return false;
  if (type.startsWith('text/') || type.includes('html')) return false;
  if (RASTER_SET.has(type)) return true;
  // Some browsers leave type empty; allow common extensions only.
  if (!type) {
    return /\.(jpe?g|png|gif|webp|avif|bmp)$/i.test(file.name);
  }
  return false;
}

export interface ImagePreview {
  file: File;
  /** Object URL owned by the component; must be revoked when replaced. */
  url: string;
}

/**
 * Build preview entries for the files that are safe to show. Callers still
 * receive every selected `File` through `onFilesSelected`; only the preview
 * list is filtered.
 */
export function buildImagePreviews(
  files: readonly File[],
  createObjectURL: (file: Blob) => string = (file) => URL.createObjectURL(file)
): ImagePreview[] {
  const previews: ImagePreview[] = [];
  for (const file of files) {
    if (!isPreviewableImage(file)) continue;
    previews.push({ file, url: createObjectURL(file) });
  }
  return previews;
}

/** Revoke every object URL in the list. Safe to call more than once. */
export function revokeImagePreviews(previews: readonly ImagePreview[]): void {
  for (const preview of previews) {
    URL.revokeObjectURL(preview.url);
  }
}
