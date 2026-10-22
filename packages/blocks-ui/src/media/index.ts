import type { Block } from '@protoyard/blocks';
import type { Component } from 'svelte';
import MediaFamilyRenderer from './MediaFamilyRenderer.svelte';

export type { Block } from '@protoyard/blocks';

export const BlockFamilyRenderer: Component<{ block: Block }> = MediaFamilyRenderer;
