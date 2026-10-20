import { describe, expect, it } from 'vitest';
import { getPublicDocs, renderMarkdown, rewriteDocLink } from '../src/lib/docs/index.ts';

describe('public documentation pages', () => {
  it('loads only the explicitly public guide set with stable filename slugs', () => {
    const docs = getPublicDocs();

    expect(docs.length).toBeGreaterThan(0);
    expect(docs.map((doc) => doc.slug)).toEqual(expect.arrayContaining(['player', 'skill']));
    expect(docs.every((doc) => doc.slug === doc.filename.replace(/\.md$/i, '').toLowerCase())).toBe(
      true
    );
    expect(docs.every((doc) => doc.title && doc.html)).toBe(true);
    // Lead decision: user-facing guides are public; contributor docs are not.
    expect(docs.some((doc) => doc.filename === 'SECURITY.md')).toBe(true);
    for (const internal of [
      'ARCHITECTURE.md',
      'DECISIONS.md',
      'TESTING_GUIDE.md',
      'PERFORMANCE.md',
    ]) {
      expect(
        docs.some((doc) => doc.filename === internal),
        internal
      ).toBe(false);
    }
  });

  it('rewrites public guide links with anchors and configured base paths', () => {
    expect(rewriteDocLink('PLAYER.md', 'SKILL.md#trust', '/preview/')).toBe(
      '/preview/docs/skill/#trust'
    );
    expect(rewriteDocLink('PLAYER.md', 'SKILL.md#trust')).toBe('/docs/skill/#trust');
    expect(rewriteDocLink('QUICK.md', '../packages/player/README.md#embed')).toBe(
      'https://github.com/DailybotHQ/protoyard/blob/main/packages/player/README.md#embed'
    );
  });

  it('renders markdown structure while escaping raw HTML and keeping code inert', () => {
    const rendered = renderMarkdown(
      [
        '# Safe title',
        '',
        '## Repeat',
        '',
        '## Repeat',
        '',
        '<script>alert(1)</script> [unsafe](javascript:alert(1))',
        '',
        '```html',
        '<img src=x onerror=alert(1)>',
        '```',
        '',
        '| Name | Value |',
        '| --- | --- |',
        '| Example | `safe` |',
      ].join('\n'),
      'PLAYER.md'
    );

    expect(rendered.title).toBe('Safe title');
    // GitHub-compatible ids: repeated headings are numbered -1, -2, …
    expect(rendered.headings.map(({ id }) => id)).toEqual(['safe-title', 'repeat', 'repeat-1']);
    expect(rendered.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(rendered.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).not.toContain('<img');
    expect(rendered.html).not.toContain('href="javascript:');
    expect(rendered.html).toContain('<table>');
  });

  it('rejects unsafe and escaping relative links', () => {
    expect(rewriteDocLink('PLAYER.md', 'javascript:alert(1)')).toBeNull();
    expect(rewriteDocLink('PLAYER.md', '//example.com/path')).toBeNull();
    expect(rewriteDocLink('PLAYER.md', '../../../../outside.md')).toBeNull();
  });
});
