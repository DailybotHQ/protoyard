/**
 * `@protoyard/pages` — engine for `kind: "page"` and `kind: "doc"` blueprints
 * (ADR-036, ADR-039). Svelte hosts live in `@protoyard/pages-ui`.
 *
 * `docToTexuliDocument` and `texuliDocumentToDoc` bridge a doc body and a
 * `@texuli/document` document: the editor, reader tools and the DOCX, PDF
 * and Markdown writers work on Texuli's model, the blueprint stays the
 * stored format.
 *
 * Document schemas validate the payload bodies after KINDS parses the kind
 * union. Limits are published for the untrusted loader (KINDS wires them).
 * TOC builders are pure (no DOM) so deep links work before paint.
 */

export { DOC_CAPABILITIES } from './doc-capabilities.ts';
export {
  FORM_RESPONSE_LIMITS,
  FORM_RESPONSES_STORE_STRING,
  FORM_RESPONSES_TABLE,
  type FormResponse,
  FormResponseSchema,
  type FormResponseValue,
  FormResponseValueSchema,
  PAGE_FEATURE_STORE_STRINGS,
  PAGE_FEATURE_TABLES,
} from './form-response.ts';
export {
  type CreateFormServicesOptions,
  createFormServices,
  FORM_CAPABILITIES,
  type FormServices,
} from './form-services.ts';
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
  DocConversionError,
  type DocConversionMode,
  type DocConversionNote,
  type DocToTexuliOptions,
  type DocToTexuliResult,
  docToTexuliDocument,
  HOST_BLOCK_REF_PREFIX,
  hostBlockTitle,
  type TexuliToDocResult,
  texuliDocumentToDoc,
} from './texuli-document.ts';
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
