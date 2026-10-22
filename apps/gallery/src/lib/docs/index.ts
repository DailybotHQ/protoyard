import { existsSync, readFileSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../docs');
/**
 * User-facing guides published at /docs/. Guides that
 * do not exist yet are skipped. Contributor and internal docs (ARCHITECTURE,
 * DECISIONS, STANDARDS, TESTING_GUIDE, DEVELOPMENT_COMMANDS, PERFORMANCE,
 * AI_AGENT_*, IMPLEMENTATION_PLAN, PRODUCT_SPEC) stay on GitHub only.
 */
export const PUBLIC_GUIDES: readonly string[] = [
  'QUICKSTART',
  'AGENT_GUIDE',
  'QUICK',
  'PLAYER',
  'DECKS',
  'GENERATOR',
  'BRIEF_TO_PROTOTYPE',
  'DATABASE',
  'SCENARIOS',
  'THEMES',
  'LAYOUTS',
  'SHELLS',
  'VIEWS',
  'CHARTS',
  'ANALYTICS',
  'SAAS_KITS',
  'AI_KITS',
  'AVATARS',
  'PUBLISHING',
  'REVIEW_COMMENTS',
  'SPECS',
  'PACKAGES',
  'SKILL',
  'INTERFACE',
  'MCP',
  'DWP',
  'SECURITY',
];
/** Source links for files that are not public pages; the public site builds from main. */
export const GITHUB_SOURCE = 'https://github.com/DailybotHQ/protoyard/blob/main/';
const GITHUB_DOCS = GITHUB_SOURCE;

export interface DocHeading {
  depth: number;
  id: string;
  text: string;
}

/** The plain text under one heading (until the next heading), for search. */
export interface DocSection {
  /** The heading's anchor id (the same id the rendered page uses). */
  id: string;
  heading: string;
  depth: number;
  /** Prose, list, quote and table text; fenced code is left out. */
  text: string;
}

export interface PublicDoc {
  slug: string;
  filename: string;
  title: string;
  description: string;
  headings: DocHeading[];
  sections: DocSection[];
  /** Generated tags only; source text, raw HTML and code are escaped by the renderer. */
  html: string;
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character] ?? character;
  });

/**
 * GitHub's heading ids (github-slugger), so anchors written against the
 * guides on GitHub resolve on the site too: lowercase, drop punctuation except
 * `-` and `_`, and turn every space into `-` (runs are not collapsed).
 */
const slugify = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-');

const plainText = (value: string) =>
  value
    .replace(/!?(\[)([^\]]+)\]\([^)]*\)/g, '$2')
    .replace(/[`*_~]/g, '')
    .replace(/<[^>]*>/g, '')
    .trim();

const safeExternalHref = (href: string): string | null => {
  if (/^(https?:|mailto:)/i.test(href)) return href;
  if (href.startsWith('#')) return href;
  return null;
};

/** Rewrite source-relative markdown links to public routes or source files. */
export function rewriteDocLink(sourceFilename: string, href: string, basePath = ''): string | null {
  const external = safeExternalHref(href);
  if (external) return external;
  if (href.startsWith('//') || href.startsWith('javascript:') || href.startsWith('data:')) {
    return null;
  }

  const [rawPath, ...fragmentParts] = href.split('#');
  const fragment = fragmentParts.length ? `#${fragmentParts.join('#')}` : '';
  if (!rawPath) return fragment || null;

  const normalized = posix.normalize(posix.join('docs', posix.dirname(sourceFilename), rawPath));
  if (normalized === 'docs' || normalized.startsWith('../')) return null;
  const relative = normalized.startsWith('docs/') ? normalized.slice(5) : normalized;
  const filename = posix.basename(relative);
  const guide = filename.match(/^([A-Z][A-Z0-9_-]*)\.md$/)?.[1];
  if (normalized.startsWith('docs/') && guide && PUBLIC_GUIDES.includes(guide)) {
    const base = basePath.replace(/\/$/, '');
    return `${base}/docs/${guide.toLocaleLowerCase('en')}/${fragment}`;
  }
  // Repository-relative path: a guide's `DECISIONS.md` is docs/DECISIONS.md.
  return `${GITHUB_DOCS}${normalized}${fragment}`;
}

function renderInline(value: string, sourceFilename: string, basePath: string): string {
  const pattern =
    /!?(\[([^\]]+)\])\(([^)\s]+)(?:\s+"([^"]*)")?\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let output = '';
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    output += escapeHtml(value.slice(cursor, index));
    const [whole, , label, rawHref, title, code, strong, emphasis] = match;
    if (rawHref) {
      const href = rewriteDocLink(sourceFilename, rawHref, basePath);
      const image = whole.startsWith('!');
      if (href && !image) {
        output += `<a href="${escapeHtml(href)}"${title ? ` title="${escapeHtml(title)}"` : ''}>${escapeHtml(label)}</a>`;
      } else {
        output += escapeHtml(whole.replace(/^!/, ''));
      }
    } else if (code) {
      output += `<code>${escapeHtml(code)}</code>`;
    } else if (strong) {
      output += `<strong>${escapeHtml(strong)}</strong>`;
    } else if (emphasis) {
      output += `<em>${escapeHtml(emphasis)}</em>`;
    }
    cursor = index + whole.length;
  }
  return output + escapeHtml(value.slice(cursor));
}

