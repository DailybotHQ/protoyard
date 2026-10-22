import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MINIMAL_EXAMPLES, RICH_EXAMPLES } from '@protoyard/blocks/catalog';
import { describe, expect, it } from 'vitest';
import { validateBlueprintForAuthoring } from '../../src/authoring-validation.ts';
import { safeParseAnyBlueprint } from '../../src/kinds/envelope.ts';
import { safeParseBlueprint } from '../../src/schema.ts';

const flagship = JSON.parse(
  readFileSync(resolve(process.cwd(), 'blueprints/decks/protoyard-create-anything.json'), 'utf8')
) as { deck: { slides: Array<{ id: string; blocks: Array<Record<string, unknown>> }> } };

describe('deck embedded app validation', () => {
  it('keeps every catalog embed-app example valid as an app blueprint', () => {
    for (const example of [MINIMAL_EXAMPLES['embed-app'], RICH_EXAMPLES['embed-app']]) {
      expect(example.type).toBe('embed-app');
      if (example.type !== 'embed-app') throw new Error('expected an embed-app catalog example');
      expect(safeParseBlueprint(example.app).success).toBe(true);
    }
  });

  it('accepts the flagship app and reports invalid embedded app fields at their JSON path', async () => {
    expect((await safeParseAnyBlueprint(flagship)).success).toBe(true);

    const invalid = structuredClone(flagship);
    const slideIndex = invalid.deck.slides.findIndex((slide) => slide.id === 'embed');
    const block = invalid.deck.slides[slideIndex]?.blocks.find(
      (candidate) => candidate.type === 'embed-app'
    );
    if (!block || typeof block.app !== 'object' || block.app === null || Array.isArray(block.app)) {
      throw new Error('The flagship embed slide needs an app blueprint.');
    }
    const app = block.app as { entities: Array<Record<string, unknown>> };
    delete app.entities[0]?.plural;

    const parsed = await safeParseAnyBlueprint(invalid);
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error('expected an invalid embedded app');
    expect(
      parsed.error.issues.some(
        (issue) =>
          issue.path.join('.') === `deck.slides.${slideIndex}.blocks.1.app.entities.0.plural`
      )
    ).toBe(true);

    const report = await validateBlueprintForAuthoring(invalid);
    expect(report.valid).toBe(false);
    expect(
      report.diagnostics.some(
        (diagnostic) =>
          diagnostic.jsonPath ===
          `$["deck"]["slides"][${slideIndex}]["blocks"][1]["app"]["entities"][0]["plural"]`
      )
    ).toBe(true);
  });
});
