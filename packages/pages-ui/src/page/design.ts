import type { Block, CardsBlock, HeadingBlock, StatBlock, StepsBlock } from '@protoyard/blocks';
import type { PageDocument, PageNavItem, PageSection } from '@protoyard/pages';

/**
 * Marketing design decisions for a landing page, as pure functions over the
 * validated PageDocument. PageHost asks these which layout each section gets
 * (hero, stat row, pricing columns, steps, pull quote, closing band), and the
 * navigation labels. Everything here reads data only; nothing renders HTML.
 */

/** How PageHost lays out a section. */
export type PageSectionDesign = 'hero' | 'band' | 'footer' | 'body';

/** The id a section is reached by (`#anchor`). */
export function sectionAnchor(section: PageSection): string {
  return section.anchor ?? section.id;
}

/** `how-it-works` → `How it works`. */
export function humanizeId(id: string): string {
  const words = id.split(/[-_]+/).filter(Boolean).join(' ');
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : id;
}

/** The heading block a section opens with, if any. */
export function leadingHeading(section: PageSection): HeadingBlock | null {
  const first = section.blocks[0];
  return first?.type === 'heading' ? first : null;
}

/** The section's own label: its title, then its opening heading, else null. */
export function sectionLabel(section: PageSection): string | null {
  const title = section.title?.trim();
  if (title) return title;
  const heading = leadingHeading(section)?.text.trim();
  return heading || null;
}

const PRICING_ID = /(^|-)(plans?|pricing|prices|tiers?)($|-)/;
const BAND_BLOCKS = new Set<Block['type']>(['cta', 'callout', 'text', 'heading']);

function isHeroSection(section: PageSection, index: number): boolean {
  if (section.role === 'hero') return true;
  // A page that opens with its level-1 title opens with its hero.
  return index === 0 && section.role === undefined && leadingHeading(section)?.level === 1;
}

function isBandSection(section: PageSection, index: number, count: number): boolean {
  if (section.role === 'cta') return true;
  if (section.role !== undefined || index !== count - 1 || index === 0) return false;
  // A closing section made of a call to action and short copy reads as a band.
  return (
    section.blocks.some((block) => block.type === 'cta') &&
    section.blocks.every((block) => BAND_BLOCKS.has(block.type))
  );
}

/** The layout of every section, in page order. */
export function sectionDesigns(page: Pick<PageDocument, 'sections'>): PageSectionDesign[] {
  const count = page.sections.length;
  const hasHero = page.sections.some((section) => section.role === 'hero');
  return page.sections.map((section, index) => {
    if (section.role === 'footer') return 'footer';
    if (hasHero ? section.role === 'hero' : isHeroSection(section, index)) return 'hero';
    if (isBandSection(section, index, count)) return 'band';
    return 'body';
  });
}

/** True for a section whose cards are plans to compare. */
export function isPricingSection(section: PageSection): boolean {
  if (section.role === 'pricing') return true;
  return PRICING_ID.test(sectionAnchor(section)) || PRICING_ID.test(section.id);
}

/**
 * The plan to emphasize: the first `accent` card, else the middle of an odd
 * row of three or more, else none.
 */
export function highlightedPlan(block: CardsBlock): number {
  const accented = block.items.findIndex((card) => card.tone === 'accent');
  if (accented >= 0) return accented;
  const count = block.items.length;
  return count >= 3 && count % 2 === 1 ? (count - 1) / 2 : -1;
}

/** Stat rows the page draws itself; trends keep the sparkline renderer. */
export function isPlainStat(block: StatBlock): boolean {
  return block.items.every((item) => item.trend === undefined);
}

/** Steps the page draws as a numbered row; icon steps keep the block renderer. */
export function isNumberedSteps(block: StepsBlock): boolean {
  return block.numbered !== false && block.items.every((item) => item.icon === undefined);
}

/**
 * Top navigation. An explicit `page.nav` wins. Otherwise every body section
 * with a label (title or opening heading) gets a link; the hero (the brand
 * links to it), the footer and the closing band do not. When no section has
 * a label, the ids are humanized so the page still has a way around.
 */
export function pageNavItems(page: Pick<PageDocument, 'sections' | 'nav'>): PageNavItem[] {
  if (page.nav && page.nav.length > 0) return page.nav;
  const designs = sectionDesigns(page);
  const body = page.sections.filter((_, index) => designs[index] === 'body');
  const labelled = body.filter((section) => sectionLabel(section) !== null);
  const linked = labelled.length > 0 ? labelled : body;
  return linked.map((section) => ({
    id: `nav-${section.id}`,
    label: sectionLabel(section) ?? humanizeId(section.id),
    href: `#${sectionAnchor(section)}`,
  }));
}

const SAFE_HREF = /^(#[A-Za-z0-9_-]*|\/(?!\/)[^\s]*|https?:\/\/[^\s]+|mailto:[^\s]+)$/i;

/**
 * A link target the page may use: in-page hashes, same-site paths, http(s)
 * and mailto. Anything else (`javascript:`, `data:`, protocol-relative) is
 * null. The block schema already rejects these; this is the second fence.
 */
export function safePageHref(href: string): string | null {
  const value = href.trim();
  return SAFE_HREF.test(value) ? value : null;
}

/**
 * Short markdown as plain paragraphs: emphasis, code and link markers are
 * dropped and the text is rendered as text nodes, never as HTML.
 */
export function plainParagraphs(source: string): string[] {
  return source
    .replace(/\r\n/g, '\n')
    .split(/\n+/)
    .map((line) =>
      line
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/^\s*(?:[-*+]|\d+\.|>)\s+/, '')
        .trim()
    )
    .filter(Boolean);
}
