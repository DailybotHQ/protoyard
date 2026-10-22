/**
 * `@protoyard/pages` — engine for `kind: "page"` and `kind: "doc"` blueprints
 * (ADR-036, ADR-039). Svelte hosts live in `@protoyard/pages-ui`.
 *
 * Document schemas validate the payload bodies after KINDS parses the kind
 * union. Limits, TOC builders and form-response services arrive in later tasks.
 */

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
  PAGES_PACKAGE,
  PAGES_PACKAGE_VERSION,
  type PagesPackageIdentity,
  PagesPackageIdentitySchema,
} from './version.ts';
