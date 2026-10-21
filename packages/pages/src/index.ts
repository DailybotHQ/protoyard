/**
 * `@protoyard/pages` — engine for `kind: "page"` and `kind: "doc"` blueprints
 * (ADR-036, ADR-039). Svelte hosts live in `@protoyard/pages-ui`.
 *
 * This scaffold exports only the package identity. Document schemas, limits,
 * TOC builders and form-response services arrive in later PLAN_005 tasks.
 */
export {
  PAGES_PACKAGE,
  PAGES_PACKAGE_VERSION,
  type PagesPackageIdentity,
  PagesPackageIdentitySchema,
} from './version.ts';
