import { z } from 'zod';

/**
 * Package identity for `@protoyard/pages`. Later tasks grow this package into
 * page/doc document schemas, limits, TOC helpers and form-response services
 * (ADR-039). The scaffold exports only the identity so typecheck and workspace
 * resolution work before those modules land.
 */
export const PagesPackageIdentitySchema = z
  .strictObject({
    name: z.literal('@protoyard/pages'),
    version: z.string().min(1),
  })
  .readonly();

export type PagesPackageIdentity = z.infer<typeof PagesPackageIdentitySchema>;

/** Current package name and version (matches package.json). */
export const PAGES_PACKAGE: PagesPackageIdentity = PagesPackageIdentitySchema.parse({
  name: '@protoyard/pages',
  version: '1.0.0',
});

/** Convenience alias for the package version string. */
export const PAGES_PACKAGE_VERSION: string = PAGES_PACKAGE.version;
