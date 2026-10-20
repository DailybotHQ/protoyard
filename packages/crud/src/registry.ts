import type { Component } from 'svelte';
import {
  getScreenKindMetadata,
  type ScreenKind,
  type ScreenKindMetadata,
} from './registry-meta.ts';

export interface ScreenRuntimeProps extends Record<string, unknown> {
  runtime?: unknown;
  blueprint?: unknown;
  services?: unknown;
  screen?: Record<string, unknown>;
  params?: Record<string, string | undefined>;
}

export interface ScreenKindRegistration extends Omit<ScreenKindMetadata, 'kind'> {
  kind: string;
  load: () => Promise<Component>;
  adaptProps: (props: ScreenRuntimeProps) => Record<string, unknown>;
}

function identityProps(props: ScreenRuntimeProps): Record<string, unknown> {
  return props;
}

function screenProps(props: ScreenRuntimeProps): Record<string, unknown> {
  return {
    runtime: props.runtime,
    blueprint: props.blueprint,
    services: props.services,
    screen: props.screen,
  };
}

function settingsProps(props: ScreenRuntimeProps): Record<string, unknown> {
  return {
    runtime: props.runtime,
    blueprint: props.blueprint,
    sections: props.screen?.sections,
    title: props.screen?.title,
    library: props.library,
  };
}

function component(component: unknown): Component {
  return component as Component;
}

function registration(
  kind: ScreenKind,
  load: () => Promise<unknown>,
  adaptProps: ScreenKindRegistration['adaptProps']
): ScreenKindRegistration {
  return {
    ...getScreenKindMetadata(kind),
    load: async () => component(await load()),
    adaptProps,
  };
}

/**
 * Lazy component registry. Each view kit uses its own dynamic import so it
 * remains outside the initial CRUD chunk until its screen is opened.
 */
export const screenKinds: Record<string, ScreenKindRegistration> = {
  list: registration(
    'list',
    () => import('./EntityList.svelte').then((module) => module.default),
    identityProps
  ),
  detail: registration(
    'detail',
    () => import('./EntityDetail.svelte').then((module) => module.default),
    identityProps
  ),
  form: registration(
    'form',
    () => import('./EntityForm.svelte').then((module) => module.default),
    identityProps
  ),
  board: registration(
    'board',
    () => import('./screens/board/index.ts').then((module) => module.BoardScreen),
    screenProps
  ),
  calendar: registration(
    'calendar',
    () => import('./screens/calendar/index.ts').then((module) => module.CalendarScreen),
    screenProps
  ),
  timeline: registration(
    'timeline',
    () => import('./screens/timeline/index.ts').then((module) => module.TimelineScreen),
    screenProps
  ),
  map: registration(
    'map',
    () => import('./screens/map/index.ts').then((module) => module.MapScreen),
    screenProps
  ),
  analytics: registration(
    'analytics',
    () => import('./screens/analytics/index.ts').then((module) => module.AnalyticsScreen),
    screenProps
  ),
  dashboard: registration(
    'dashboard',
    () => import('./screens/dashboard/index.ts').then((module) => module.DashboardScreen),
    screenProps
  ),
  settings: registration(
    'settings',
    () => import('./screens/settings/index.ts').then((module) => module.SettingsScreen),
    settingsProps
  ),
  'entity-page': {
    ...getScreenKindMetadata('entity-page'),
    load: async () => {
      throw new Error('The entity-page screen must be registered by the CRUD app shell.');
    },
    adaptProps: identityProps,
  },
};

/** Return a registered screen kind or explain the unsupported kind. */
export function getScreenKind(kind: string): ScreenKindRegistration {
  const entry = screenKinds[kind];
  if (!entry) throw new Error(`Unknown screen kind "${kind}".`);
  return entry;
}

/** Register an app or archetype screen kind without adding it to core CRUD. */
export function registerScreenKind(kind: string, entry: ScreenKindRegistration): void {
  if (screenKinds[kind] && kind !== 'entity-page') {
    throw new Error(`Screen kind "${kind}" is already registered.`);
  }
  screenKinds[kind] = { ...entry, kind: kind as ScreenKind };
}

/** Load one screen component only when its route is opened. */
export function loadScreenKind(kind: string): Promise<Component> {
  return getScreenKind(kind).load();
}
