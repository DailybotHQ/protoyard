import { SCREEN_TYPES, type ScreenType } from '@protoyard/blueprint';

/** Screen kinds understood by the blueprint renderer and its app shell. */
export type ScreenKind = ScreenType | 'entity-page';

export type ScreenPropsAdapter = 'entity' | 'screen' | 'settings' | 'entity-page';

export interface ScreenKindMetadata {
  kind: ScreenKind;
  /** Public package subpath used by generated apps. */
  subpath: string;
  /** Named export, or `default` for direct Svelte component subpaths. */
  exportName: string;
  /** Framework-free adapter id consumed by the runtime registry. */
  propsAdapter: ScreenPropsAdapter;
  /** Whether codegen emits a dedicated wrapper for this screen kind. */
  codegenWrapper: boolean;
}

const metadata = {
  list: {
    kind: 'list',
    subpath: '@protoyard/crud/screens/list',
    exportName: 'default',
    propsAdapter: 'entity',
    codegenWrapper: false,
  },
  detail: {
    kind: 'detail',
    subpath: '@protoyard/crud',
    exportName: 'EntityDetail',
    propsAdapter: 'entity',
    codegenWrapper: false,
  },
  form: {
    kind: 'form',
    subpath: '@protoyard/crud/screens/form',
    exportName: 'default',
    propsAdapter: 'entity',
    codegenWrapper: false,
  },
  board: {
    kind: 'board',
    subpath: '@protoyard/crud/screens/board',
    exportName: 'BoardScreen',
    propsAdapter: 'screen',
    codegenWrapper: true,
  },
  calendar: {
    kind: 'calendar',
    subpath: '@protoyard/crud/screens/calendar',
    exportName: 'CalendarScreen',
    propsAdapter: 'screen',
    codegenWrapper: true,
  },
  timeline: {
    kind: 'timeline',
    subpath: '@protoyard/crud/screens/timeline',
    exportName: 'TimelineScreen',
    propsAdapter: 'screen',
    codegenWrapper: true,
  },
  map: {
    kind: 'map',
    subpath: '@protoyard/crud/screens/map',
    exportName: 'MapScreen',
    propsAdapter: 'screen',
    codegenWrapper: true,
  },
  analytics: {
    kind: 'analytics',
    subpath: '@protoyard/crud/screens/analytics',
    exportName: 'AnalyticsScreen',
    propsAdapter: 'screen',
    codegenWrapper: true,
  },
  dashboard: {
    kind: 'dashboard',
    subpath: '@protoyard/crud/screens/dashboard',
    exportName: 'DashboardScreen',
    propsAdapter: 'screen',
    codegenWrapper: true,
  },
  settings: {
    kind: 'settings',
    subpath: '@protoyard/crud/screens/settings',
    exportName: 'SettingsScreen',
    propsAdapter: 'settings',
    codegenWrapper: true,
  },
  'entity-page': {
    kind: 'entity-page',
    subpath: '@protoyard/crud/app',
    exportName: 'EntityPage',
    propsAdapter: 'entity-page',
    codegenWrapper: false,
  },
} as const satisfies Record<ScreenKind, ScreenKindMetadata>;

/** Svelte-free screen metadata for the CLI, player and package registry. */
export const screenKindMetadata: Readonly<Record<ScreenKind, ScreenKindMetadata>> = metadata;

/** Blueprint screen kinds are derived from the schema so codegen stays exhaustive. */
export const blueprintScreenKinds: readonly ScreenType[] = SCREEN_TYPES;

export function getScreenKindMetadata(kind: string): ScreenKindMetadata {
  const entry = screenKindMetadata[kind as ScreenKind];
  if (!entry) throw new Error(`Unknown screen kind "${kind}".`);
  return entry;
}
