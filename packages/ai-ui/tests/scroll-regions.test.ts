/**
 * Scrollable `<pre>` regions must be keyboard-reachable (axe
 * `scrollable-region-focusable` / WCAG 2.1.1), matching ui-kit CodeBlock:
 * `tabindex="0"` and an accessible name.
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
    const pre = screen.getByLabelText('ts code');
    expect(pre.tagName).toBe('PRE');
    expect(pre.getAttribute('tabindex')).toBe('0');
    expect(pre.textContent).toContain('const answer = 42;');
    // Unlabeled lang falls back to "code".
    cleanup();
    render(RichAnswer, { content: '```\nplain\n```' });
    expect(screen.getByLabelText('code code').getAttribute('tabindex')).toBe('0');
  });

  it('ChartAnswer raw-data pre is focusable and named when the spec is invalid', () => {
    const text = '{"kind":"bar","title":"broken","labels":["a"],"series":[]}';
    render(ChartAnswer, { text });
    const pre = screen.getByLabelText('Chart data');
    expect(pre.tagName).toBe('PRE');
    expect(pre.getAttribute('tabindex')).toBe('0');
    expect(pre.textContent).toBe(text);
    expect(pre.className).toMatch(/overflow-auto/);
  });

  it('CanvasPanel code document pre is focusable and named from the language', () => {
    render(CanvasPanel, {
      document: {
        title: 'Snippet',
        kind: 'code',
        language: 'TypeScript',
        content: 'export const n = 1;\n'.repeat(40),
      },
    });
    const pre = screen.getByLabelText('TypeScript canvas code');
    expect(pre.tagName).toBe('PRE');
    expect(pre.getAttribute('tabindex')).toBe('0');
    expect(pre.className).toMatch(/overflow-auto/);
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

  it('every scrollable pre in these surfaces is named and tabbable', () => {
    render(RichAnswer, { content: '```python\nprint("hi")\n```' });
    render(ChartAnswer, { text: 'not-json' });
    render(CanvasPanel, {
      document: { title: 'A', kind: 'code', content: 'x = 1' },
    });
    render(MarkdownPreview, { source: '```\nblock\n```' });

    const pres = Array.from(document.querySelectorAll('pre'));
    expect(pres.length).toBeGreaterThanOrEqual(4);
    for (const pre of pres) {
      expect(pre.getAttribute('tabindex'), pre.outerHTML).toBe('0');
      expect(pre.getAttribute('aria-label'), pre.outerHTML).toBeTruthy();
    }
  });
});
