/**
 * `@protoyard/views/files` — thin re-export of `@texuli/data/files/engine`
 * (tree, breadcrumbs, names, deterministic thumbnails).
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
  hashId,
  moveProblem,
  nameProblem,
  type ThumbnailOptions,
  thumbnailSvg,
  thumbnailUrl,
  uniqueName,
} from '@texuli/data/files/engine';
