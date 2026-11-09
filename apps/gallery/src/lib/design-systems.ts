import type { BoundPrototype, DesignSystemEntry } from './types';

/**
 * What the /design-systems/ page shows per design system (ADR-047). Pure,
 * so it is tested without Astro. Paths are root-relative; the page adds the
 * base path.
 */

export interface ListedPrototype {
  slug: string;
  name: string;
}

export interface BoundPrototypeLink extends BoundPrototype {
  /** `/p/<slug>/` when the gallery lists the prototype, else null (hidden or not indexed). */
  href: string | null;
}

export interface DesignSystemCard {
  designSystem: DesignSystemEntry;
  /** The kit prototype (`<id>-kit`) when one is listed; null until a kit exists. */
  kit: { slug: string; name: string; href: string } | null;
  bound: BoundPrototypeLink[];
  locked: number;
  /** The prototype browser filtered to this design system, when any listed prototype uses it. */
  filterHref: string | null;
}

/** The kit prototype slug convention: `<design-system id>-kit`. */
export function kitSlug(id: string): string {
  return `${id}-kit`;
}

export function designSystemCards(
  designSystems: readonly DesignSystemEntry[],
  prototypes: readonly ListedPrototype[]
): DesignSystemCard[] {
  const listed = new Map(prototypes.map((p) => [p.slug, p]));
  return designSystems.map((designSystem) => {
    const kit = listed.get(kitSlug(designSystem.id));
    const bound = designSystem.boundPrototypes.map((p) => ({
      ...p,
      href: listed.has(p.slug) ? `/p/${p.slug}/` : null,
    }));
    return {
      designSystem,
      kit: kit ? { slug: kit.slug, name: kit.name, href: `/p/${kit.slug}/` } : null,
      bound,
      locked: bound.filter((p) => p.locked).length,
      filterHref: bound.some((p) => p.href)
        ? `/?ds=${encodeURIComponent(designSystem.id)}#browse`
        : null,
    };
  });
}

/** One line about the approval, for people. */
export function approvalLine(designSystem: DesignSystemEntry): string {
  if (designSystem.status !== 'approved') {
    return designSystem.layout === 'flat'
      ? 'Draft: a flat document, which cannot be approved until it is migrated to a folder.'
      : 'Draft: not approved yet.';
  }
  const by = designSystem.approvedBy ? ` by ${designSystem.approvedBy}` : '';
  const on = designSystem.approvedAt ? ` on ${designSystem.approvedAt.slice(0, 10)}` : '';
  const version =
    designSystem.approvedVersion && designSystem.approvedVersion !== designSystem.version
      ? ` (version ${designSystem.approvedVersion}; the document is now ${designSystem.version})`
      : '';
  return `Approved${by}${on}${version}.`;
}
