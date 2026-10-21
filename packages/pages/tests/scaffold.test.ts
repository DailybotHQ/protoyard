import { describe, expect, it } from 'vitest';
import { PAGES_PACKAGE, PAGES_PACKAGE_VERSION, PagesPackageIdentitySchema } from '../src/index.ts';

describe('@protoyard/pages scaffold', () => {
  it('exports a parsed package identity matching package.json', () => {
    expect(PAGES_PACKAGE).toEqual({ name: '@protoyard/pages', version: '1.0.0' });
    expect(PAGES_PACKAGE_VERSION).toBe('1.0.0');
    expect(PagesPackageIdentitySchema.parse(PAGES_PACKAGE)).toEqual(PAGES_PACKAGE);
  });

  it('rejects an identity with the wrong package name', () => {
    const result = PagesPackageIdentitySchema.safeParse({
      name: '@protoyard/decks',
      version: '1.0.0',
    });
    expect(result.success).toBe(false);
  });
});
