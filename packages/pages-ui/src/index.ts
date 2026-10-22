/**
 * Shared entry: family metadata, BlockHost, and PageApp/DocApp shells.
 * Lazy family subpaths keep print/form chunks out of the initial graph.
 */
export type { PagesPackageIdentity } from '@protoyard/pages';
export { PAGES_PACKAGE, PAGES_PACKAGE_VERSION } from '@protoyard/pages';
export {
  type BlockFamilyRenderer,
  type BlockFamilyRendererProps,
  BlockHost,
  type BlockHostResolution,
  familyLoaders,
  resolvePageBlock,
  UnknownBlock,
} from './block-host/index.ts';
export { DOC_UI_SUBPATH, DocApp, DocHost } from './doc/index.ts';
export { PAGE_UI_FAMILIES, type PageUiFamily } from './families.ts';
export { getFormServices, setFormServices } from './form/context.ts';
export { PAGE_UI_SUBPATH, PageApp, PageHost } from './page/index.ts';
export { PAGES_UI_PACKAGE_NAME, PAGES_UI_PACKAGE_VERSION } from './version.ts';
