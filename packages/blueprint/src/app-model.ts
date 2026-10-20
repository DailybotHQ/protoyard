import type { LayoutId } from '@protoyard/core';
import {
  type Blueprint,
  type BlueprintEntity,
  type BlueprintScreen,
  type ScreenNavIcon,
  type ScreenType,
  screenPath,
} from './schema.ts';

/**
 * The app model (ADR-029): a blueprint's routes, navigation, navigation
 * groups and layout as plain data. `protoyard generate` prints it into
 * `src/generated/routes.ts` and `layout.ts`; the player renders it directly.
 * Framework-free: icons are `SCREEN_NAV_ICONS` ids, and each renderer maps
 * them to its own components.
 */

/** Screen kinds that render through their own view component instead of the entity page. */
const VIEW_COMPONENT_KINDS: readonly ScreenType[] = [
  'board',
  'calendar',
  'map',
  'analytics',
  'timeline',
  'dashboard',
  'settings',
];

/** Kinds listed under the "Views" navigation group. */
const VIEW_GROUP_KINDS: readonly ScreenType[] = [
  'board',
  'calendar',
  'timeline',
  'map',
  'analytics',
  'dashboard',
];

const DEFAULT_ICONS: Partial<Record<ScreenType, ScreenNavIcon>> = {
  dashboard: 'layout-dashboard',
  settings: 'settings',
  board: 'kanban',
  calendar: 'calendar-days',
  timeline: 'chart-gantt',
  map: 'map',
  analytics: 'chart-line',
};

interface AppRouteBase {
  /** Stable route name (`home`, `deal-list`, `screen-BoardDeal`, `members`). */
  readonly name: string;
  /** Hash route path, with `:param` segments. */
  readonly path: string;
  readonly title: string;
  readonly description: string;
}

/**
 * What a route renders:
 * - `home`: the built-in overview with a count per entity;
 * - `members`: workspace people and their simulated roles;
 * - `entity`: the entity page (list, create and edit), optionally claimed by
 *   a `list`, `form` or tab-less `detail` screen;
 * - `screen`: a blueprint screen with its own view component.
 */
export type AppRoute =
  | (AppRouteBase & { readonly view: 'home' })
  | (AppRouteBase & { readonly view: 'members' })
  | (AppRouteBase & {
      readonly view: 'entity';
      readonly entity: string;
      readonly screenIndex?: number;
      readonly screenType?: ScreenType;
    })
  | (AppRouteBase & {
      readonly view: 'screen';
      readonly screenIndex: number;
      readonly screenType: ScreenType;
      readonly entity?: string;
      /** Unique component id for the screen (`Dashboard1Screen`, `BoardDealScreen`). */
      readonly component: string;
    });

/** What a route renders, without its name, path and labels. */
export type AppRouteTarget = AppRoute extends infer R
  ? R extends AppRoute
    ? Omit<R, keyof AppRouteBase>
    : never
  : never;

export interface AppNavItem {
  readonly path: string;
  readonly label: string;
  readonly icon: ScreenNavIcon;
  /** Active only on an exact path match (the home row). */
  readonly exact?: true;
}

export interface AppNavGroup {
  readonly label: string;
  readonly paths: readonly string[];
}

export interface AppLayout {
  readonly id: LayoutId;
  readonly mobile?: LayoutId;
}

export interface AppModel {
  /** Every route, in router order. */
  readonly routes: readonly AppRoute[];
  /** Sidebar rows: home, entities without a list screen, visible screens by nav order, members. */
  readonly nav: readonly AppNavItem[];
  /** Sectioned navigation (Overview, Records, Views, Workspace); empty groups are dropped. */
  readonly navGroups: readonly AppNavGroup[];
  readonly layout: AppLayout;
  /** Every icon id the navigation may reference, in first-use order. */
  readonly icons: readonly ScreenNavIcon[];
}