export function renderMarkdown(source: string, sourceFilename: string, basePath = '') {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const headings: DocHeading[] = [];
  const emittedIds = new Map<string, number>();
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let quote: string[] = [];
  const sections: DocSection[] = [];
  let section: { id: string; heading: string; depth: number; text: string[] } | null = null;
  const closeSection = () => {
    if (section) {
      sections.push({
        id: section.id,
        heading: section.heading,
        depth: section.depth,
        text: section.text.join(' ').replace(/\s+/g, ' ').trim(),
      });
    }
  };
  const addText = (value: string) => {
    const text = plainText(value);
    if (text && section) section.text.push(text);
  };

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(`<p>${renderInline(paragraph.join(' ').trim(), sourceFilename, basePath)}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      const tag = list.ordered ? 'ol' : 'ul';
      blocks.push(
        `<${tag}>${list.items.map((item) => `<li>${renderInline(item, sourceFilename, basePath)}</li>`).join('')}</${tag}>`
      );
      list = null;
    }
  };
  const flushQuote = () => {
    if (quote.length) {
      blocks.push(
        `<blockquote><p>${renderInline(quote.join(' '), sourceFilename, basePath)}</p></blockquote>`
      );
      quote = [];
    }
  };
  const flushFlow = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const fence = line.match(/^\s*```([\w+-]*)\s*$/);
    if (fence) {
      flushFlow();
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index] ?? '')) {
        codeLines.push(lines[index] ?? '');
        index += 1;
      }
      const language = fence[1] ? ` class="language-${escapeHtml(fence[1])}"` : '';
      // Focusable: a long line scrolls the block sideways, and keyboard users must reach it.
      blocks.push(
        `<pre tabindex="0"><code${language}>${escapeHtml(codeLines.join('\n'))}</code></pre>`
      );
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (heading) {
      flushFlow();
      const depth = heading[1]?.length ?? 1;
      const text = plainText(heading[2] ?? '');
      const baseId = slugify(text) || 'section';
      const occurrence = emittedIds.get(baseId) ?? 0;
      emittedIds.set(baseId, occurrence + 1);
      // GitHub numbers repeated headings -1, -2, …
      const id = occurrence ? `${baseId}-${occurrence}` : baseId;
      headings.push({ depth, id, text });
      closeSection();
      section = { id, heading: text, depth, text: [] };
      blocks.push(
        `<h${depth} id="${id}">${renderInline(heading[2] ?? '', sourceFilename, basePath)}</h${depth}>`
      );
      continue;
    }
    if (/^\s*([-*_]\s*){3,}$/.test(line)) {
      flushFlow();
      blocks.push('<hr />');
      continue;
    }
    if (
      line.includes('|') &&
      /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1] ?? '')
    ) {
      flushFlow();
      const cells = (row: string) =>
        row
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((cell) => cell.trim());
      const headers = cells(line);
      addText(headers.join(' '));
      index += 2;
      const rows: string[][] = [];
      while (
        index < lines.length &&
        (lines[index] ?? '').includes('|') &&
        (lines[index] ?? '').trim()
      ) {
        rows.push(cells(lines[index] ?? ''));
        addText(cells(lines[index] ?? '').join(' '));
        index += 1;
      }
      index -= 1;
      const headerHtml = headers
        .map((cell) => `<th scope="col">${renderInline(cell, sourceFilename, basePath)}</th>`)
        .join('');
      const bodyHtml = rows
        .map(
          (row) =>
            `<tr>${headers.map((_, cellIndex) => `<td>${renderInline(row[cellIndex] ?? '', sourceFilename, basePath)}</td>`).join('')}</tr>`
        )
        .join('');
      blocks.push(
        `<div class="docs-table-wrap" tabindex="0" role="region" aria-label="Table, scrolls sideways"><table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`
      );
      continue;
    }
    const listMatch = line.match(/^\s*(?:([-*+])|(\d+)\.)\s+(.+)$/);
    if (listMatch) {
      flushParagraph();
      flushQuote();
      const ordered = Boolean(listMatch[2]);
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push(listMatch[3] ?? '');
      addText(listMatch[3] ?? '');
      continue;
    }
    const quoteMatch = line.match(/^\s*>\s?(.*)$/);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      quote.push(quoteMatch[1] ?? '');
      addText(quoteMatch[1] ?? '');
      continue;
    }
    if (!line.trim()) {
      flushFlow();
      continue;
    }
    flushList();
    flushQuote();
    paragraph.push(line.trim());
    addText(line);
  }
  flushFlow();
  closeSection();

  const title =
    headings.find((heading) => heading.depth === 1)?.text ?? sourceFilename.replace(/\.md$/i, '');
  const description = plainText(
    source.split('\n').find((line) => line.trim() && !/^#/.test(line)) ?? title
  ).slice(0, 180);
  return { title, description, headings, sections, html: blocks.join('\n') };
}

export function getPublicDocs(basePath = ''): PublicDoc[] {
  return PUBLIC_GUIDES.flatMap((guide) => {
    const filename = `${guide}.md`;
    const sourcePath = resolve(DOCS_DIR, filename);
    if (!existsSync(sourcePath)) return [];
    const rendered = renderMarkdown(readFileSync(sourcePath, 'utf8'), filename, basePath);
    return [{ slug: guide.toLocaleLowerCase('en'), filename, ...rendered }];
  });
}
