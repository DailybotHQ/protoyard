import type { Block } from '@protoyard/blocks';
import type { Component } from 'svelte';
import TextFamilyRenderer from './TextFamilyRenderer.svelte';

export type { Block } from '@protoyard/blocks';
export { default as MdRenderer } from './MdRenderer.svelte';

export const BlockFamilyRenderer: Component<{ block: Block }> = TextFamilyRenderer;
