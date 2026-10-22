/**
 * `@protoyard/pages` — engine for `kind: "page"` and `kind: "doc"` blueprints
 * (ADR-036, ADR-039). Svelte hosts live in `@protoyard/pages-ui`.
 *
 * Document schemas validate the payload bodies after KINDS parses the kind
 * union. Limits are published for the untrusted loader (KINDS wires them).
 * union. TOC builders are pure (no DOM) so deep links work before paint.
 */

export {
  checkDocDocumentLimits,
  checkFormResponseLimits,
  checkPageDocumentLimits,
  DOC_LIMITS,
  type DocLimits,
  type DocumentLimitIssue,
  type DocumentLimitResult,
  jsonDepth,
  PAGE_LIMITS,
  type PageLimits,
  UNTRUSTED_PAGE_DOC_HINT,
} from './limits.ts';
export {
  type DocDocument,
  DocDocumentSchema,
  type DocPrint,
  DocPrintSchema,
  type DocToc,
  DocTocSchema,
  type DocumentMeta,
  DocumentMetaSchema,
  type DocumentParseResult,
  PAGE_DOCUMENT_LIMITS,
  type PageDocument,
  PageDocumentSchema,
  type PageFormRef,
  PageFormRefSchema,
  type PageNavItem,
  PageNavItemSchema,
  type PageSection,
  PageSectionSchema,
  safeParseDocDocument,
  safeParsePageDocument,
} from './schema.ts';
export {
  allocateHeadingId,
  type BuildDocTocOptions,
  type BuildPageTocOptions,
  buildDocToc,
  buildPageToc,
  type DocTocItem,
  headingId,
} from './toc.ts';
export {
  PAGES_PACKAGE,
  PAGES_PACKAGE_VERSION,
  type PagesPackageIdentity,
  PagesPackageIdentitySchema,
} from './version.ts';
