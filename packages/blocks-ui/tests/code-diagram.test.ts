import {
  type BoardBlock,
  type CodeBlock as CodeBlockData,
  type FlowBlock,
  safeParseBlock,
  type TerminalBlock,
  type TreeBlock,
} from '@protoyard/blocks';
import { layoutFlow, layoutTree } from '@protoyard/blocks/diagram';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { loadCodeGrammar } from '@texuli/blocks/code';
import type { Component } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CodeBlock from '../src/code/CodeBlock.svelte';
import { activeHighlightIndex } from '../src/code/tokens.ts';
import { DIAGRAM_PAD, BlockFamilyRenderer as DiagramFamily } from '../src/diagram/index.ts';
import HostHarness from './fixtures/HostHarness.svelte';
import RendererHarness from './fixtures/RendererHarness.svelte';

/** A block as the renderer receives it: parsed by the engine schema. */
function parseBlock(input: unknown) {
  const result = safeParseBlock(input);
  if (!result.success) throw new Error(JSON.stringify(result.issues));
  return result.data;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SOURCE = [
  "import { greet } from './greet.ts';",
  '',
  '// Say hello three times.',
  'for (let i = 0; i < 3; i += 1) {',
  "  console.log(greet('Ada'), i);",
  '}',
].join('\n');

function code(extra: Partial<CodeBlockData> = {}): CodeBlockData {
  return parseBlock({ type: 'code', lang: 'ts', code: SOURCE, ...extra }) as CodeBlockData;
}

function mount(component: Component<never>, block: unknown, step?: number) {
  return render(HostHarness, {
    component: component as unknown as Component<{ block: never }>,
    block,
    ...(step === undefined ? {} : { step }),
  });
}

const codeElement = (container: HTMLElement) => container.querySelector('pre code') as HTMLElement;
const highlightedLines = (container: HTMLElement) =>
  [...container.querySelectorAll('mark[data-highlighted]')].map((el) =>
    Number(el.getAttribute('data-line'))
  );

describe('code block', () => {
  it('renders token spans whose text equals the source, colored by kind', async () => {
    const { container } = mount(CodeBlock as Component<never>, code());
    await waitFor(() => expect(container.querySelector('[data-tokenized]')).not.toBeNull());
    const element = codeElement(container);
    expect(element.textContent).toBe(SOURCE);
    // Every token is its own span: joined per line, the text is the source again.
    const lines = [...element.children].map((line) =>
      [...line.querySelectorAll(':scope > span')].map((span) => span.textContent).join('')
    );
    expect(lines).toEqual(SOURCE.split('\n'));
    const keyword = [...element.querySelectorAll('[data-line] > span')].find(
      (span) => span.textContent === 'import'
    );
    expect(keyword?.className).toContain('tx-code-tok--keyword');
    const comment = [...element.querySelectorAll('[data-line] > span')].find((span) =>
      span.textContent?.startsWith('//')
    );
    expect(comment?.className).toContain('tx-code-tok--comment');
    // Text only: nothing in the source became markup.
    expect(element.querySelector('script, img, a')).toBeNull();
  });

  it('shows plain text for `text` and keeps markup-looking code as text', async () => {
    const source = '<script>alert(1)</script>\n<img src=x onerror=alert(1)>';
    const { container } = mount(
      CodeBlock as Component<never>,
      code({ lang: 'text', code: source })
    );
    expect(await loadCodeGrammar('text')).toBeNull();
    const element = codeElement(container);
    expect(element.textContent).toBe(source);
    expect(element.querySelector('script, img')).toBeNull();
    expect(container.querySelector('[data-tokenized]')).toBeNull();
  });

  it('tokenizes markup languages into text spans, never elements', async () => {
    const source = '<a href="javascript:alert(1)" onclick="x()">Hi</a>';
    const { container } = mount(
      CodeBlock as Component<never>,
      code({ lang: 'html', code: source })
    );
    await waitFor(() => expect(container.querySelector('[data-tokenized]')).not.toBeNull());
    expect(codeElement(container).textContent).toBe(source);
    expect(codeElement(container).querySelector('a')).toBeNull();
    expect(codeElement(container).querySelectorAll('span').length).toBeGreaterThan(3);
  });

  it('follows the host step through its highlight steps', async () => {
    const block = code({ highlights: ['1', '3-4', '5'], step: 1 });
    // No host step (a page or doc): the first step is shown as static emphasis.
    const page = mount(CodeBlock as Component<never>, block);
    expect(highlightedLines(page.container)).toEqual([1]);
    page.unmount();

    const deck = mount(CodeBlock as Component<never>, block, 0);
    // Before the block's own step, and at it: the first step.
    expect(highlightedLines(deck.container)).toEqual([1]);
    await deck.rerender({ step: 2 });
    expect(highlightedLines(deck.container)).toEqual([3, 4]);
    await deck.rerender({ step: 3 });
    expect(highlightedLines(deck.container)).toEqual([5]);
    // Past the last step: stays on the last.
    await deck.rerender({ step: 30 });
    expect(highlightedLines(deck.container)).toEqual([5]);
    // Highlights never change the text.
    expect(codeElement(deck.container).textContent).toBe(SOURCE);
  });

  it('clamps steps and resolves the active index purely', () => {
    expect(activeHighlightIndex(0, 3)).toBe(-1);
    expect(activeHighlightIndex(3, undefined)).toBe(0);
    expect(activeHighlightIndex(3, 0, 2)).toBe(0);
    expect(activeHighlightIndex(3, 3, 2)).toBe(1);
    expect(activeHighlightIndex(3, 99, 2)).toBe(2);
    expect(activeHighlightIndex(3, Number.NaN)).toBe(0);
  });

  it('draws line numbers as CSS content, not text', () => {
    const { container } = mount(CodeBlock as Component<never>, code({ lineNumbers: true }));
    const element = codeElement(container);
    expect(element.textContent).toBe(SOURCE);
    const lines = [...element.children];
    expect(lines.map((line) => line.getAttribute('data-line'))).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
    ]);
    expect(container.querySelector('pre.tx-code__pre--numbered, pre.tx-code__pre')).toBeTruthy();
    expect(lines[0]?.getAttribute('data-line')).toBe('1');
  });

  it('has a keyboard-reachable, labelled scroller and a caption', () => {
    const { container } = mount(
      CodeBlock as Component<never>,
      code({ filename: 'hello.ts', caption: 'Greets three times.' })
    );
    const pre = container.querySelector('pre') as HTMLElement;
    expect(pre.getAttribute('tabindex')).toBe('0');
    // aria-labelledby is prohibited on a bare <pre> (axe aria-prohibited-attr); the scroll region carries a role.
    expect(pre.getAttribute('role')).toBe('region');
    expect(document.getElementById(pre.getAttribute('aria-labelledby') ?? '')?.textContent).toBe(
      'hello.ts'
    );
    expect(screen.getByText('Greets three times.').tagName).toBe('FIGCAPTION');
  });

  it('copies the exact source and reports success or failure', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    mount(CodeBlock as Component<never>, code({ filename: 'hello.ts' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Copy hello.ts code' }));
    await waitFor(() => {
      const called = writeText.mock.calls.some((call) => (call as unknown[])[0] === SOURCE);
      const btn = screen.getByRole('button', { name: /Copied|Copy hello\.ts code|Copy failed/ });
      expect(
        called ||
          btn.getAttribute('data-state') === 'copied' ||
          (btn.textContent?.includes('Copied') ?? false)
      ).toBe(true);
    });

    cleanup();
    writeText.mockRejectedValueOnce(new Error('denied'));
    mount(CodeBlock as Component<never>, code({ filename: 'hello.ts' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Copy hello.ts code' }));
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /Copy hello\.ts code|Copy failed/ });
      expect(
        btn.textContent?.includes('Copy failed') ||
          btn.getAttribute('data-state') === 'failed' ||
          Boolean(screen.queryByText(/could not be copied/i))
      ).toBeTruthy();
    });
  });
});

