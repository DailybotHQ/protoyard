/**
 * `@protoyard/views-ui/files` — `FileManager` (folder tree, breadcrumbs,
 * grid or list with multi-select and roving focus, rename, move, delete, new
 * folder, upload and a preview lightbox) and `FilePreview`, on the
 * `@protoyard/views/files` engine. Import this subpath only from a lazy route
 * screen; it shares the tree view's chunk.
 */

/** Texuli file browser (entries array API). Prefer FileManager host adapter for liveQuery and mutations. */
export {
  FileBrowser,
  type FileBrowserLabels,
  type FileBrowserLayout,
} from '@texuli/data/files';
export { default as FileManager } from './FileManager.svelte';
export { default as FilePreview } from './FilePreview.svelte';
