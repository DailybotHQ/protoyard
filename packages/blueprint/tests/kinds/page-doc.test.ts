import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  blueprintKind,
  isDocBlueprint,
  isPageBlueprint,
  parseAnyBlueprint,
  safeParseAnyBlueprint,
  validateBlueprintForAuthoring,
} from '../../src/index.ts';

/*
 * `kind: "page"` and `kind: "doc"` through the kind union: the bodies are
 * `@protoyard/pages`' document schemas plus the checks that span a whole
 * page or doc (kinds/page.ts, kinds/doc.ts).
 */

const FIXTURES = join(import.meta.dirname, '../fixtures/kinds');
const fixture = (name: string) =>
  JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as Record<string, unknown> & {
    page?: Record<string, unknown>;
    doc?: Record<string, unknown>;
  };

type Section = { id: string; anchor?: string; blocks: Record<string, unknown>[] };
type Body = Record<string, unknown> & { sections: Section[]; blocks: Record<string, unknown>[] };

/** A deep copy of a fixture with its body changed by `edit`. */
function variant(name: string, key: 'page' | 'doc', edit: (body: Body) => void) {
  const input = fixture(name);
  const body = structuredClone(input[key]) as Body;
  edit(body);
  return { ...input, [key]: body };
}

/** The issues of a failed parse, as `path: message`. */
async function issues(input: unknown): Promise<string[]> {
  const result = await safeParseAnyBlueprint(input);
  expect(result.success).toBe(false);
  return (result.error?.issues ?? []).map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

describe('page blueprints', () => {
  it('parses the landing page fixture through the union', async () => {
    const page = await parseAnyBlueprint(fixture('landing.page.json'));
    expect(blueprintKind(page)).toBe('page');
    expect(isPageBlueprint(page)).toBe(true);
    if (!isPageBlueprint(page)) return;
    expect(page.page.sections.map((section) => section.id)).toEqual([
      'hero',
      'features',
      'pricing',
      'signup',
    ]);
    expect(page.page.forms).toEqual([{ formId: 'waitlist', sectionId: 'signup' }]);
    expect(page.tags).toEqual(['landing', 'marketing']);
  });

  it('rejects app-only keys and a missing body', async () => {
    expect((await issues({ ...fixture('landing.page.json'), entities: [] }))[0]).toMatch(
      /entities/
    );
    const { page: _page, ...noBody } = fixture('landing.page.json');
    expect((await issues(noBody)).some((line) => line.startsWith('page:'))).toBe(true);
  });

  it('rejects duplicate section ids and anchors', async () => {
    const dup = variant('landing.page.json', 'page', (page) => {
      (page.sections[1] as Section).id = 'hero';
    });
    expect(await issues(dup)).toContainEqual(
      expect.stringMatching(/^page\.sections\.1: Section ids must be unique/)
    );
  });

  it('rejects a block id used twice on the page, even across sections', async () => {
    const dup = variant('landing.page.json', 'page', (page) => {
      const heading = (page.sections[1] as Section).blocks[0] as { id: string };
      heading.id = 'hero-title';
    });
    expect(await issues(dup)).toEqual([
      'page.sections.1.blocks.0.id: Block id "hero-title" is already used in section "hero"; block ids must be unique on a page',
    ]);
  });

  it('rejects a block id that is also a section anchor', async () => {
    const clash = variant('landing.page.json', 'page', (page) => {
      const heading = (page.sections[2] as Section).blocks[0] as { id: string };
      heading.id = 'join';
      // Keep the card link valid so only the clash is reported.
      const cards = (page.sections[1] as Section).blocks[1] as { items: { href?: string }[] };
      delete (cards.items[2] as { href?: string }).href;
    });
    expect(await issues(clash)).toEqual([
      'page.sections.2.blocks.0.id: Block id "join" is also a section id or anchor; use a different id',
    ]);
  });

  it('checks form references: the form exists and sits in the named section', async () => {
    const missing = variant('landing.page.json', 'page', (page) => {
      page.forms = [{ formId: 'newsletter' }];
    });
    expect(await issues(missing)).toContainEqual(
      expect.stringMatching(
        /^page\.forms\.0\.formId: formId "newsletter" does not match a form block/
      )
    );
    const wrongSection = variant('landing.page.json', 'page', (page) => {
      page.forms = [{ formId: 'waitlist', sectionId: 'pricing' }];
    });
    expect(await issues(wrongSection)).toEqual([
      'page.forms.0.sectionId: Form "waitlist" is in section "signup", not "pricing"',
    ]);
    const nested = variant('landing.page.json', 'page', (page) => {
      const signup = page.sections[3] as Section;
      signup.blocks = [{ type: 'columns', columns: [[signup.blocks[1]], [{ type: 'divider' }]] }];
    });
    expect((await safeParseAnyBlueprint(nested)).success).toBe(true);
  });

  it('rejects relative CTA links under the external-link policy', async () => {
    const broken = variant('landing.page.json', 'page', (page) => {
      const cta = (page.sections[0] as Section).blocks[1] as { actions: { href: string }[] };
      (cta.actions[1] as { href: string }).href = '#faq';
    });
    expect(await issues(broken)).toContainEqual(
      expect.stringMatching(/^page\.sections\.0\.blocks\.1\.actions\.1\.href: /)
    );
    const nav = variant('landing.page.json', 'page', (page) => {
      page.nav = [{ id: 'nav-faq', label: 'FAQ', href: '#faq' }];
    });
    expect(await issues(nav)).toContainEqual(expect.stringMatching(/^page\.nav\.0\.href: /));
  });
});

describe('doc blueprints', () => {
  it('parses the report fixture through the union', async () => {
    const doc = await parseAnyBlueprint(fixture('quarterly-report.doc.json'));
    expect(blueprintKind(doc)).toBe('doc');
    expect(isDocBlueprint(doc)).toBe(true);
    if (!isDocBlueprint(doc)) return;
    expect(doc.doc.toc).toEqual({ depth: 3, sticky: true });
    expect(doc.doc.print).toEqual({ pageBreaks: 'heading', hideChrome: true });
    expect(doc.doc.blocks).toHaveLength(9);
  });

  it('rejects duplicate heading ids', async () => {
    const dup = variant('quarterly-report.doc.json', 'doc', (doc) => {
      (doc.blocks[5] as { id: string }).id = 'results';
    });
    expect(await issues(dup)).toContainEqual(
      expect.stringMatching(/^doc\.blocks\.5\.id: Duplicate block id "results"/)
    );
  });

  it('rejects a table of contents with nothing to list', async () => {
    const flat = variant('quarterly-report.doc.json', 'doc', (doc) => {
      doc.blocks = doc.blocks.filter((block) => block.type !== 'heading' && block.type !== 'cta');
    });
    expect(await issues(flat)).toEqual([
      'doc.toc: The table of contents lists headings of level 2 to 3, and this document has none',
    ]);
    const shallow = variant('quarterly-report.doc.json', 'doc', (doc) => {
      doc.toc = { depth: 2 };
      doc.blocks = doc.blocks.filter((block) => block.type !== 'heading' || block.level === 3);
      doc.blocks = doc.blocks.filter((block) => block.type !== 'cta');
    });
    expect(await issues(shallow)).toEqual([
      'doc.toc: The table of contents lists headings of level 2 to 2, and this document has none',
    ]);
    const untitled = variant('quarterly-report.doc.json', 'doc', (doc) => {
      doc.blocks = [{ type: 'heading', text: 'No level means level 2' }];
    });
    expect((await safeParseAnyBlueprint(untitled)).success).toBe(true);
  });

  it('accepts a doc without a table of contents and without headings', async () => {
    const plain = variant('quarterly-report.doc.json', 'doc', (doc) => {
      delete doc.toc;
      doc.blocks = [{ type: 'text', markdown: 'Just a note.' }];
    });
    expect((await safeParseAnyBlueprint(plain)).success).toBe(true);
  });

  it('rejects relative CTA links under the external-link policy', async () => {
    const broken = variant('quarterly-report.doc.json', 'doc', (doc) => {
      const cta = doc.blocks[2] as { actions: { href: string }[] };
      (cta.actions[0] as { href: string }).href = '#appendix';
    });
    expect(await issues(broken)).toContainEqual(
      expect.stringMatching(/^doc\.blocks\.2\.actions\.0\.href: /)
    );
  });

  it('rejects unknown body keys', async () => {
    const extra = variant('quarterly-report.doc.json', 'doc', (doc) => {
      doc.sections = [];
    });
    expect((await issues(extra)).some((line) => line.startsWith('doc'))).toBe(true);
  });
});

describe('authoring diagnostics for page and doc', () => {
  it('reports body problems with JSON paths', async () => {
    const broken = variant('landing.page.json', 'page', (page) => {
      page.forms = [{ formId: 'waitlist', sectionId: 'hero' }];
    });
    const result = await validateBlueprintForAuthoring(broken);
    expect(result.valid).toBe(false);
    expect(result.kind).toBe('page');
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        path: ['page', 'forms', 0, 'sectionId'],
        jsonPath: '$["page"]["forms"][0]["sectionId"]',
      })
    );
    expect((await validateBlueprintForAuthoring(fixture('quarterly-report.doc.json'))).valid).toBe(
      true
    );
  });
});
