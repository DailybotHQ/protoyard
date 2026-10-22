import { cleanup, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BlockHost from '../src/block-host/BlockHost.svelte';
import { resolvePageBlock } from '../src/block-host/load-family.ts';

const mockState = vi.hoisted(() => {
  let releaseText: (() => void) | undefined;
  return {
    textLoads: 0,
    textGate: new Promise<void>((resolve) => {
      releaseText = resolve;
    }),
    releaseText: () => releaseText?.(),
  };
});

vi.mock('@protoyard/blocks-ui/text', async () => {
  mockState.textLoads += 1;
  await mockState.textGate;
  return {
    BlockFamilyRenderer: (await import('./fixtures/MockFamilyRenderer.svelte')).default,
  };
});

vi.mock('@protoyard/blocks-ui/media', async () => ({
  BlockFamilyRenderer: (await import('./fixtures/MockFamilyRenderer.svelte')).default,
}));
vi.mock('@protoyard/blocks-ui/data', async () => ({
  BlockFamilyRenderer: (await import('./fixtures/MockFamilyRenderer.svelte')).default,
}));
vi.mock('@protoyard/blocks-ui/structure', async () => ({
  BlockFamilyRenderer: (await import('./fixtures/MockFamilyRenderer.svelte')).default,
}));
vi.mock('@protoyard/blocks-ui/code', async () => ({
  BlockFamilyRenderer: (await import('./fixtures/MockFamilyRenderer.svelte')).default,
}));
vi.mock('@protoyard/blocks-ui/diagram', async () => ({
  BlockFamilyRenderer: (await import('./fixtures/MockFamilyRenderer.svelte')).default,
}));
vi.mock('@protoyard/blocks-ui/interactive', async () => ({
  BlockFamilyRenderer: (await import('./fixtures/MockFamilyRenderer.svelte')).default,
}));
vi.mock('@protoyard/blocks-ui/map', async () => ({
  BlockFamilyRenderer: (await import('./fixtures/MockFamilyRenderer.svelte')).default,
}));
vi.mock('@protoyard/blocks-ui/embed', async () => ({
  BlockFamilyRenderer: (await import('./fixtures/MockFamilyRenderer.svelte')).default,
}));

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  mockState.textLoads = 0;
});

describe('resolvePageBlock', () => {
  it('routes heading and text to the text family', async () => {
    mockState.releaseText();
    const heading = await resolvePageBlock({
      type: 'heading',
      text: 'Hello',
      level: 2,
    });
    expect(heading.kind).toBe('render');
    if (heading.kind === 'render') {
      expect(heading.family).toBe('text');
      expect(heading.block.type).toBe('heading');
    }

    const text = await resolvePageBlock({
      type: 'text',
      markdown: 'Rich **text** body',
    });
    expect(text.kind).toBe('render');
    if (text.kind === 'render') expect(text.block.type).toBe('text');
  });

  it('returns unknown for invalid or unsupported shapes', async () => {
    const bad = await resolvePageBlock({ type: 'not-a-block', html: '<b>x</b>' });
    expect(bad.kind).toBe('unknown');

    const empty = await resolvePageBlock(null);
    expect(empty.kind).toBe('unknown');
  });
});

describe('BlockHost', () => {
  it('shows loading then renders heading and rich-text blocks', async () => {
    // Fresh gate for this suite path — release immediately after first paint path
    mockState.releaseText();
    const heading = render(BlockHost, {
      props: { block: { type: 'heading', text: 'Welcome', level: 1 } },
    });
    await waitFor(() => {
      expect(heading.container.querySelector('[data-py-mock-family]')).toBeTruthy();
    });
    expect(heading.container.querySelector('[data-block-type="heading"]')).toBeTruthy();
    expect(heading.container.querySelector('[data-py-block-family="text"]')).toBeTruthy();
    heading.unmount();

    const text = render(BlockHost, {
      props: { block: { type: 'text', markdown: 'Hello **world**' } },
    });
    await waitFor(() => {
      expect(text.container.querySelector('[data-block-type="text"]')).toBeTruthy();
    });
    // No raw HTML injection attributes in the host tree
    expect(text.container.innerHTML).not.toMatch(/\{@html/);
  });

  it('shows a safe placeholder for unknown block types', async () => {
    mockState.releaseText();
    const view = render(BlockHost, {
      props: { block: { type: 'mystery-widget', payload: true } },
    });
    await waitFor(() => {
      expect(view.container.querySelector('[data-py-unknown-block]')).toBeTruthy();
    });
    expect(view.getByText('Unsupported block')).toBeTruthy();
    expect(view.container.textContent).toMatch(/mystery-widget|could not be read|newer Protoyard/i);
  });

  it('does not statically import the blocks-ui barrel from the host module graph', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const source = readFileSync(join(root, 'src/block-host/BlockHost.svelte'), 'utf8');
    expect(source).not.toMatch(/from ['"]@protoyard\/blocks-ui['"]/);
    expect(source).not.toMatch(/\{@html/);
    const loader = readFileSync(join(root, 'src/block-host/load-family.ts'), 'utf8');
    expect(loader).toMatch(/@protoyard\/blocks-ui\/text/);
    expect(loader).not.toMatch(/from ['"]@protoyard\/blocks-ui['"]/);
  });
});
