import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BLOCK_TYPE_FAMILY,
  type Block,
  type BlockType,
  type CodeBlock as CodeBlockData,
  type PollBlock,
  safeParseBlock,
} from '@protoyard/blocks';
import { BLOCK_CATALOG, MINIMAL_EXAMPLES } from '@protoyard/blocks/catalog';
import {
  type BlockStateHost,
  createMemoryBlockStateHost,
  pollResults,
  readBlockState,
  stateKey,
} from '@protoyard/blocks/interactive';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { type Component, tick } from 'svelte';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  familyLoaders as pageFamilyLoaders,
  resolvePageBlock,
} from '../../pages-ui/src/block-host/load-family.ts';
import CodeBlock from '../src/code/CodeBlock.svelte';
import { BlockFamilyRenderer as DiagramFamily } from '../src/diagram/index.ts';
import { type MountEmbed } from '../src/host.ts';
import MediaFamilyRenderer from '../src/media/MediaFamilyRenderer.svelte';
import { blockRendererRegistry, resolveBlockRenderer } from '../src/registry.ts';
import TextFamilyRenderer from '../src/text/TextFamilyRenderer.svelte';
import EmbedHarness from './fixtures/EmbedHarness.svelte';
import HostHarness from './fixtures/HostHarness.svelte';
import InteractiveHarness from './fixtures/InteractiveHarness.svelte';
import StructureHarness from './fixtures/StructureHarness.svelte';

/*
 * Every block type in the catalog reaches a real renderer, through both hosts
 * that route blocks: blocks-ui's own registry (BlockRenderer, decks) and the
 * pages-ui BlockHost loader (pages and docs). A comparison on the Tidewater
 * landing page once showed "Unsupported block": the mapping was right, but a
 * family chunk that failed to download was reported as unsupported. These
 * tests pin both: the routing is complete, and a failed download is retried
 * and then surfaces as a load error, never as an unsupported block.
 */

afterEach(cleanup);

// The first import of each family transforms its whole module graph; do it once,
// with a generous timeout, so per-type tests measure routing and not a cold start.
beforeAll(async () => {
  await Promise.all(Object.values(pageFamilyLoaders).map((load) => load()));
}, 180_000);

/** What a family dispatcher or host prints when it has no renderer for a block. */
const FALLBACK =
  /needs a newer Protoyard|not available yet|not supported yet|could not be displayed|Unsupported block/i;

const CATALOG_TYPES = Object.keys(BLOCK_CATALOG) as BlockType[];

describe('every catalog block type resolves to a renderer', () => {
  it('the blocks-ui registry routes every type to its declared family', () => {
    for (const type of CATALOG_TYPES) {
      expect(blockRendererRegistry[type]?.family).toBe(BLOCK_TYPE_FAMILY[type]);
      expect(pageFamilyLoaders[BLOCK_TYPE_FAMILY[type]]).toBeTypeOf('function');
    }
  });

  it('every minimal example renders through its family without a fallback', async () => {
    for (const type of CATALOG_TYPES) {
      const example = BLOCK_CATALOG[type].exampleMinimal;
      const viaRegistry = await resolveBlockRenderer(example);
      expect(viaRegistry.kind, `${type} via blocks-ui`).toBe('render');
      const viaPages = await resolvePageBlock(example);
      expect(viaPages.kind, `${type} via pages-ui BlockHost`).toBe('render');
      if (viaRegistry.kind !== 'render') continue;

      const view = render(viaRegistry.component, { props: { block: viaRegistry.block } });
      expect(view.container.textContent ?? '').not.toMatch(FALLBACK);
      expect(view.container.innerHTML.trim().length, `${type} renders markup`).toBeGreaterThan(0);
    }
  }, 120_000);
});

describe('a family chunk that fails to download', () => {
  const comparison = BLOCK_CATALOG.comparison.exampleMinimal;

  it('is retried once and then renders', async () => {
    const real = pageFamilyLoaders.structure;
    const flaky = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockImplementation(real);
    const resolved = await resolvePageBlock(comparison, { ...pageFamilyLoaders, structure: flaky });
    expect(flaky).toHaveBeenCalledTimes(2);
    expect(resolved.kind).toBe('render');
  });

  it('rejects after the retry, so BlockHost shows a retryable load error instead of "Unsupported block"', async () => {
    const offline = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(
      resolvePageBlock(comparison, { ...pageFamilyLoaders, structure: offline })
    ).rejects.toThrow('Failed to fetch');
    expect(offline).toHaveBeenCalledTimes(2);
  });
});

// --- merged from text-media.test.ts ---

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('text block family', () => {
  it('renders markdown as inert text and drops unsafe link targets', () => {
    const { container } = render(TextFamilyRenderer, {
      props: {
        block: {
          type: 'text',
          markdown: '<script>alert(1)</script> [unsafe](javascript:alert(1)) and **safe emphasis**',
        },
      },
    });

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
    expect(screen.getByText('safe emphasis').tagName).toBe('STRONG');
  });
});

describe('media block family', () => {
  it('does not request a remote image even when an invalid block bypasses schema validation', () => {
    const { container } = render(MediaFamilyRenderer, {
      props: {
        block: {
          type: 'image',
          src: 'https://tracker.example/pixel.png',
          alt: 'remote',
          width: 1,
          height: 1,
        },
      },
    });
    expect(container.querySelector('img')).toBeNull();
  });
});

// --- merged from structure.test.ts ---

afterEach(() => {
  document.body.replaceChildren();
});

