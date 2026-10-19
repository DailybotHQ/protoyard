import type { LayoutId } from '@protoyard/core';
import type { Component } from 'svelte';

/** Props shared by lazy layouts. `mountScreen` receives the one stable routed-screen node. */
export interface LayoutProps {
  mountScreen: (target: HTMLElement) => void;
}

export type LayoutComponent = Component<LayoutProps>;

export interface LayoutEntry {
  /** Each entry owns a separate lazy import so unused layouts stay out of the boot path. */
  load: () => Promise<{ default: LayoutComponent }>;
}

/**
 * Layout implementations register here as their modules ship. Keep imports lazy and relative;
 * never route layout code through the @protoyard/ui barrel.
 */
export const LAYOUT_REGISTRY: Partial<Record<LayoutId, LayoutEntry>> = {};
