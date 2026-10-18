/** Parts of a prototype that morph from its gallery card into its detail page. */
export type TransitionPart = 'icon' | 'title';

/**
 * `view-transition-name` shared by a prototype's card and its detail page.
 * Slugs are kebab-case already; anything else is replaced so the result is
 * always a valid CSS identifier (the `py-` prefix keeps it from starting
 * with a digit). Names must be unique per page, so only prototype cards get
 * them (templates can appear twice on the home page).
 */
export function transitionName(part: TransitionPart, slug: string): string {
  const safe = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return `py-${part}-${safe}`;
}