/** `support-tickets` → `Support tickets`, unless the entity sets `label`. */
export function entityLabel(entity: Pick<BlueprintEntity, 'label' | 'plural'>): string {
  if (entity.label) return entity.label;
  const words = entity.plural.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** `support-ticket` → `SupportTicket` (names are lowercase kebab-case). */
function pascal(name: string): string {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

const capitalize = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/** The icon a screen shows in navigation: its `nav.icon`, or the default for its kind. */
export function screenNavIcon(screen: BlueprintScreen): ScreenNavIcon {
  return screen.nav?.icon ?? DEFAULT_ICONS[screen.type] ?? 'database';
}

function screenTitle(screen: BlueprintScreen, blueprint: Blueprint): string {
  if (screen.nav?.label) return screen.nav.label;
  if (screen.title) return screen.title;
  if ('entity' in screen) {
    const entity = blueprint.entities.find((candidate) => candidate.name === screen.entity);
    if (entity) return `${entityLabel(entity)} ${screen.type === 'list' ? '' : screen.type}`.trim();
  }
  return capitalize(screen.type);
}

function screenComponent(screen: BlueprintScreen, index: number, previous: Set<string>): string {
  const entity = 'entity' in screen ? screen.entity : undefined;
  const base =
    screen.type === 'dashboard'
      ? `Dashboard${index + 1}Screen`
      : screen.type === 'settings'
        ? 'SettingsScreen'
        : `${pascal(screen.type)}${entity ? pascal(entity) : index + 1}Screen`;
  let name = base;
  for (let suffix = 2; previous.has(name); suffix += 1)
    name = base.replace(/Screen$/, `${suffix}Screen`);
  previous.add(name);
  return name;
}

/** True when a screen renders through its own component rather than the entity page. */
export function screenHasOwnView(screen: BlueprintScreen): boolean {
  if (screen.type === 'detail') return Boolean(screen.tabs?.length);
  return VIEW_COMPONENT_KINDS.includes(screen.type);
}

interface ScreenEntry {
  readonly screen: BlueprintScreen;
  readonly index: number;
  readonly path: string;
  readonly component: string;
  readonly ownView: boolean;
  readonly label: string;
  readonly description: string;
  readonly entity?: string;
}

function screenEntries(blueprint: Blueprint): ScreenEntry[] {
  const names = new Set<string>();
  return blueprint.screens.flatMap((screen, index) => {
    const path = screenPath(screen, blueprint.entities);
    if (!path) return [];
    const entityName = 'entity' in screen ? screen.entity : undefined;
    const entity = entityName
      ? blueprint.entities.find((item) => item.name === entityName)
      : undefined;
    return [
      {
        screen,
        index,
        path,
        component: screenComponent(screen, index, names),
        ownView: screenHasOwnView(screen),
        label: screenTitle(screen, blueprint),
        description: `${capitalize(screen.type)} screen${entity ? ` for ${entityLabel(entity)}` : ''}`,
        ...(entityName ? { entity: entityName } : {}),
      },
    ];
  });
}

function hasDefaultListRoute(blueprint: Blueprint, entity: BlueprintEntity): boolean {
  if (!entity.screenDefaults) return true;
  const explicit = blueprint.screens.find(
    (screen) => 'entity' in screen && screen.entity === entity.name && screen.type === 'list'
  );
  if (explicit) return screenPath(explicit, blueprint.entities) === `/${entity.plural}`;
  return entity.screenDefaults.views.includes('list');
}

function hasDefaultDetailRoute(blueprint: Blueprint, entity: BlueprintEntity): boolean {
  if (!entity.screenDefaults) return true;
  const explicit = blueprint.screens.find(
    (screen) => 'entity' in screen && screen.entity === entity.name && screen.type === 'detail'
  );
  if (explicit) return screenPath(explicit, blueprint.entities) === `/${entity.plural}/:id`;
  return entity.screenDefaults.views.includes('detail');
}

/** The route fields an entry renders with: its own view, or the entity page it belongs to. */
function entryTarget(entry: ScreenEntry): AppRouteTarget {
  if (entry.ownView) {
    return {
      view: 'screen',
      screenIndex: entry.index,
      screenType: entry.screen.type,
      component: entry.component,
      ...(entry.entity ? { entity: entry.entity } : {}),
    };
  }
  return {
    view: 'entity',
    entity: entry.entity ?? '',
    screenIndex: entry.index,
    screenType: entry.screen.type,
  };
}

function deriveRoutes(blueprint: Blueprint, entries: readonly ScreenEntry[]): AppRoute[] {
  const rootDashboard = entries.find(
    (entry) => entry.screen.type === 'dashboard' && entry.path === '/'
  );
  // Keyed by path: a later route on the same path replaces the earlier one in place.
  const routes = new Map<string, AppRoute>();
  routes.set(
    '/',
    rootDashboard
      ? ({
          name: 'home',
          description: rootDashboard.description,
          path: '/',
          title: rootDashboard.screen.title ?? rootDashboard.label,
          ...entryTarget(rootDashboard),
        } as AppRoute)
      : {
          name: 'home',
          description: 'Overview with a count per entity',
          path: '/',
          title: 'Home',
          view: 'home',
        }
  );
  for (const entity of blueprint.entities) {
    const label = entityLabel(entity);
    const page = { view: 'entity', entity: entity.name } as const;
    const detail = entries.find(
      (entry) =>
        entry.screen.type === 'detail' &&
        entry.entity === entity.name &&
        Boolean(entry.screen.tabs?.length)
    );
    const list = entries.find(
      (entry) => entry.screen.type === 'list' && entry.entity === entity.name
    );
    const listPath = `/${entity.plural}`;
    const detailPath = `/${entity.plural}/:id`;
    if (hasDefaultListRoute(blueprint, entity)) {
      routes.set(listPath, {
        name: `${entity.name}-list`,
        description: `${label}: list, create, edit and delete`,
        path: listPath,
        title: label,
        ...(list?.path === listPath ? entryTarget(list) : page),
      } as AppRoute);
    }
    if (hasDefaultDetailRoute(blueprint, entity)) {
      routes.set(detailPath, {
        name: `${entity.name}-detail`,
        description: detail
          ? `${label}: record detail with tabs`
          : `One ${entity.name.replace(/-/g, ' ')}: edit form`,
        path: detailPath,
        title: label,
        ...(detail?.path === detailPath ? entryTarget(detail) : page),
      } as AppRoute);
    }
  }
  for (const entry of entries) {
    if (entry.path === '/' && entry.screen.type === 'dashboard') continue;
    routes.set(entry.path, {
      name: `screen-${entry.component.replace(/Screen$/, '')}`,
      description: entry.description,
      path: entry.path,
      title: entry.label,
      ...entryTarget(entry),
    } as AppRoute);
  }
  routes.set('/members', {
    name: 'members',
    description: 'Workspace people and their simulated roles',
    path: '/members',
    title: 'Members',
    view: 'members',
  });
  return [...routes.values()];
}

function deriveNav(
  blueprint: Blueprint,
  entries: readonly ScreenEntry[]
): { nav: AppNavItem[]; icons: ScreenNavIcon[] } {
  const rootDashboard = entries.find(
    (entry) => entry.screen.type === 'dashboard' && entry.path === '/'
  );
  const visible = entries.filter((entry) => entry.screen.nav?.hidden !== true);
  const homeIcon = rootDashboard ? screenNavIcon(rootDashboard.screen) : 'layout-dashboard';
  const icons = new Set<ScreenNavIcon>(['database', 'users', homeIcon]);
  for (const { screen } of visible) icons.add(screenNavIcon(screen));

  const entityNav = blueprint.entities.flatMap((entity): AppNavItem[] => {
    if (entries.some((entry) => entry.screen.type === 'list' && entry.entity === entity.name)) {
      return [];
    }
    if (entity.screenDefaults) return [];
    return [{ path: `/${entity.plural}`, label: entityLabel(entity), icon: 'database' }];
  });
  const screenNav = visible
    .filter(
      ({ screen, path }) => screen.type !== 'form' && screen.type !== 'detail' && path !== '/'
    )
    .sort(
      (a, b) =>
        (a.screen.nav?.order ?? Number.POSITIVE_INFINITY) -
          (b.screen.nav?.order ?? Number.POSITIVE_INFINITY) || a.index - b.index
    )
    .map(({ screen, path, label }): AppNavItem => ({ path, label, icon: screenNavIcon(screen) }));
  const nav: AppNavItem[] = [
    { path: '/', label: rootDashboard?.label ?? 'Home', icon: homeIcon, exact: true },
    ...entityNav,
    ...screenNav,
    { path: '/members', label: 'Members', icon: 'users' },
  ];
  return { nav, icons: [...icons] };
}

function deriveNavGroups(blueprint: Blueprint, entries: readonly ScreenEntry[]): AppNavGroup[] {
  const visible = entries.filter((entry) => entry.screen.nav?.hidden !== true);
  const recordPaths = blueprint.entities.flatMap((entity) => {
    if (!hasDefaultListRoute(blueprint, entity)) return [];
    const list = visible.find(
      ({ screen, entity: name }) => screen.type === 'list' && name === entity.name
    );
    return [list?.path ?? `/${entity.plural}`];
  });
  const viewPaths = visible
    .filter(({ screen, path }) => path !== '/' && VIEW_GROUP_KINDS.includes(screen.type))
    .map(({ path }) => path);
  const settingsPaths = visible
    .filter(({ screen }) => screen.type === 'settings')
    .map(({ path }) => path);
  return [
    { label: 'Overview', paths: ['/'] },
    { label: 'Records', paths: recordPaths },
    { label: 'Views', paths: viewPaths },
    { label: 'Workspace', paths: ['/members', ...settingsPaths] },
  ].filter((group) => group.paths.length > 0);
}

/**
 * Derives the app model from a parsed blueprint. Pure and deterministic: the
 * same blueprint always yields the same model, which matches what
 * `protoyard generate` writes to `routes.ts` and `layout.ts`.
 */
export function deriveAppModel(blueprint: Blueprint): AppModel {
  const entries = screenEntries(blueprint);
  const { nav, icons } = deriveNav(blueprint, entries);
  return {
    routes: deriveRoutes(blueprint, entries),
    nav,
    navGroups: deriveNavGroups(blueprint, entries),
    layout: {
      id: blueprint.layout?.id ?? 'sidebar',
      ...(blueprint.layout?.mobile ? { mobile: blueprint.layout.mobile } : {}),
    },
    icons,
  };
}
