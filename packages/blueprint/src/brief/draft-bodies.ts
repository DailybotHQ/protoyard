/**
 * Turn outline draft blocks into page/doc body payloads that pass the wired
 * `@protoyard/pages` schemas (and therefore `safeParseAnyBlueprint`).
 */
import type { OutlineBlock, OutlineSection } from './page-doc-outlines.ts';

const PAGE_ROLES = new Set(['hero', 'body', 'footer', 'cta', 'features', 'pricing', 'faq']);

/** Lowercase kebab id for document/section anchors (BlockIdSchema). */
export function draftSlugId(value: string, fallback: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  if (slug && /^[a-z]/.test(slug)) return slug;
  return fallback;
}

function mapPageRole(role: string): string | undefined {
  if (PAGE_ROLES.has(role)) return role;
  return 'body';
}

/**
 * Convert outline draft blocks into strict block objects the pages schema accepts.
 * `defaultHref` is a resolved in-document fragment (`#section-id`) for CTA actions.
 */
export function outlineBlocksToSchema(
  blocks: readonly OutlineBlock[],
  defaultHref = '#section-hero'
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const safeDefault = defaultHref.startsWith('#') ? defaultHref : `#${defaultHref}`;
  for (const block of blocks) {
    switch (block.type) {
      case 'heading':
        out.push({
          type: 'heading',
          text: block.text.slice(0, 200),
          level: block.level ?? 2,
        });
        break;
      case 'text':
        out.push({ type: 'text', markdown: block.markdown.slice(0, 4_000) });
        break;
      case 'list':
        out.push({
          type: 'list',
          style:
            block.style === 'check' ? 'check' : block.style === 'number' ? 'number' : undefined,
          items: block.items
            .slice(0, 12)
            .map((item) => ({ text: String(item).slice(0, 600) }))
            .filter((item) => item.text.length > 0),
        });
        break;
      case 'cta': {
        const raw = block.href && block.href.length > 0 ? block.href : safeDefault;
        // Only keep in-page fragments; external http(s) is fine for schema fragment checks.
        const href =
          raw.startsWith('#') || /^https?:\/\//i.test(raw) || raw.startsWith('mailto:')
            ? raw
            : safeDefault;
        out.push({
          type: 'cta',
          actions: [
            {
              label: block.label.slice(0, 60),
              href: href.slice(0, 512),
            },
          ],
        });
        break;
      }
      case 'stat':
        out.push({
          type: 'stat',
          items: block.items.slice(0, 6).map((item) => ({
            value: String(item.value).slice(0, 32),
            label: String(item.label).slice(0, 80),
          })),
        });
        break;
      case 'quote':
        out.push({
          type: 'quote',
          quote: block.quote.slice(0, 280),
          ...(block.cite ? { cite: block.cite.slice(0, 120) } : {}),
        });
        break;
      case 'callout':
        out.push({
          type: 'callout',
          body: block.body.slice(0, 1_000),
          ...(block.title ? { title: block.title.slice(0, 80) } : {}),
        });
        break;
      case 'divider':
        out.push({
          type: 'divider',
          ...(block.label ? { label: block.label.slice(0, 80) } : {}),
        });
        break;
      default:
        break;
    }
  }
  return out.filter((block) => {
    if (block.type === 'list') {
      const items = block.items as unknown[];
      return Array.isArray(items) && items.length > 0;
    }
    if (block.type === 'stat') {
      const items = block.items as unknown[];
      return Array.isArray(items) && items.length > 0;
    }
    if (block.type === 'cta') {
      const actions = block.actions as unknown[];
      return Array.isArray(actions) && actions.length > 0;
    }
    return true;
  });
}

