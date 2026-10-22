import type { Block } from '@protoyard/blocks';
import { slugifyHeading, uniqueSlug } from '@protoyard/blocks';
import { describe, expect, it } from 'vitest';
import type { DocDocument, PageDocument } from '../src/schema.ts';
import { allocateHeadingId, buildDocToc, buildPageToc, headingId } from '../src/toc.ts';

const heading = (text: string, level?: 1 | 2 | 3 | 4, id?: string): Block => ({
  type: 'heading',
  text,
  ...(level !== undefined ? { level } : {}),
  ...(id !== undefined ? { id } : {}),
});

describe('headingId (DocsLayout parity)', () => {
  it('matches DocsLayout / blocks slugifyHeading on unicode and punctuation', () => {
    expect(headingId('  Café  Overview! ')).toBe('cafe-overview');
    expect(headingId('Café Overview!')).toBe(slugifyHeading('Café Overview!'));
    expect(headingId('')).toBe('section');
    expect(headingId('   ')).toBe('section');
    expect(headingId('Hello World')).toBe('hello-world');
    expect(headingId('API — v2')).toBe('api-v2');
  });

  it('suffixes collisions like DocsLayout (-2, -3, …)', () => {
    const used = new Set<string>();
    expect(allocateHeadingId('Hello', used)).toBe('hello');
    expect(allocateHeadingId('Hello', used)).toBe('hello-2');
    expect(allocateHeadingId('Hello!', used)).toBe('hello-3');
    expect(uniqueSlug('Hello', new Set(['hello']))).toBe('hello-2');
  });

  it('keeps a preferred author id when unique, then falls back to the label slug', () => {
    const used = new Set<string>();
    expect(allocateHeadingId('Getting Started', used, 'intro')).toBe('intro');
    // Preferred already taken → slugify label
    expect(allocateHeadingId('Getting Started', used, 'intro')).toBe('getting-started');
    expect(allocateHeadingId('Getting Started', used)).toBe('getting-started-2');
  });
});

describe('buildDocToc', () => {
  it('returns stable unique ids for h2/h3 by default and skips h1', () => {
    const blocks: Block[] = [
      heading('Title', 1),
      heading('Getting Started'),
      heading('Install', 3),
      heading('Getting Started'),
      heading('Deep dive', 4),
      heading('  Café  Tips! ', 2),
    ];
    const toc = buildDocToc(blocks);
    expect(toc).toEqual([
      { id: 'getting-started', label: 'Getting Started', level: 2 },
      { id: 'install', label: 'Install', level: 3 },
      { id: 'getting-started-2', label: 'Getting Started', level: 2 },
      { id: 'cafe-tips', label: 'Café Tips!', level: 2 },
    ]);
    // Deterministic
    expect(buildDocToc(blocks)).toEqual(toc);
  });

  it('honors block ids and depth from the doc toc options', () => {
    const doc: DocDocument = {
      id: 'guide',
      title: 'Guide',
      toc: { depth: 2 },
      blocks: [
        heading('Overview', 2, 'overview'),
        heading('Details', 3),
        heading('Overview', 2),
        {
          type: 'columns',
          columns: [[heading('In a column', 2)], [heading('Also column', 2, 'col-b')]],
        },
      ],
    };
    // depth 2 → h2 only (no h3 Details)
    expect(buildDocToc(doc).map((item) => item.id)).toEqual([
      'overview',
      'overview-2',
      'in-a-column',
      'col-b',
    ]);
    // option overrides doc.toc.depth
    expect(buildDocToc(doc, { depth: 3 }).map((item) => item.level)).toContain(3);
  });

  it('walks tabs and reveals depth-first without inventing labels', () => {
    const blocks: Block[] = [
      {
        type: 'tabs',
        id: 'tabs',
        label: 'Sections',
        panels: [
          {
            id: 'a',
            label: 'Alpha',
            blocks: [heading('Alpha heading', 2)],
          },
          {
            id: 'b',
            label: 'Beta',
            blocks: [
              {
                type: 'reveal',
                id: 'more',
                label: 'Show more',
                blocks: [heading('Hidden', 3), heading('', 2)],
              },
            ],
          },
        ],
      },
    ];
    expect(buildDocToc(blocks)).toEqual([
      { id: 'alpha-heading', label: 'Alpha heading', level: 2 },
      { id: 'hidden', label: 'Hidden', level: 3 },
    ]);
  });

  it('is pure: does not mutate the input document', () => {
    const blocks: Block[] = [heading('One'), heading('One')];
    const snapshot = JSON.stringify(blocks);
    buildDocToc(blocks);
    expect(JSON.stringify(blocks)).toBe(snapshot);
  });
});

describe('buildPageToc', () => {
  it('uses section ids/anchors then heading blocks with a shared collision set', () => {
    const page: Pick<PageDocument, 'sections'> = {
      sections: [
        {
          id: 'hero',
          title: 'Welcome',
          role: 'hero',
          blocks: [heading('Welcome', 2)],
        },
        {
          id: 'features',
          anchor: 'features',
          title: 'Features',
          blocks: [heading('Pricing', 2), heading('Features', 3)],
        },
      ],
    };
    expect(buildPageToc(page)).toEqual([
      { id: 'hero', label: 'Welcome', level: 2 },
      // section already took "hero"; heading "Welcome" → welcome
      { id: 'welcome', label: 'Welcome', level: 2 },
      { id: 'features', label: 'Features', level: 2 },
      { id: 'pricing', label: 'Pricing', level: 2 },
      // "features" taken by section → features-2
      { id: 'features-2', label: 'Features', level: 3 },
    ]);
  });
});
