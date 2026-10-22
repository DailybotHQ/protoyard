// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderBlockCatalogMarkdown } from '../src/catalog/index.ts';

const BEGIN =
  '<!-- BEGIN GENERATED BLOCK CATALOG: keep this region in sync with renderBlockCatalogMarkdown(). -->';
const END = '<!-- END GENERATED BLOCK CATALOG -->';

describe('docs/BLOCKS.md generated catalog region', () => {
  it('matches the current BLOCK_CATALOG renderer exactly', () => {
    const document = readFileSync(new URL('../../../docs/BLOCKS.md', import.meta.url), 'utf8');
    expect(document.split(BEGIN)).toHaveLength(2);
    expect(document.split(END)).toHaveLength(2);

    const start = document.indexOf(BEGIN) + BEGIN.length + 1;
    const end = document.indexOf(END);
    expect(end).toBeGreaterThan(start);
    expect(document.slice(start, end)).toBe(renderBlockCatalogMarkdown());
  });
});
