/**
 * `@protoyard/views-ui/files` — thin FileManager adapter over `@texuli/data/files`.
 */

/** @deprecated Prefer previewOf from Texuli; kept for import stability. */
export {
  FileBrowser,
  FileBrowser as FilePreview,
  type FileBrowserLabels,
  type FileBrowserLayout,
  type FilePreviewModel,
  previewOf,
} from '@texuli/data/files';
export { default as FileManager } from './FileManager.svelte';
