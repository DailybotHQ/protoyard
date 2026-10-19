import { describe, expect, it } from 'vitest';
import pkg from '../package.json' with { type: 'json' };
import * as root from '../src/index.ts';

/**
 * `@protoyard/ai/markdown` lets other kits (the views editor, review comments)
 * reuse the one audited safe-markdown parser without the AI engine (ADR-022).
 * Resolve it by its package specifier, exactly as a consumer would.
 */
describe('@protoyard/ai/markdown subpath', () => {
  it('is declared in the package exports', () => {
    // Vite resolves a package importing itself without checking `exports`, so
    // the dynamic imports below alone would not catch a missing entry.
    expect((pkg.exports as Record<string, string>)['./markdown']).toBe('./src/markdown.ts');
  });

  it('resolves by package name and exposes the parser surface', async () => {
    const markdown = await import('@protoyard/ai/markdown');
    expect(Object.keys(markdown).sort()).toEqual(
      ['MARKDOWN_MAX_LENGTH', 'inlineText', 'parseMarkdown', 'safeHref', 'safeImageSrc'].sort()
    );
  });

  it('is the same module the root entry re-exports', async () => {
    const markdown = await import('@protoyard/ai/markdown');
    expect(markdown.parseMarkdown).toBe(root.parseMarkdown);
    expect(markdown.safeHref).toBe(root.safeHref);
  });

  it('keeps unsafe links inert through the subpath', async () => {
    const { parseMarkdown, safeHref } = await import('@protoyard/ai/markdown');
    expect(safeHref('javascript:alert(1)')).toBeNull();
    const doc = parseMarkdown('<script>alert(1)</script> [x](javascript:alert(1))');
    expect(JSON.stringify(doc)).not.toContain('javascript:');
  });
});
