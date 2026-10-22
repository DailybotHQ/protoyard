// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  BLOCK_CATALOG,
  BLOCK_CATALOG_LIST,
  getBlockCatalogEntry,
  MINIMAL_EXAMPLES,
  RICH_EXAMPLES,
  renderBlockCatalogMarkdown,
  validateBlocksForAuthoring,
} from '../src/catalog/index.ts';
import { BLOCK_TYPE_FAMILY, BLOCK_TYPES, type BlockType, safeParseBlock } from '../src/index.ts';

describe('BLOCK_CATALOG completeness', () => {
  it('has one entry per BlockSchema type with matching family', () => {
    expect(Object.keys(BLOCK_CATALOG).sort()).toEqual([...BLOCK_TYPES].sort());
    expect(BLOCK_CATALOG_LIST).toHaveLength(BLOCK_TYPES.length);
    for (const type of BLOCK_TYPES) {
      const entry = BLOCK_CATALOG[type];
      expect(entry.type).toBe(type);
      expect(entry.family).toBe(BLOCK_TYPE_FAMILY[type]);
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.useWhen.length).toBeGreaterThan(0);
      expect(entry.dontUseWhen.length).toBeGreaterThan(0);
      expect(entry.limits.length).toBeGreaterThan(0);
      expect(entry.a11y.length).toBeGreaterThan(0);
      expect(getBlockCatalogEntry(type)).toBe(entry);
    }
  });

  it.each(BLOCK_TYPES)('parses minimal and rich examples for %s', (type: BlockType) => {
    const entry = BLOCK_CATALOG[type];
    const minimal = safeParseBlock(entry.exampleMinimal);
    const rich = safeParseBlock(entry.exampleRich);
    expect(minimal.issues, JSON.stringify(minimal.issues)).toEqual([]);
    expect(rich.issues, JSON.stringify(rich.issues)).toEqual([]);
    expect(minimal.data?.type).toBe(type);
    expect(rich.data?.type).toBe(type);
    expect(MINIMAL_EXAMPLES[type]).toEqual(entry.exampleMinimal);
    expect(RICH_EXAMPLES[type]).toEqual(entry.exampleRich);
  });
});

describe('validateBlocksForAuthoring', () => {
  it('accepts a valid block and a valid list', () => {
    expect(validateBlocksForAuthoring(MINIMAL_EXAMPLES.heading)).toEqual({
      valid: true,
      diagnostics: [],
    });
    const list = [MINIMAL_EXAMPLES.text, MINIMAL_EXAMPLES.divider];
    expect(validateBlocksForAuthoring(list).valid).toBe(true);
  });

  it('returns jsonPath and hint for schema failures', () => {
    const result = validateBlocksForAuthoring({ type: 'heading', text: '' });
    expect(result.valid).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    const first = result.diagnostics[0]!;
    expect(first.jsonPath).toMatch(/^\$/);
    expect(first.message.length).toBeGreaterThan(0);
    expect(first.hint.length).toBeGreaterThan(0);
    expect(first.code).toBeTruthy();
  });

  it('flags unknown block types with a typed diagnostic', () => {
    const result = validateBlocksForAuthoring({ type: 'marquee', text: 'nope' });
    expect(result.valid).toBe(false);
    expect(result.diagnostics[0]?.code).toBe('unknown-type');
    expect(result.diagnostics[0]?.jsonPath).toBe('$["type"]');
    expect(result.diagnostics[0]?.hint).toContain('heading');
  });

  it('prefixes list paths for nested issues', () => {
    const result = validateBlocksForAuthoring([
      { type: 'heading', text: 'Ok' },
      { type: 'cta', actions: [{ label: 'X', href: 'javascript:alert(1)' }] },
    ]);
    expect(result.valid).toBe(false);
    const hrefIssue = result.diagnostics.find((d) => d.jsonPath.includes('href'));
    expect(hrefIssue?.jsonPath.startsWith('$[1]')).toBe(true);
    expect(hrefIssue?.hint.toLowerCase()).toContain('http');
  });
});

describe('renderBlockCatalogMarkdown', () => {
  it('lists every type once for docs/BLOCKS.md', () => {
    const md = renderBlockCatalogMarkdown();
    expect(md).toContain('# Blocks reference');
    for (const type of BLOCK_TYPES) {
      expect(md).toContain(`\`${type}\``);
    }
    expect(md).toContain('Generated from @protoyard/blocks/catalog');
  });
});
