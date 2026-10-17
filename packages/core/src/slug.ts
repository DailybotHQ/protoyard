/**
 * Prototype slugs are folder names under `prototypes/` and URL segments, so
 * they are deliberately strict: lowercase kebab-case, 2–48 characters, no
 * leading/trailing/double dashes and no path separators.
 */
export const SLUG_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
export const SLUG_MIN_LENGTH = 2;
export const SLUG_MAX_LENGTH = 48;

/** Names that would collide with workspace folders, routes or tooling. */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'api',
  'app',
  'apps',
  'assets',
  'artifacts',
  'dist',
  'docs',
  'gallery',
  'index',
  'new',
  'node-modules',
  'packages',
  'prototypes',
  'protoyard',
  'public',
  'src',
  'templates',
]);

export type SlugCheck = { ok: true; slug: string } | { ok: false; reason: string };

export function checkSlug(input: string): SlugCheck {
  const slug = input.trim();
  if (slug.length < SLUG_MIN_LENGTH || slug.length > SLUG_MAX_LENGTH) {
    return {
      ok: false,
      reason: `Slug must be ${SLUG_MIN_LENGTH}-${SLUG_MAX_LENGTH} characters (got ${slug.length}).`,
    };
  }
  if (!SLUG_PATTERN.test(slug)) {
    return {
      ok: false,
      reason:
        'Slug must be lowercase kebab-case: start with a letter, then letters, digits and single dashes (e.g. "my-crm").',
    };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { ok: false, reason: `"${slug}" is reserved. Choose another slug.` };
  }
  return { ok: true, slug };
}

export function isValidSlug(input: string): boolean {
  return checkSlug(input).ok;
}

/** Converts free text ("My CRM v2") into a slug candidate ("my-crm-v2"). */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^[0-9-]+/, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, '');
}
