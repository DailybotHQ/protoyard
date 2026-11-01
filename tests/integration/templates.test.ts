import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { PrototypeDefinition } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../support/runtime.ts';
import { expectBootableWorld } from '../support/smoke.ts';

/**
 * One essential test per template (PLAN_009): every scenario it declares
 * generates the same world for the same seed and passes its integrity rules,
 * and the default scenario boots on the real runtime. Template-specific
 * untrusted-input guards (Markdown, avatar URLs) live at the bottom.
 */
const modules = import.meta.glob<{ definition: PrototypeDefinition }>(
  '../../templates/*/src/prototype.ts'
);
const names = Object.keys(modules)
  .map((path) => path.split('/')[3] as string)
  .sort();

const harnesses: Array<ReturnType<typeof createHarness>> = [];
afterEach(() => {
  for (const harness of harnesses.splice(0)) harness.closeAll();
});

describe('every template generates and validates', () => {
  it('finds one definition per template folder', () => {
    const folders = readdirSync(join(process.cwd(), 'templates'), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(names).toEqual(folders);
  });

  it.each(names)('%s', async (name) => {
    const { definition } = await modules[`../../templates/${name}/src/prototype.ts`]!();
    expect(definition.manifest.slug).toBe(name);
    const harness = createHarness(definition);
    harnesses.push(harness);
    await expectBootableWorld(definition, harness);
  });
});

describe('template untrusted-input guards', () => {
  it('docs-wiki shows hostile Markdown as text: no script, handler, frame or unsafe link', async () => {
    const { cleanup, render, screen } = await import('@testing-library/svelte');
    const { default: PageBody } = await import(
      '../../templates/docs-wiki/src/components/PageBody.svelte'
    );
    const { HOSTILE_BODY } = await import('../../templates/docs-wiki/src/scenarios/generators.ts');
    try {
      render(PageBody, { source: HOSTILE_BODY });
      const region = screen.getByRole('region', { name: 'Page content' });
      expect(region.querySelector('script, iframe, img, object, embed')).toBeNull();
      for (const el of region.querySelectorAll('*')) {
        for (const attr of el.getAttributeNames()) expect(attr.startsWith('on'), attr).toBe(false);
      }
      const hrefs = [...region.querySelectorAll('a')].map((a) => a.getAttribute('href'));
      expect(hrefs).toEqual(['https://example.com/handbook']);
      expect(region.textContent).toContain('<script>alert("not today")</script>');
    } finally {
      cleanup();
    }
  });

  it.each(['chat', 'chat-widget'])(
    '%s never turns an unsafe persona avatar into an image',
    async (name) => {
      const contexts = import.meta.glob<{
        authorOf: (people: Map<string, never>, id: string) => { image: Record<string, string> };
      }>('../../templates/{chat,chat-widget}/src/lib/context.ts');
      const { authorOf } = await contexts[`../../templates/${name}/src/lib/context.ts`]!();
      const person = (id: string, avatar: string) =>
        ({ id, name: `Person ${id}`, avatarColor: '#2563eb', avatar }) as never;
      const people = new Map([
        ['p1', person('p1', 'av-021')],
        ['p2', person('p2', 'javascript:alert(1)')],
      ]);
      expect(authorOf(people, 'p1').image.src).toBe('./avatars/64/av-021.webp');
      expect(authorOf(people, 'p2').image).toEqual({});
    }
  );
});