/** Page body: id + title + sections of valid blocks (no draft-only keys). */
export function pageBodyFromOutline(input: {
  id: string;
  title: string;
  description?: string;
  sections: readonly OutlineSection[];
}): Record<string, unknown> {
  const used = new Set<string>();
  const sectionIds = input.sections.map((section, index) => {
    let id = draftSlugId(section.id || section.title, `section-${index + 1}`);
    if (used.has(id)) id = `${id}-${index + 1}`;
    used.add(id);
    return id;
  });
  const firstHref = `#${sectionIds[0] ?? 'section-1'}`;
  const sections = input.sections.map((section, index) => {
    const id = sectionIds[index] ?? `section-${index + 1}`;
    const blocks = outlineBlocksToSchema(section.blocks, firstHref);
    // Rewrite unknown in-page fragments to the first section so fragment lint passes.
    for (const block of blocks) {
      if (block.type !== 'cta' || !Array.isArray(block.actions)) continue;
      for (const action of block.actions as { href?: string }[]) {
        if (typeof action.href === 'string' && action.href.startsWith('#')) {
          const target = action.href.slice(1);
          if (!used.has(target)) action.href = firstHref;
        }
      }
    }
    const role = mapPageRole(section.role);
    return {
      id,
      ...(section.title ? { title: section.title.slice(0, 120) } : {}),
      ...(role ? { role } : {}),
      blocks: blocks.length > 0 ? blocks : [{ type: 'text', markdown: section.body.slice(0, 600) }],
    };
  });
  return {
    id: draftSlugId(input.id, 'page-draft'),
    title: input.title.slice(0, 120) || 'Page draft',
    ...(input.description ? { description: input.description.slice(0, 500) } : {}),
    sections,
  };
}

/**
 * Doc body: continuous block flow. Section titles become headings with stable ids
 * so a TOC has entries and fragment targets stay unique.
 */
export function docBodyFromOutline(input: {
  id: string;
  title: string;
  description?: string;
  sections: readonly OutlineSection[];
}): Record<string, unknown> {
  const blocks: Record<string, unknown>[] = [];
  const used = new Set<string>();
  for (const section of input.sections) {
    let headingId = draftSlugId(section.id || section.title, 'section');
    if (used.has(headingId)) headingId = `${headingId}-${used.size + 1}`;
    used.add(headingId);
    const level = section.role === 'title' ? 1 : 2;
    blocks.push({
      type: 'heading',
      id: headingId,
      level,
      text: section.title.slice(0, 200) || headingId,
    });
    for (const block of outlineBlocksToSchema(section.blocks, `#${headingId}`)) {
      if (
        block.type === 'heading' &&
        typeof block.text === 'string' &&
        block.text === section.title &&
        (block.level === 1 || block.level === 2)
      ) {
        continue;
      }
      if (block.type === 'cta' && Array.isArray(block.actions)) {
        for (const action of block.actions as { href?: string }[]) {
          if (typeof action.href === 'string' && action.href.startsWith('#')) {
            const target = action.href.slice(1);
            if (!used.has(target)) action.href = `#${headingId}`;
          }
        }
      }
      if (block.type === 'heading' && typeof (block as { id?: string }).id === 'string') {
        let id = (block as { id: string }).id;
        if (used.has(id)) id = `${id}-${used.size + 1}`;
        used.add(id);
        blocks.push({ ...block, id });
      } else {
        blocks.push(block);
      }
    }
  }
  if (blocks.length === 0) {
    blocks.push({ type: 'heading', id: 'title', level: 1, text: input.title.slice(0, 200) });
    blocks.push({ type: 'text', markdown: 'Add the document body here.' });
  }
  const hasTocHeading = blocks.some(
    (block) =>
      block.type === 'heading' &&
      typeof block.level === 'number' &&
      block.level >= 2 &&
      block.level <= 3
  );
  if (!hasTocHeading) {
    blocks.push({
      type: 'heading',
      id: 'summary',
      level: 2,
      text: 'Summary',
    });
  }
  return {
    id: draftSlugId(input.id, 'doc-draft'),
    title: input.title.slice(0, 120) || 'Document draft',
    ...(input.description ? { description: input.description.slice(0, 500) } : {}),
    toc: { depth: 3, sticky: true },
    blocks,
  };
}
