/**
 * Scrollable code regions must be keyboard-reachable (axe
 * `scrollable-region-focusable` / WCAG 2.1.1): `tabindex="0"` and an
 * accessible name. ai-ui renders code with Texuli's block `Code`, whose inner
 * `<code>` is the scrolling element, so it carries `role="region"`, the
 * tabindex and the name; views-ui's MarkdownPreview still scrolls a `<pre>`.
 */
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { MarkdownPreview } from '../../views-ui/src/editor/index.ts';
import CanvasPanel from '../src/components/CanvasPanel.svelte';
import ChartAnswer from '../src/components/ChartAnswer.svelte';
import RichAnswer from '../src/components/RichAnswer.svelte';

afterEach(() => cleanup());

describe('scrollable code regions are keyboard-reachable', () => {
  it('RichAnswer code fences expose tabindex and a language name', () => {
    render(RichAnswer, {
      content: 'Intro\n\n```ts\nconst answer = 42;\n```\n\nOutro',
    });
    const code = screen.getByRole('region', { name: 'ts code' });
    expect(code.tagName).toBe('CODE');
    expect(code.closest('pre')).not.toBeNull();
    expect(code.getAttribute('tabindex')).toBe('0');
    expect(code.textContent).toContain('const answer = 42;');
    // Unlabeled lang falls back to "code".
    cleanup();
    render(RichAnswer, { content: '```\nplain\n```' });
    expect(screen.getByRole('region', { name: 'code code' }).getAttribute('tabindex')).toBe('0');
  });

  it('ChartAnswer raw-data block is focusable and named when the spec is invalid', () => {
    const text = '{"kind":"bar","title":"broken","labels":["a"],"series":[]}';
    render(ChartAnswer, { text });
    const code = screen.getByLabelText('Chart data');
    expect(code.tagName).toBe('CODE');
    expect(code.getAttribute('role')).toBe('region');
    expect(code.getAttribute('tabindex')).toBe('0');
    expect(code.textContent).toBe(text);
    expect(code.className).toMatch(/overflow-auto/);
  });

  it('CanvasPanel code document is focusable and named from the language', () => {
    render(CanvasPanel, {
      document: {
        title: 'Snippet',
        kind: 'code',
        language: 'TypeScript',
        content: 'export const n = 1;\n'.repeat(40),
      },
    });
    const code = screen.getByRole('region', { name: 'TypeScript canvas code' });
    expect(code.tagName).toBe('CODE');
    expect(code.getAttribute('tabindex')).toBe('0');
    expect(code.className).toMatch(/overflow-auto/);
  });

  it('MarkdownPreview code fences are focusable and named', () => {
    render(MarkdownPreview, {
      source: '# Title\n\n```js\nconsole.log(1)\n```\n',
      label: 'Doc preview',
    });
    const pre = screen.getByLabelText('Code block');
    expect(pre.tagName).toBe('PRE');
    expect(pre.getAttribute('tabindex')).toBe('0');
    expect(pre.textContent).toContain('console.log(1)');
    expect(pre.className).toMatch(/overflow-x-auto/);
  });

  it('every scrollable code region in these surfaces is named and tabbable', () => {
    render(RichAnswer, { content: '```python\nprint("hi")\n```' });
    render(ChartAnswer, { text: 'not-json' });
    render(CanvasPanel, {
      document: { title: 'A', kind: 'code', content: 'x = 1' },
    });
    render(MarkdownPreview, { source: '```\nblock\n```' });

    // Texuli's block Code scrolls its inner <code>; its <pre> wrapper does not scroll.
    const regions = Array.from(
      document.querySelectorAll(
        'pre:not([data-tx-code-block]), [data-tx-code][data-variant="block"]'
      )
    );
    expect(regions.length).toBeGreaterThanOrEqual(4);
    for (const region of regions) {
      expect(region.getAttribute('tabindex'), region.outerHTML).toBe('0');
      expect(region.getAttribute('aria-label'), region.outerHTML).toBeTruthy();
    }
  });
});
