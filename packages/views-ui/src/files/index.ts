/**
 * `@protoyard/views-ui/files` — thin FileManager adapter over
 * `@texuli/data/files`, plus `FilePreview`: a gallery with a lightbox that
 * previews images, PDFs, text, video and audio by type.
 */

export {
  FileBrowser,
  type FileBrowserLabels,
  type FileBrowserLayout,
  type FilePreviewModel,
  previewOf,
} from '@texuli/data/files';
export { default as FileManager } from './FileManager.svelte';
export { default as FilePreview } from './FilePreview.svelte';
export {
  clipPreviewText,
  type FilePreviewKind,
  MAX_PREVIEW_TEXT,
  previewKind,
  safePreviewSrc,
} from './preview.ts';
