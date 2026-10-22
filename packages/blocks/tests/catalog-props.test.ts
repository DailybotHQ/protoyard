// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { BLOCK_CATALOG, renderBlockCatalogMarkdown } from '../src/catalog/index.ts';
import { BLOCK_BASE_PROPS, blockProps } from '../src/catalog/props.ts';
import { BLOCK_TYPES, type BlockType, safeParseBlock } from '../src/index.ts';

describe('block reference props', () => {
  it.each(BLOCK_TYPES)('%s: lists real props, with every required one', (type) => {
    const props = blockProps(type as BlockType);
    const example = BLOCK_CATALOG[type as BlockType].exampleMinimal as Record<string, unknown>;
    expect(props.length).toBeGreaterThan(0);
    expect(props.some((prop) => prop.name === 'type')).toBe(false);
    for (const prop of props) {
      expect(prop.type.length).toBeGreaterThan(0);
      // A required prop is present in the minimal example, which the schema accepts.
      if (prop.required)
        expect(Object.hasOwn(example, prop.name), `${type}.${prop.name}`).toBe(true);
    }
    expect(safeParseBlock(example).issues).toEqual([]);
    // Removing any listed required prop makes the minimal example invalid.
    for (const prop of props.filter((p) => p.required)) {
      const { [prop.name]: _dropped, ...rest } = example;
      expect(safeParseBlock(rest).success, `${type} without ${prop.name}`).toBe(false);
    }
  });

  it('keeps shared base fields out of per-type lists unless a type requires them', () => {
    expect(blockProps('heading').map((prop) => prop.name)).not.toEqual(
      expect.arrayContaining([...BLOCK_BASE_PROPS])
    );
    expect(blockProps('poll').find((prop) => prop.name === 'id')).toEqual({
      name: 'id',
      required: true,
      type: 'string',
    });
    // A counter's own `step` is its increment, not the shared fragment step.
    expect(blockProps('counter').some((prop) => prop.name === 'step')).toBe(true);
  });

  it('summarizes enums, nested objects and recursive blocks', () => {
    const heading = Object.fromEntries(blockProps('heading').map((prop) => [prop.name, prop.type]));
    expect(heading.align).toBe('"start" | "center"');
    const list = Object.fromEntries(blockProps('list').map((prop) => [prop.name, prop.type]));
    expect(list.items).toBe('{ text; icon?; done? }[]');
    const columns = Object.fromEntries(blockProps('columns').map((prop) => [prop.name, prop.type]));
    expect(columns.columns).toBe('block[][]');
    expect(blockProps('icon').find((prop) => prop.name === 'icon')?.type).toMatch(
      /^enum \(\d+ values\)$/
    );
  });

  it('renders props and a minimal example for every type', () => {
    const markdown = renderBlockCatalogMarkdown();
    expect(markdown.match(/^\*\*Props\*\*$/gm)).toHaveLength(BLOCK_TYPES.length);
    expect(markdown.match(/^\*\*Minimal example\*\*$/gm)).toHaveLength(BLOCK_TYPES.length);
    expect(markdown).toContain('- `text`: string');
    expect(markdown).toContain('"type": "counter"');
    // Pipes inside table-free bullet lists are escaped for Markdown renderers.
    expect(markdown).toContain('`align?`: "start" \\| "center"');
  });
});
