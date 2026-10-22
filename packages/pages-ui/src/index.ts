/**
 * Shared entry: family metadata and package identity only. PageApp, DocApp,
 * form UI and print CSS live on their family subpaths so they stay out of
 * initial bundles (ADR-039, PLAN_005 scaffold).
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
export { PAGE_UI_FAMILIES, type PageUiFamily } from './families.ts';
export { PAGES_UI_PACKAGE_NAME, PAGES_UI_PACKAGE_VERSION } from './version.ts';
