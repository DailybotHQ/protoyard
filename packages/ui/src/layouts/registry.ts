import type { LayoutId, LayoutOptions } from '@protoyard/core';
import type { Component, Snippet } from 'svelte';
import type { NavModel } from './nav-model.ts';

/** Props shared by lazy layouts. `mountScreen` receives the one stable routed-screen node. */
export interface LayoutProps {
  mountScreen: (target: HTMLElement) => void;
  /** What the layout navigates (ADR-023); absent: chrome without links. */
  nav?: NavModel;
  /** Current hash path; absent: the layout follows `location.hash` itself. */
  path?: string;
  /** `preview.layout.options` (flat, data-only knobs). */
  options?: LayoutOptions;
  /** Scope for persisted layout UI state (the prototype's storage namespace). */
  storageKey?: string;
  /** Optional context panel (dual-sidebar renders it on the right). */
  aside?: Snippet;
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
export const LAYOUT_REGISTRY: Partial<Record<LayoutId, LayoutEntry>> = {
  sidebar: { load: () => import('./SidebarLayout.svelte') },
  rail: { load: () => import('./RailLayout.svelte') },
  'top-nav': { load: () => import('./TopNavLayout.svelte') },
  'dual-sidebar': { load: () => import('./DualSidebarLayout.svelte') },
  'master-detail': { load: () => import('./MasterDetailLayout.svelte') },
  'dashboard-grid': { load: () => import('./DashboardGridLayout.svelte') },
  docs: { load: () => import('./DocsLayout.svelte') },
  marketing: { load: () => import('./MarketingLayout.svelte') },
  wizard: { load: () => import('./WizardLayout.svelte') },
  'auth-split': { load: () => import('./AuthSplitLayout.svelte') },
};
