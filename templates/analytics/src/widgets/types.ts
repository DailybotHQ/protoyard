import type { DateRange, Granularity } from '@protoyard/analytics';
import type { Component } from 'svelte';
import type { TrackedEvent } from '../database/schema.ts';
import type { WidgetKey } from '../scenarios/seeds.ts';

/** What every dashboard widget receives: the filtered events of the shared range. */
export interface WidgetProps {
  title: string;
  events: readonly TrackedEvent[];
  range: DateRange;
  granularity: Granularity;
}

/** Each widget is its own chunk: the Overview loads only the charts its layout shows. */
export const WIDGET_LOADERS: Record<WidgetKey, () => Promise<{ default: Component<WidgetProps> }>> =
  {
    trend: () => import('./TrendWidget.svelte'),
    mix: () => import('./MixWidget.svelte'),
    plans: () => import('./PlansWidget.svelte'),
    funnel: () => import('./FunnelWidget.svelte'),
    platforms: () => import('./PlatformsWidget.svelte'),
  };
