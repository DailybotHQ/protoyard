import type { DeckLayoutId } from '@protoyard/decks';
import type { Component } from 'svelte';
import { LAYOUT_FAMILIES, type LayoutFamily } from './families.ts';

export interface LayoutRendererProps {
  layout: DeckLayoutId;
  props: unknown;
}

type LayoutRendererModule = { LayoutRenderer?: Component<LayoutRendererProps> };

const familyLoaders: Record<LayoutFamily, () => Promise<LayoutRendererModule>> = {
  text: () => import('./text/index.ts'),
  media: () => import('./media/index.ts'),
  data: () => import('./data/index.ts'),
  diagram: () => import('./diagram/index.ts'),
};

/** Resolve a layout into its family chunk; importing this registry loads no family UI. */
export async function loadLayoutRenderer(
  layout: string
): Promise<Component<LayoutRendererProps> | null> {
  if (!Object.hasOwn(LAYOUT_FAMILIES, layout)) return null;
  const family = LAYOUT_FAMILIES[layout as keyof typeof LAYOUT_FAMILIES];
  const module = await familyLoaders[family]();
  return typeof module.LayoutRenderer === 'function' ? module.LayoutRenderer : null;
}