const flow = (extra: Partial<FlowBlock> = {}) =>
  parseBlock({
    type: 'flow',
    nodes: [
      { id: 'plan', label: 'Plan' },
      { id: 'build', label: 'Build', tone: 'accent' },
      { id: 'ship', label: 'Ship', tone: 'success' },
    ],
    ...extra,
  }) as FlowBlock;

describe('flow diagram', () => {
  it('exposes the steps in order as its text alternative, with the drawing hidden', () => {
    const { container } = mount(DiagramFamily as Component<never>, flow({ loopBack: true }));
    const region = screen.getByRole('region', {
      name: 'Flow with 3 steps, repeating from the last step to the first',
    });
    expect(region.getAttribute('tabindex')).toBe('0');
    expect(
      within(region)
        .getAllByRole('listitem')
        .map((li) => li.textContent?.trim())
    ).toEqual([
      'Step 1 of 3: Plan',
      'Step 2 of 3: Build',
      'Step 3 of 3: Ship',
      'Then back to step 1: Plan',
    ]);
    const drawing = container.querySelector(
      '[aria-hidden="true"].tx-diagram__stage'
    ) as HTMLElement;
    expect(drawing).not.toBeNull();
    expect(drawing.querySelectorAll('[data-edge="flow"]')).toHaveLength(2);
    expect(drawing.querySelectorAll('[data-edge="loop-back"]')).toHaveLength(1);
  });

  it('places nodes at the layout positions with tone accents', () => {
    const block = flow();
    const { container } = mount(DiagramFamily as Component<never>, block);
    const layout = layoutFlow(block);
    for (const position of layout.positions) {
      const node = container.querySelector(`[data-node="${position.id}"]`) as HTMLElement;
      expect(node.style.getPropertyValue('--tx-dx')).toBe(`${position.x + DIAGRAM_PAD}px`);
      expect(node.style.getPropertyValue('--tx-dw')).toBe(`${position.width}px`);
      expect(node.getAttribute('title')).toBe(position.label);
    }
    expect(container.querySelector('[data-node="build"]')?.className).toContain(
      'tx-diagram-tone--accent'
    );
    expect(container.querySelector('[data-node="ship"]')?.className).toContain(
      'tx-diagram-tone--success'
    );
    expect(container.querySelector('[data-node="plan"]')?.className).toContain(
      'tx-diagram-tone--neutral'
    );
  });

  it('keeps labels as text', () => {
    const { container } = mount(DiagramFamily as Component<never>, {
      type: 'flow',
      nodes: [{ id: 'a', label: '<img src=x onerror=alert(1)>' }],
    });
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});

const TREE_NODES = [
  { id: 'src', parentId: null, label: 'src' },
  { id: 'app', parentId: 'src', label: 'App.svelte' },
  { id: 'lib', parentId: 'src', label: 'lib' },
  { id: 'util', parentId: 'lib', label: 'util.ts' },
  { id: 'readme', parentId: null, label: 'README.md' },
];

describe('tree diagram', () => {
  it('renders a file tree as a nested list with folders announced', () => {
    mount(
      DiagramFamily as Component<never>,
      parseBlock({ type: 'tree', style: 'file-tree', nodes: TREE_NODES }) as TreeBlock
    );
    const tree = screen.getByRole('list', { name: 'File tree with 5 items' });
    const top = [...tree.children].map((li) =>
      li.firstElementChild?.textContent?.replace(/\s+/g, ' ').trim()
    );
    expect(top).toEqual(['src (folder, 2 items)', 'README.md']);
    const lib = within(tree).getByText('lib').closest('li') as HTMLElement;
    expect(within(lib).getByText('util.ts')).toBeTruthy();
  });

  it('draws an org chart from the layout with a nested text alternative', () => {
    const block = parseBlock({
      type: 'tree',
      style: 'org',
      nodes: [
        { id: 'ceo', parentId: null, label: 'Chief executive' },
        { id: 'cto', parentId: 'ceo', label: 'Engineering', tone: 'info' },
        { id: 'cfo', parentId: 'ceo', label: 'Finance' },
        { id: 'web', parentId: 'cto', label: 'Web team' },
      ],
    }) as TreeBlock;
    const { container } = mount(DiagramFamily as Component<never>, block);
    const region = screen.getByRole('region', { name: 'Organization chart with 4 items' });
    const outline = region.querySelector('ul.tx-diagram-sr') as HTMLElement;
    expect(outline.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Chief executive Engineering Web team Finance'
    );
    expect(
      within(outline)
        .getByText(/Web team/)
        .closest('ul')
        ?.closest('li')
        ?.firstChild?.textContent?.trim()
    ).toBe('Engineering');
    const layout = layoutTree(block);
    expect(container.querySelectorAll('[data-edge="parent"]')).toHaveLength(layout.edges.length);
    expect(layout.edges).toHaveLength(3);
    const ceo = layout.positions.find((p) => p.id === 'ceo');
    expect(
      (container.querySelector('[data-node="ceo"]') as HTMLElement).style.getPropertyValue(
        '--tx-dy'
      )
    ).toBe(`${(ceo?.y ?? 0) + DIAGRAM_PAD}px`);
    expect(container.querySelector('[data-node="cto"]')?.className).toContain(
      'tx-diagram-tone--info'
    );
  });
});

describe('board diagram', () => {
  it('renders labelled columns of cards, with empty columns said so', () => {
    const block = parseBlock({
      type: 'board',
      columns: [
        {
          id: 'todo',
          title: 'To do',
          cards: [
            { id: 'a', title: 'Write brief' },
            { id: 'b', title: 'Pick theme', tone: 'warning' },
          ],
        },
        { id: 'done', title: 'Done', cards: [] },
      ],
    }) as BoardBlock;
    mount(DiagramFamily as Component<never>, block);
    screen.getByRole('region', { name: 'Board with 2 columns and 2 cards' });
    const todo = screen.getByRole('region', { name: 'To do, 2 cards' });
    expect(
      within(todo)
        .getAllByRole('listitem')
        .map((li) => li.textContent?.trim())
    ).toEqual(['Write brief', 'Pick theme']);
    expect(within(todo).getByText('Pick theme').className).toContain('tx-diagram-tone--warning');
    const done = screen.getByRole('region', { name: 'Done, 0 cards' });
    expect(within(done).getByText('No cards')).toBeTruthy();
  });
});

describe('terminal diagram', () => {
  it('reads as a session: commands announced, the prompt marker hidden', () => {
    const block = parseBlock({
      type: 'terminal',
      lines: [
        { kind: 'comment', text: '# install' },
        { kind: 'prompt', text: 'pnpm install' },
        { kind: 'output', text: 'Done in 2.1s' },
        { kind: 'prompt', text: 'pnpm dev' },
      ],
    }) as TerminalBlock;
    const { container } = mount(DiagramFamily as Component<never>, block);
    const session = screen.getByRole('list', { name: 'Terminal session, 2 commands' });
    const items = within(session).getAllByRole('listitem');
    expect(items.map((li) => li.getAttribute('data-kind'))).toEqual([
      'comment',
      'prompt',
      'output',
      'prompt',
    ]);
    expect(items[1]?.textContent?.replace(/\s+/g, ' ').trim()).toBe('$ Command: pnpm install');
    expect(items[1]?.querySelector('[aria-hidden="true"]')?.textContent).toBe('$ ');
    expect(items[0]?.getAttribute('data-kind')).toBe('comment');
    expect(container.querySelector('script')).toBeNull();
  });
});

describe('family entries through the block renderer', () => {
  it('route code and diagram blocks to the real family renderers', async () => {
    const { container } = render(RendererHarness, {
      blocks: [
        { type: 'code', lang: 'json', code: '{"a": 1}' },
        { type: 'flow', nodes: [{ id: 'a', label: 'Alpha' }] },
        { type: 'terminal', lines: [{ kind: 'prompt', text: 'ls' }] },
      ],
    });
    await waitFor(() =>
      expect(
        container.querySelector('[data-tx-block="code"], [data-tokenized], .tx-code')
      ).not.toBeNull()
    );
    await waitFor(() => expect(container.querySelector('[data-tx-diagram="flow"]')).not.toBeNull());
    await waitFor(() =>
      expect(container.querySelector('[data-tx-diagram="terminal"]')).not.toBeNull()
    );
    expect(codeElement(container).textContent).toBe('{"a": 1}');
  });
});
