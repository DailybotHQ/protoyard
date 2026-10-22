import type { Block, BlockFamily, BlockType } from '@protoyard/blocks';
import type { Component } from 'svelte';

export interface BlockFamilyRendererProps {
  block: Block;
}

/** Each `@protoyard/blocks-ui/<family>` subpath exports this one dispatcher. */
export type BlockFamilyRenderer = Component<BlockFamilyRendererProps>;

interface FamilyModule {
  BlockFamilyRenderer?: BlockFamilyRenderer;
}

export type BlockRenderResolution =
  | { kind: 'render'; block: Block; component: BlockFamilyRenderer }
  | { kind: 'fallback'; message: string };

export interface BlockRendererRegistration {
  family: BlockFamily;
  load: () => Promise<FamilyModule>;
}

const familyLoaders: Record<BlockFamily, () => Promise<FamilyModule>> = {
  text: () => import('./text/index.ts'),
  media: () => import('./media/index.ts'),
  data: () => import('./data/index.ts'),
  structure: () => import('./structure/index.ts'),
  code: () => import('./code/index.ts'),
  diagram: () => import('./diagram/index.ts'),
  interactive: () => import('./interactive/index.ts'),
  map: () => import('./map/index.ts'),
  embed: () => import('./embed/index.ts'),
};

function registration(family: BlockFamily): BlockRendererRegistration {
  const load = familyLoaders[family];
  if (!load) throw new Error(`No renderer loader is registered for "${family}".`);
  return { family, load };
}

/** Exhaustive block-to-family routing; each loader remains a separate chunk. */
export const blockRendererRegistry: Readonly<Record<BlockType, BlockRendererRegistration>> =
  Object.freeze({
    heading: registration('text'),
    text: registration('text'),
    list: registration('text'),
    quote: registration('text'),
    callout: registration('text'),
    divider: registration('text'),
    image: registration('media'),
    video: registration('media'),
    people: registration('media'),
    stat: registration('data'),
    table: registration('data'),
    chart: registration('data'),
    code: registration('code'),
    timeline: registration('structure'),
    steps: registration('structure'),
    comparison: registration('structure'),
    cards: registration('structure'),
    icon: registration('structure'),
    cta: registration('structure'),
    columns: registration('structure'),
    tabs: registration('interactive'),
    reveal: registration('interactive'),
    poll: registration('interactive'),
    quiz: registration('interactive'),
    calculator: registration('interactive'),
    counter: registration('interactive'),
    'chart-controls': registration('interactive'),
    form: registration('interactive'),
    map: registration('map'),
    'embed-app': registration('embed'),
    flow: registration('diagram'),
    tree: registration('diagram'),
    board: registration('diagram'),
    terminal: registration('diagram'),
  });

/** Load a declared family directly (for example to preload a family before it renders). */
export async function loadBlockFamily(family: BlockFamily): Promise<BlockFamilyRenderer | null> {
  const load = familyLoaders[family];
  if (!load) return null;
  const module = await load();
  return typeof module.BlockFamilyRenderer === 'function' ? module.BlockFamilyRenderer : null;
}

/** Validate untrusted runtime data before routing it to a family renderer. */
export async function resolveBlockRenderer(input: unknown): Promise<BlockRenderResolution> {
  const { safeParseBlock } = await import('@protoyard/blocks');
  const parsed = safeParseBlock(input);
  if (!parsed.success) return { kind: 'fallback', message: 'This block needs a newer Protoyard.' };

  const registration = blockRendererRegistry[parsed.data.type];
  if (!registration) return { kind: 'fallback', message: 'This block needs a newer Protoyard.' };
  const component = await loadBlockFamily(registration.family);
  if (!component) {
    return { kind: 'fallback', message: 'This block renderer is not available yet.' };
  }
  return { kind: 'render', block: parsed.data, component };
}