const cta: Block = {
  type: 'cta',
  title: 'Start free',
  body: 'No credit card required.',
  actions: [
    {
      label: 'Create account',
      href: 'https://example.com/signup',
      variant: 'primary',
      icon: 'rocket',
    },
    { label: 'Learn more', href: '#docs', variant: 'link' },
  ],
  footnote: 'Simulated prototype.',
};

describe('structure family renderers', () => {
  it('shows CTA pending state until the host action promise settles', async () => {
    let finish: (() => void) | undefined;
    const onCtaAction = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    render(StructureHarness, { block: cta, onCtaAction });
    await tick();
    const button = screen.getByRole('button', { name: /Create account/ });
    await fireEvent.click(button);
    expect(onCtaAction).toHaveBeenCalledWith({
      label: 'Create account',
      href: 'https://example.com/signup',
    });
    await waitFor(() => expect(button.getAttribute('aria-busy')).toBe('true'));
    finish?.();
    await waitFor(() => expect(button.getAttribute('aria-busy')).not.toBe('true'));
  });
});

// --- merged from code-diagram.test.ts ---

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

describe('code block', () => {
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
});

describe('flow diagram', () => {
  it('keeps labels as text', () => {
    const { container } = mount(DiagramFamily as Component<never>, {
      type: 'flow',
      nodes: [{ id: 'a', label: '<img src=x onerror=alert(1)>' }],
    });
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});

// --- merged from interactive.test.ts ---

afterEach(() => cleanup());

/** Family chunks pull charts-ui / ui; first load is slow under Vitest. */
const long = { timeout: 45_000 };

const poll = MINIMAL_EXAMPLES.poll as PollBlock;

describe('interactive family through BlockStateHost', () => {
  it('votes through a spy host, shows pending, and announces results', async () => {
    // Keep this behavior test independent of the cold lazy chunk transform. The
    // renderer's lazy boundary is covered separately; under the combined package
    // suite, compiling this family can outlast the DOM assertion's wait window.
    const { loadBlockFamily } = await import('../src/registry.ts');
    expect(await loadBlockFamily('interactive')).toBeTypeOf('function');

    const memory = createMemoryBlockStateHost();
    const dispatch = vi.fn(
      (key: string, block: Parameters<BlockStateHost['dispatch']>[1], action: unknown) =>
        memory.dispatch(key, block, action)
    );
    const host: BlockStateHost = {
      read: (key) => memory.read(key),
      dispatch: dispatch as BlockStateHost['dispatch'],
      subscribe: (key, listener) => memory.subscribe(key, listener),
    };
    render(InteractiveHarness, {
      props: {
        blocks: [poll],
        stateHost: host,
        documentId: 'deck-1',
        viewerId: 'ada',
      },
    });

    await waitFor(() => expect(screen.getByText(poll.question)).toBeTruthy(), long);
    const yes = screen.getByRole('button', { name: /Yes/i });
    await fireEvent.click(yes);
    const vote = screen.getByRole('button', { name: /^Vote$/i });
    await fireEvent.click(vote);

    await waitFor(() => expect(dispatch).toHaveBeenCalled(), long);
    const call = dispatch.mock.calls.find((c) => (c[2] as { type?: string })?.type === 'vote');
    expect(call?.[0]).toBe(stateKey('deck-1', poll.id));
    expect(call?.[2]).toMatchObject({
      type: 'vote',
      viewer: 'ada',
      options: ['yes'],
    });

    await waitFor(() => {
      expect(screen.getByText(/vote saved/i)).toBeTruthy();
    }, long);

    const state = readBlockState(host, stateKey('deck-1', poll.id), poll);
    expect(pollResults(poll, state, 'ada').mine).toEqual(['yes']);
  }, 60_000);
});

describe('AC-blocks-no-direct-db', () => {
  it('blocks-ui source never imports @protoyard/database or dexie', () => {
    const root = join(import.meta.dirname, '../src');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(ts|svelte|js)$/.test(entry.name)) files.push(path);
      }
    };
    walk(root);
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      if (/@protoyard\/database|from ['"]dexie['"]|from ['"]dexie\//.test(text)) {
        hits.push(file);
      }
    }
    expect(hits).toEqual([]);
  });
});

// --- merged from embed.test.ts ---

afterEach(() => cleanup());

const APP = {
  formatVersion: 1,
  name: 'Demo Tracker',
  kind: 'app',
  entities: [{ id: 'task', name: 'Task', fields: [{ name: 'title', type: 'text' }] }],
  roles: [{ id: 'member', name: 'Member' }],
  screens: [{ id: 'home', path: '/', title: 'Home', view: 'dashboard' }],
} as const;

const EMBED_BLOCK = {
  type: 'embed-app' as const,
  id: 'try-it',
  title: 'Try the tracker',
  height: 'md' as const,
  startLabel: 'Open demo',
  app: { ...APP },
};

describe('EmbedApp with mountEmbed', () => {
  it('does not call mountEmbed before the start click', async () => {
    const mountEmbed = vi.fn<MountEmbed>(() => () => undefined);
    render(EmbedHarness, {
      props: { blocks: [EMBED_BLOCK], mountEmbed },
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open demo' })).toBeTruthy());
    expect(mountEmbed).not.toHaveBeenCalled();
    const idleRegions = screen.getAllByRole('region', { name: /Try the tracker/ });
    expect(
      idleRegions.some((el) => el.getAttribute('data-tx-embed-started') === 'false') ||
        idleRegions.every((el) => el.getAttribute('data-tx-embed-started') !== 'true')
    ).toBe(true);
  });
});
