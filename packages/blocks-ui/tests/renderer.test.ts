import type { BlockType } from '@protoyard/blocks';
import { MINIMAL_EXAMPLES } from '@protoyard/blocks/catalog';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBlockFamily } from '../src/registry.ts';
import RendererHarness from './fixtures/RendererHarness.svelte';
import RendererMock from './fixtures/RendererMock.svelte';

const lazyText = vi.hoisted(() => {
  let release: (() => void) | undefined;
  return {
    loads: {
      text: 0,
      media: 0,
      data: 0,
      structure: 0,
      code: 0,
      diagram: 0,
      interactive: 0,
      map: 0,
      embed: 0,
    },
    gate: new Promise<void>((resolve) => {
      release = resolve;
    }),
    release: () => release?.(),
  };
});

vi.mock('../src/text/index.ts', async () => {
  lazyText.loads.text += 1;
  await lazyText.gate;
  return { BlockFamilyRenderer: RendererMock };
});
vi.mock('../src/media/index.ts', async () => {
  lazyText.loads.media += 1;
  return { BlockFamilyRenderer: RendererMock };
});
vi.mock('../src/data/index.ts', async () => {
  lazyText.loads.data += 1;
  return { BlockFamilyRenderer: RendererMock };
});
vi.mock('../src/structure/index.ts', async () => {
  lazyText.loads.structure += 1;
  return { BlockFamilyRenderer: RendererMock };
});
vi.mock('../src/code/index.ts', async () => {
  lazyText.loads.code += 1;
  return { BlockFamilyRenderer: RendererMock };
});
vi.mock('../src/diagram/index.ts', async () => {
  lazyText.loads.diagram += 1;
  return { BlockFamilyRenderer: RendererMock };
});
vi.mock('../src/interactive/index.ts', async () => {
  lazyText.loads.interactive += 1;
  return { BlockFamilyRenderer: RendererMock };
});
vi.mock('../src/map/index.ts', async () => {
  lazyText.loads.map += 1;
  return { BlockFamilyRenderer: RendererMock };
});
vi.mock('../src/embed/index.ts', async () => {
  lazyText.loads.embed += 1;
  return { BlockFamilyRenderer: RendererMock };
});

const REPRESENTATIVES: readonly BlockType[] = [
  'heading',
  'image',
  'stat',
  'timeline',
  'code',
  'tabs',
  'map',
  'embed-app',
];

describe('BlockRenderer', () => {
  beforeEach(() => {
    Object.keys(lazyText.loads).forEach((family) => {
      lazyText.loads[family as keyof typeof lazyText.loads] = 0;
    });
  });

  afterEach(() => cleanup());

  it('validates and renders a mixed list through lazily loaded family subpaths', async () => {
    const blocks = REPRESENTATIVES.map((type) => MINIMAL_EXAMPLES[type]);
    const { container } = render(RendererHarness, {
      props: { blocks },
    });

    await waitFor(() => expect(lazyText.loads.text).toBe(1));
    await waitFor(() => {
      expect(lazyText.loads.media).toBe(1);
      expect(lazyText.loads.data).toBe(1);
      expect(lazyText.loads.structure).toBe(1);
      expect(lazyText.loads.code).toBe(1);
      expect(lazyText.loads.interactive).toBe(1);
      expect(lazyText.loads.map).toBe(1);
      expect(lazyText.loads.embed).toBe(1);
    });
    expect(lazyText.loads.diagram).toBe(0);
    expect(await loadBlockFamily('diagram')).toBe(RendererMock);
    expect(lazyText.loads.diagram).toBe(1);
    expect(lazyText.loads.text).toBe(1);
    expect(lazyText.loads.media).toBe(1);
    expect(lazyText.loads.data).toBe(1);
    expect(lazyText.loads.structure).toBe(1);
    expect(lazyText.loads.code).toBe(1);
    expect(lazyText.loads.interactive).toBe(1);
    expect(lazyText.loads.map).toBe(1);
    expect(lazyText.loads.embed).toBe(1);
    expect(lazyText.loads.diagram).toBe(1);
    expect(await screen.findByRole('status', { name: 'Loading block' })).toBeTruthy();
    lazyText.release();

    await waitFor(() =>
      expect(screen.getAllByTestId('rendered-block')).toHaveLength(blocks.length)
    );
    expect(container.querySelectorAll('[data-block-type]')).toHaveLength(blocks.length);
    expect(
      container.querySelector('[data-block-type="heading"]')?.getAttribute('data-density')
    ).toBe('spacious');
    expect(
      container.querySelector('[data-block-type="heading"]')?.getAttribute('data-canvas-mode')
    ).toBe('slide');
    expect(container.querySelector('[data-block-type="heading"]')?.getAttribute('data-step')).toBe(
      '2'
    );
  });

  it('shows a bounded note for unknown and invalid blocks without rendering their content', async () => {
    render(RendererHarness, {
      props: {
        blocks: [
          { type: 'new-family', payload: '<script>alert(1)</script>' },
          { type: 'heading', text: 12 },
        ],
      },
    });

    const notes = await screen.findAllByRole('note');
    expect(notes).toHaveLength(2);
    expect(notes.every((note) => note.textContent === 'This block needs a newer Protoyard.')).toBe(
      true
    );
    expect(document.querySelector('script')).toBeNull();
  });

  it('shows an empty-state note for an empty block list', () => {
    render(RendererHarness, { props: { blocks: [] } });
    expect(screen.getByRole('note').textContent).toBe('There are no blocks to display.');
  });
});
