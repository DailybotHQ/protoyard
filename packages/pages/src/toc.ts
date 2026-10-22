/**
 * Pure table-of-contents builder for page and doc documents.
 * No DOM: deep links and print can use the same ids before paint.
 *
 * Slug rules match `DocsLayout` `headingId` (and `@protoyard/blocks`
 * `slugifyHeading` / collision suffixing): NFKD, strip marks, kebab-case,
 * empty → `section`, duplicates get `-2`, `-3`, …
 */
import { type Block, forEachBlock, slugifyHeading, uniqueSlug } from '@protoyard/blocks';
import type { DocDocument, DocToc, PageSection } from './schema.ts';
import { PAGE_DOCUMENT_LIMITS } from './schema.ts';

/** One TOC row: stable id for `#hash`, visible label, heading level. */
export interface DocTocItem {
  id: string;
  label: string;
  /** Outline level included in the TOC (2–4; never 1 by default). */
  level: 2 | 3 | 4;
}

export interface BuildDocTocOptions {
  /**
   * Max heading level to include (2 = h2 only, 3 = h2–h3, 4 = h2–h4).
   * Defaults to `doc.toc.depth` when present, else 3.
   */
  depth?: number;
}

/** DocsLayout / blocks slug for a visible heading label. */
export function headingId(label: string): string {
  return slugifyHeading(label);
}

function normalizeLabel(label: string): string {
  return label.replace(/\s+/g, ' ').trim();
}

function clampDepth(depth: number | undefined): number {
  const raw = depth ?? 3;
  return Math.min(PAGE_DOCUMENT_LIMITS.maxTocDepth, Math.max(2, Math.floor(raw)));
}

/**
 * Assign a unique id the way DocsLayout does: keep an author id when unique,
 * otherwise slugify the label and suffix `-2`, `-3`, … on collisions.
 */
export function allocateHeadingId(label: string, used: Set<string>, preferredId?: string): string {
  const preferred = preferredId?.trim() ?? '';
  if (preferred && !used.has(preferred)) {
    used.add(preferred);
    return preferred;
  }
  const id = used.has(headingId(label)) ? uniqueSlug(label, used) : headingId(label);
  used.add(id);
  return id;
}

type HeadingSource = {
  label: string;
  level: number;
  /** Author-supplied id (section id, block id, or anchor). */
  preferredId?: string;
};

function pushHeading(
  source: HeadingSource,
  maxLevel: number,
  used: Set<string>,
  out: DocTocItem[]
): void {
  const label = normalizeLabel(source.label);
  if (!label) return;
  const raw = source.level;
  const level = (raw < 1 ? 1 : raw > 4 ? 4 : raw) as 1 | 2 | 3 | 4;
  // Title-level (1) stays out of the on-page TOC by default.
  if (level < 2 || level > maxLevel) return;
  const id = allocateHeadingId(label, used, source.preferredId);
  out.push({ id, label, level: level as 2 | 3 | 4 });
}

function collectHeadingBlocks(
  blocks: readonly Block[],
  maxLevel: number,
  used: Set<string>,
  out: DocTocItem[]
): void {
  forEachBlock(blocks, (block) => {
    if (block.type !== 'heading') return;
    pushHeading(
      {
        label: block.text,
        level: block.level ?? 2,
        preferredId: block.id,
      },
      maxLevel,
      used,
      out
    );
  });
}

/**
 * TOC entries from heading blocks in document order (depth-first through
 * columns, tabs and reveals). Levels 2…`depth` only (default depth 3).
 *
 * Accepts a `DocDocument` (uses `toc.depth` when set) or a bare block list.
 */
function isBlockList(value: unknown): value is readonly Block[] {
  return Array.isArray(value);
}

export function buildDocToc(
  doc: Pick<DocDocument, 'blocks' | 'toc'> | readonly Block[],
  options: BuildDocTocOptions = {}
): DocTocItem[] {
  const blocks: readonly Block[] = isBlockList(doc) ? doc : doc.blocks;
  const toc: DocToc | undefined = isBlockList(doc) ? undefined : doc.toc;
  const maxLevel = clampDepth(options.depth ?? toc?.depth);
  const used = new Set<string>();
  const out: DocTocItem[] = [];
  collectHeadingBlocks(blocks, maxLevel, used, out);
  return out;
}

export interface BuildPageTocOptions extends BuildDocTocOptions {}

/**
 * TOC for a landing page: each section with a title becomes a level-2 entry
 * (id = `anchor ?? section.id`), then heading blocks inside that section.
 * Shared collision set so section ids and heading slugs never clash.
 */
export function buildPageToc(
  page: { sections: readonly PageSection[] },
  options: BuildPageTocOptions = {}
): DocTocItem[] {
  const maxLevel = clampDepth(options.depth);
  const used = new Set<string>();
  const out: DocTocItem[] = [];

  for (const section of page.sections) {
    const sectionLabel = section.title?.trim();
    if (sectionLabel) {
      pushHeading(
        {
          label: sectionLabel,
          level: 2,
          preferredId: section.anchor ?? section.id,
        },
        maxLevel,
        used,
        out
      );
    }
    collectHeadingBlocks(section.blocks, maxLevel, used, out);
  }

  return out;
}
