/**
 * `@protoyard/views/files` — a file tree without a framework: children in
 * natural order, breadcrumbs, name and move checks, categories, sizes, and
 * deterministic SVG thumbnails from the id (no network, no blob).
 */
export {
  breadcrumbs,
  categoryOf,
  childrenOf,
  descendantIds,
  extensionOf,
  type FileCategory,
  type FileEntry,
  formatSize,
  moveProblem,
  nameProblem,
  uniqueName,
} from './model.ts';
export { hashId, type ThumbnailOptions, thumbnailSvg, thumbnailUrl } from './thumbnail.ts';
