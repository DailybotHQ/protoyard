import {
  type Blueprint,
  type BlueprintEntity,
  type BlueprintScreen,
  brandLibraryThemeId,
  brandThemeExportName,
  emitBrandThemeModule,
  entityTable,
  resolveBlueprintBrand,
  screenPath,
} from '@protoyard/blueprint';
import { tsString } from './format.ts';
import { withHeader } from './header.ts';

/**
 * Pure emitters: blueprint → file text. Values from the blueprint only ever
 * reach code through `JSON.stringify` (string literals); identifiers come
 * from names the blueprint schema already restricted to kebab-case.
 */

export interface EmittedFile {
  /** Path relative to the prototype folder (POSIX). */
  path: string;
  content: string;
  /** Under src/generated/ with a hash header: rewritten by regeneration. */
  generated: boolean;
}

const lit = tsString;

/** `support-ticket` → `SupportTicket` (safe: names are lowercase kebab-case). */
export function pascal(name: string): string {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/** `support-tickets` → `Support tickets`. */
export function entityLabel(entity: Pick<BlueprintEntity, 'label' | 'plural'>): string {
  if (entity.label) return entity.label;
  const words = entity.plural.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const generated = (path: string, body: string): EmittedFile => ({
  path,
  content: withHeader(body, path.endsWith('.svelte') ? 'svelte' : 'ts'),
  generated: true,
});
const owned = (path: string, content: string): EmittedFile => ({ path, content, generated: false });

function blueprintModule(): string {
  return `import { type Blueprint, parseBlueprint } from '@protoyard/blueprint';
import blueprintJson from '../../blueprint.json';

/** The validated blueprint (blueprint.json is the single source of truth). */
export const blueprint: Blueprint = parseBlueprint(blueprintJson);
`;
}

function schemaModule(): string {
  return `import { deriveDatabaseVersions } from '@protoyard/blueprint';
import type { DatabaseDefinition } from '@protoyard/core';
import { blueprint } from './blueprint.ts';

/**
 * Every Dexie version, rebuilt from blueprint.json and its \`history\`: each
 * regeneration that changes storage appends a version with data-only upgrade
 * steps, so existing browser data migrates instead of being reset.
 */
export const database: DatabaseDefinition = {
  versions: deriveDatabaseVersions(blueprint),
};
`;
}

function policyModule(): string {
  return `import { derivePolicy } from '@protoyard/blueprint';
import { blueprint } from './blueprint.ts';

/** Capability policy derived from blueprint roles (simulated, not security). */
export const policy = derivePolicy(blueprint);
`;
}

function servicesModule(): string {
  return `import { createEntityServices, type EntityServices } from '@protoyard/blueprint';
import type { PrototypeRuntime } from '@protoyard/core';
import { blueprint } from './blueprint.ts';

/** Entity services: session.assert → zod → environment.run → db.transaction. */
export function createServices(runtime: PrototypeRuntime): EntityServices {
  return createEntityServices(runtime, blueprint);
}
`;
}

function scenariosModule(): string {
  return `import type { GenerateContext, WorldSeed } from '@protoyard/core';
import { blueprint } from './blueprint.ts';

/** World generator from the blueprint; loaded lazily so Faker stays out of the initial chunk. */
export async function generateCrudWorld(ctx: GenerateContext): Promise<WorldSeed> {
  const { createBlueprintGenerator } = await import('@protoyard/blueprint/generator');
  const { generate } = createBlueprintGenerator(blueprint);
  return generate(ctx);
}

export async function crudGeneratorVersion(): Promise<number> {
  const { blueprintGeneratorVersion } = await import('@protoyard/blueprint/generator');
  return blueprintGeneratorVersion(blueprint);
}
`;
}

function entityScreen(entity: BlueprintEntity): string {
  return `<script lang="ts">
import type { RouteProps } from '@protoyard/renderer-svelte';
import EntityPage from '../../screens/EntityPage.svelte';

let props: RouteProps = $props();
</script>

<EntityPage entityName={${lit(entity.name)}} {...props} />
`;
}

const SCREEN_ICONS: Record<string, string> = {
  activity: 'Activity',
  bell: 'Bell',
  'book-open': 'BookOpen',
  briefcase: 'Briefcase',
  building: 'Building',
  calendar: 'Calendar',
  'calendar-days': 'CalendarDays',
  'chart-bar': 'ChartBar',
  'chart-gantt': 'ChartGantt',
  'chart-line': 'ChartLine',
  'chart-pie': 'ChartPie',
  clock: 'Clock',
  cpu: 'Cpu',
  database: 'Database',
  'dollar-sign': 'DollarSign',
  'file-text': 'FileText',
  folder: 'Folder',
  globe: 'Globe',
  'graduation-cap': 'GraduationCap',
  'heart-pulse': 'HeartPulse',
  house: 'House',
  inbox: 'Inbox',
  kanban: 'Kanban',
  'layout-dashboard': 'LayoutDashboard',
  list: 'List',
  map: 'Map',
  'map-pin': 'MapPin',
  'message-square': 'MessageSquare',
  package: 'Package',
  receipt: 'Receipt',
  settings: 'Settings',
  'shopping-cart': 'ShoppingCart',
  star: 'Star',
  table: 'Table',
  tag: 'Tag',
  ticket: 'Ticket',
  truck: 'Truck',
  users: 'Users',
  wallet: 'Wallet',
  wrench: 'Wrench',
  zap: 'Zap',
};

function defaultScreenIcon(screen: BlueprintScreen): string {
  switch (screen.type) {
    case 'dashboard':
      return 'LayoutDashboard';
    case 'settings':
      return 'Settings';
    case 'board':
      return 'Kanban';
    case 'calendar':
      return 'CalendarDays';
    case 'timeline':
      return 'ChartGantt';
    case 'map':
      return 'Map';
    case 'analytics':
      return 'ChartLine';
    default:
      return 'Database';
  }
}

function screenTitle(screen: BlueprintScreen, blueprint: Blueprint): string {
  if (screen.nav?.label) return screen.nav.label;
  if (screen.title) return screen.title;
  if ('entity' in screen) {
    const entity = blueprint.entities.find((candidate) => candidate.name === screen.entity);
    if (entity) return `${entityLabel(entity)} ${screen.type === 'list' ? '' : screen.type}`.trim();
  }
  return screen.type.charAt(0).toUpperCase() + screen.type.slice(1);
}

function screenName(screen: BlueprintScreen, index: number, previous: Set<string>): string {
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

function screenWrapper(screen: BlueprintScreen, index: number): string | null {
  const entity = 'entity' in screen ? screen.entity : undefined;
  const component: Record<string, string> = {
    board: 'BoardScreen',
    calendar: 'CalendarScreen',
    map: 'MapScreen',
    analytics: 'AnalyticsScreen',
    timeline: 'TimelineScreen',
    dashboard: 'DashboardScreen',
    settings: 'SettingsScreen',
  };
  const hasTabs = screen.type === 'detail' && Boolean(screen.tabs?.length);
  if (!hasTabs && !component[screen.type]) return null;
  const check = `const found = blueprint.screens[${index}];\nif (found?.type !== '${screen.type}') throw new Error('blueprint screen ${index} is not a ${screen.type}: regenerate');\nconst screen = found;`;
  if (screen.type === 'settings') {
    return `<script lang="ts">\nimport { SettingsScreen } from '@protoyard/crud/screens/settings';\nimport { THEME_LIBRARY_META } from '@protoyard/themes/library';\nimport { useCrudApp } from '../../lib/context.ts';\n\nconst { runtime, blueprint } = useCrudApp();\n${check}\nconst library = THEME_LIBRARY_META.map(({ id, name }) => ({ id, name }));\n</script>\n\n<SettingsScreen {runtime} {blueprint} sections={screen.sections} title={screen.title} {library} />\n`;
  }
  if (hasTabs && entity) {
    return `<script lang="ts">\nimport { EntityDetail } from '@protoyard/crud';\nimport type { RouteProps } from '@protoyard/renderer-svelte';\nimport { useCrudApp } from '../../lib/context.ts';\n\nlet props: RouteProps = $props();\nconst { runtime, services, blueprint } = useCrudApp();\n${check}\n</script>\n\n<EntityDetail {runtime} {blueprint} {services} entityName={${lit(entity)}} recordId={props.params.id ?? ''} />\n`;
  }
  if (!entity && screen.type !== 'dashboard') return null;
  return `<script lang="ts">\nimport { ${component[screen.type]} } from '@protoyard/crud/screens/${screen.type}';\nimport { useCrudApp } from '../../lib/context.ts';\n\nconst { runtime, services, blueprint } = useCrudApp();\n${check}\n</script>\n\n<${component[screen.type]} {runtime} {services} {blueprint} {screen} />\n`;
}

function routesModule(blueprint: Blueprint): string {
  const names = new Set<string>();
  const entries = blueprint.screens.flatMap((screen, index) => {
    const path = screenPath(screen, blueprint.entities);
    if (!path) return [];
    const name = screenName(screen, index, names);
    const wrapper = screenWrapper(screen, index);
    const entity =
      'entity' in screen
        ? blueprint.entities.find((item) => item.name === screen.entity)
        : undefined;
    return [
      {
        screen,
        index,
        path,
        name,
        wrapper,
        label: screenTitle(screen, blueprint),
        description: `${screen.type.charAt(0).toUpperCase()}${screen.type.slice(1)} screen${entity ? ` for ${entityLabel(entity)}` : ''}`,
        load: wrapper
          ? `load: () => import('./screens/${name}.svelte')`
          : `load: () => import('./screens/${pascal(entity?.name ?? '')}Page.svelte')`,
      },
    ];
  });
  const rootDashboard = entries.find(
    (entry) => entry.screen.type === 'dashboard' && entry.path === '/'
  );
  const routeRows = new Map<string, string>();
  routeRows.set(
    '/',
    rootDashboard
      ? `  {\n    name: 'home',\n    description: ${lit(rootDashboard.description)},\n    path: '/',\n    title: ${lit(rootDashboard.screen.title ?? rootDashboard.label)},\n    ${rootDashboard.load},\n  },`
      : `  {\n    name: 'home',\n    description: 'Overview with a count per entity',\n    path: '/',\n    title: 'Home',\n    load: () => import('../screens/Home.svelte'),\n  },`
  );
  for (const entity of blueprint.entities) {
    const label = entityLabel(entity);
    const load = `load: () => import('./screens/${pascal(entity.name)}Page.svelte')`;
    const detail = entries.find(
      (entry) =>
        entry.screen.type === 'detail' &&
        'entity' in entry.screen &&
        entry.screen.entity === entity.name &&
        Boolean(entry.screen.tabs?.length)
    );
    const list = entries.find(
      (entry) =>
        entry.screen.type === 'list' &&
        'entity' in entry.screen &&
        entry.screen.entity === entity.name
    );
    routeRows.set(
      `/${entity.plural}`,
      `  {\n    name: ${lit(`${entity.name}-list`)},\n    description: ${lit(`${label}: list, create, edit and delete`)},\n    path: ${lit(`/${entity.plural}`)},\n    title: ${lit(label)},\n    ${list?.path === `/${entity.plural}` ? list.load : load},\n  },`
    );
    routeRows.set(
      `/${entity.plural}/:id`,
      `  {\n    name: ${lit(`${entity.name}-detail`)},\n    description: ${lit(detail ? `${label}: record detail with tabs` : `One ${entity.name.replace(/-/g, ' ')}: edit form`)},\n    path: ${lit(`/${entity.plural}/:id`)},\n    title: ${lit(label)},\n    ${detail?.path === `/${entity.plural}/:id` ? detail.load : load},\n  },`
    );
  }
  for (const entry of entries) {
    if (entry.path === '/' && entry.screen.type === 'dashboard') continue;
    routeRows.set(
      entry.path,
      `  {\n    name: ${lit(`screen-${entry.name.replace(/Screen$/, '')}`)},\n    description: ${lit(entry.description)},\n    path: ${lit(entry.path)},\n    title: ${lit(entry.label)},\n    ${entry.load},\n  },`
    );
  }
  routeRows.set(
    '/members',
    `  {\n    name: 'members',\n    description: 'Workspace people and their simulated roles',\n    path: '/members',\n    title: 'Members',\n    load: () => import('../screens/Members.svelte'),\n  },`
  );

  const navEntries = entries.filter(({ screen }) => screen.nav?.hidden !== true);
  const usedIcons = new Set(['Database', 'Users']);
  usedIcons.add(
    rootDashboard
      ? (SCREEN_ICONS[rootDashboard.screen.nav?.icon ?? ''] ??
          defaultScreenIcon(rootDashboard.screen))
      : 'LayoutDashboard'
  );
  for (const { screen } of navEntries)
    usedIcons.add(SCREEN_ICONS[screen.nav?.icon ?? ''] ?? defaultScreenIcon(screen));
  const iconImports = [...usedIcons].sort().join(', ');
  const entityNav = blueprint.entities.flatMap((entity) => {
    if (
      entries.some(
        (entry) =>
          entry.screen.type === 'list' &&
          'entity' in entry.screen &&
          entry.screen.entity === entity.name
      )
    )
      return [];
    return [
      `  { path: ${lit(`/${entity.plural}`)}, label: ${lit(entityLabel(entity))}, icon: Database },`,
    ];
  });
  const screenNav = navEntries
    .filter(({ screen }) => screen.type !== 'form' && screen.type !== 'detail')
    .sort(
      (a, b) =>
        (a.screen.nav?.order ?? Infinity) - (b.screen.nav?.order ?? Infinity) || a.index - b.index
    )
    .map(
      ({ screen, path, label }) =>
        `  { path: ${lit(path)}, label: ${lit(label)}, icon: ${SCREEN_ICONS[screen.nav?.icon ?? ''] ?? defaultScreenIcon(screen)} },`
    );
  const navRows = [
    `  { path: '/', label: ${lit(rootDashboard?.label ?? 'Home')}, icon: ${rootDashboard ? (SCREEN_ICONS[rootDashboard.screen.nav?.icon ?? ''] ?? defaultScreenIcon(rootDashboard.screen)) : 'LayoutDashboard'}, exact: true },`,
    ...entityNav,
    ...screenNav.filter((row) => !row.includes("path: '/'")),
    `  { path: '/members', label: 'Members', icon: Users },`,
  ];
  return `import { ${iconImports} } from '@lucide/svelte';
import { defineRoutes } from '@protoyard/renderer-svelte';

/** Hash routes. Blueprint screens load through separate chunks. */
export const routes = defineRoutes([\n${[...routeRows.values()].join('\n')}\n]);

/** Sidebar entries: entities first, then blueprint screens by nav order. */
export const nav = [\n${navRows.join('\n')}\n];
`;
}

/**
 * The app shell. The notifications bell is included only when an entity enables
 * notifications: its table exists only then (see FEATURE_TABLES).
 */
function appComponent(blueprint: Blueprint): string {
  const bell = blueprint.entities.some((e) => e.features.notifications);
  return `<script lang="ts">
import { FolderKanban } from '@lucide/svelte';
import { createRouter, Router, usePrincipal } from '@protoyard/renderer-svelte';
import { AppShell, Avatar, Badge, Header, Sidebar } from '@protoyard/ui';
import { onDestroy } from 'svelte';
import AppSearch from './components/AppSearch.svelte';
${bell ? "import NotificationsBell from './components/NotificationsBell.svelte';\n" : ''}import { nav, routes } from './generated/routes.ts';
import { provideCrudApp } from './lib/context.ts';

const { runtime } = provideCrudApp();
const principal = usePrincipal();

const router = createRouter([...routes], { titleSuffix: runtime.manifest.name });
onDestroy(() => router.destroy());

const items = $derived(
  nav.map((item) => ({
    href: \`#\${item.path}\`,
    label: item.label,
    icon: item.icon,
    active: router.isActive(item.path, 'exact' in item && item.exact),
  }))
);
</script>

<AppShell sidebarLabel="Main navigation">
  {#snippet sidebar()}
    <Sidebar {items} label="Sections" collapsible={false}>
      {#snippet header()}
        <a href="#/" class="flex min-w-0 items-center gap-2.5 rounded-md px-1">
          <span
            class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm"
            aria-hidden="true"
          >
            <FolderKanban class="size-4" />
          </span>
          <span class="truncate text-sm font-semibold">{runtime.manifest.name}</span>
        </a>
      {/snippet}
      {#snippet footer()}
        {#if principal.current}
          <div class="mb-8 flex items-center gap-3 rounded-lg border border-sidebar-border bg-surface p-3">
            <Avatar name={principal.current.persona.name} size="sm" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{principal.current.persona.name}</p>
              <p class="truncate text-xs text-muted-foreground">{principal.current.persona.title ?? ''}</p>
            </div>
            <Badge variant={principal.current.role === 'viewer' ? 'outline' : 'secondary'}>
              {principal.current.role}
            </Badge>
          </div>
        {/if}
      {/snippet}
    </Sidebar>
  {/snippet}

  {#snippet header()}
    <Header class="border-b border-border" title={runtime.manifest.name}>
      {#snippet actions()}
        <div class="flex items-center gap-2">
          <AppSearch />
${bell ? '          <NotificationsBell />\n' : ''}        </div>
      {/snippet}
    </Header>
  {/snippet}

  <div class="mx-auto w-full max-w-7xl px-4 py-6 pb-safe sm:px-6 lg:px-8">
    <Router {router} />
  </div>
</AppShell>
`;
}

function homeScreen(): string {
  return `<script lang="ts">
import { liveQuery } from '@protoyard/renderer-svelte';
import { Card } from '@protoyard/ui';
import { useCrudApp } from '../lib/context.ts';

const { services, blueprint } = useCrudApp();

/** Row count per entity; null when the active role cannot read it. */
const counts = liveQuery(
  async () =>
    Object.fromEntries(
      await Promise.all(
        blueprint.entities.map(async (entity) => [
          entity.name,
          await services[entity.name]!.list().then(
            (rows) => rows.length,
            () => null
          ),
        ])
      )
    ) as Record<string, number | null>,
  { initial: {} }
);
</script>

<div class="space-y-6">
  <div>
    <h1 class="text-2xl font-semibold">{blueprint.name}</h1>
    {#if blueprint.description}
      <p class="mt-1 max-w-2xl text-sm text-muted-foreground">{blueprint.description}</p>
    {/if}
  </div>
  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {#each blueprint.entities as entity (entity.name)}
      {@const count = counts.current?.[entity.name]}
      <Card class="p-4">
        <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {entity.label ?? entity.plural.replace(/-/g, ' ')}
        </p>
        <p class="mt-2 text-3xl font-semibold">{count === null ? '—' : (count ?? 0)}</p>
        <a class="mt-3 inline-block text-sm text-primary hover:underline" href={\`#/\${entity.plural}\`}>Open list</a>
      </Card>
    {/each}
  </div>
</div>
`;
}

/** Prototype definition that registers the blueprint brand theme as default. */
function prototypeWithBrand(exportName: string): string {
  return `import { deriveIntegrity } from '@protoyard/blueprint';
import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';
import { ${exportName} } from './generated/brand-theme.ts';
import { blueprint } from './generated/blueprint.ts';
import { policy } from './generated/policy.ts';
import { generate } from './scenarios/generators.ts';
import { scenarios } from './scenarios/index.ts';

export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
  scenarios,
  policy,
  generate,
  // Bumped via blueprint generator hash when the blueprint changes.
  generatorVersion: 1,
  integrity: deriveIntegrity(blueprint),
  themes: [${exportName}],
});
`;
}

function generatorsTest(): string {
  return `import { entityTable } from '@protoyard/blueprint';
import { parseScenario } from '@protoyard/core';
import { createGenerateContext, validateWorld } from '@protoyard/scenarios';
import { describe, expect, it } from 'vitest';
import { blueprint } from '../src/generated/blueprint.ts';
import { definition } from '../src/prototype.ts';
import { generate } from '../src/scenarios/generators.ts';

describe('generated world', () => {
  it('is deterministic and passes integrity for every scenario', async () => {
    for (const input of definition.scenarios) {
      const scenario = parseScenario(input);
      const a = await generate(createGenerateContext(scenario));
      const b = await generate(createGenerateContext(scenario));
      expect(a, scenario.id).toEqual(b);
      expect(
        validateWorld(a, { ...definition.integrity, referenceTime: scenario.referenceTime }),
        scenario.id
      ).toEqual([]);
    }
  });

  it('seeds every blueprint entity in the active scenario', async () => {
    const input = definition.scenarios.find((s) => s.id === 'active');
    if (!input) throw new Error('missing the active scenario');
    const world = await generate(createGenerateContext(parseScenario(input)));
    for (const entity of blueprint.entities) {
      expect(Object.keys(world.tables), entity.name).toContain(entityTable(entity));
    }
  });
});
`;
}

/** `.customer` for identifier-safe names, `['support-ticket']` otherwise (Biome's useLiteralKeys). */
const accessor = (name: string) =>
  /^[a-z][a-zA-Z0-9]*$/.test(name) ? `.${name}` : `[${lit(name)}]`;

function servicesTest(blueprint: Blueprint): string {
  const first = blueprint.entities[0] as BlueprintEntity;
  return `import { PermissionDeniedError } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import { blueprint } from '../src/generated/blueprint.ts';
import { createServices } from '../src/generated/services.ts';
import { definition } from '../src/prototype.ts';

describe('generated services', () => {
  let harness = createHarness(definition);
  afterEach(() => {
    harness.closeAll();
    harness = createHarness(definition);
  });

  it('lists every entity for the owner', async () => {
    const services = createServices(await harness.boot('active'));
    for (const entity of blueprint.entities) {
      expect(Array.isArray(await services[entity.name]!.list()), entity.name).toBe(true);
    }
  });

  it('denies a viewer from creating in the service layer', async () => {
    const services = createServices(await harness.boot('viewer'));
    await expect(services${accessor(first.name)}!.create({})).rejects.toBeInstanceOf(PermissionDeniedError);
  });
});
`;
}

function readme(blueprint: Blueprint, slug: string): string {
  const rows = blueprint.entities
    .map(
      (e) => `| \`${e.name}\` | \`${entityTable(e)}\` | ${e.fields.length} | \`#/${e.plural}\` |`
    )
    .join('\n');
  return `# ${blueprint.name}

Generated with \`pnpm protoyard generate ${slug} --blueprint <file>\` from
[blueprint.json](blueprint.json), on the \`crud-app\` template.

| Entity | Table | Fields | Route |
| --- | --- | --- | --- |
${rows}

- \`blueprint.json\` is the source of truth. Files under \`src/generated/\` carry a hash
  header and are rewritten by regeneration; do not edit them.
- A dashboard declaring \`path: "/"\` owns the home route; the generated Home screen remains available only when no root dashboard is declared.
- Everything else (screens, components, scenarios, tests) is yours to change.
- Roles and permissions are a simulation for UX, not security. Data is fictional.

\`\`\`bash
pnpm protoyard dev ${slug}
pnpm vitest run prototypes/${slug}
pnpm protoyard validate ${slug} --build
\`\`\`
`;
}

function screenFiles(blueprint: Blueprint): EmittedFile[] {
  const names = new Set<string>();
  return blueprint.screens.flatMap((screen, index) => {
    const body = screenWrapper(screen, index);
    if (!body) return [];
    const name = screenName(screen, index, names);
    return [generated(`src/generated/screens/${name}.svelte`, body)];
  });
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] as string);

/** Rewrites the copied index.html title and meta description (HTML-escaped). */
export function personalizeHtml(html: string, name: string, description: string): string {
  return html
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(name)}</title>`)
    .replace(
      /(<meta\s+name="description"\s+content=")[^"]*(")/,
      (_, start: string, end: string) => `${start}${escapeHtml(description)}${end}`
    );
}

/** Template files the generated app replaces (they hard-code the template's own entities). */
export const TEMPLATE_FILES_REMOVED = [
  'src/screens/ProjectsPage.svelte',
  'src/screens/TasksPage.svelte',
] as const;

/** Every file `generate` writes on top of the copied template, in a stable order. */
export function emitPrototype(
  blueprint: Blueprint,
  slug: string,
  blueprintText: string
): EmittedFile[] {
  const files: EmittedFile[] = [
    owned('blueprint.json', blueprintText),
    generated('src/generated/blueprint.ts', blueprintModule()),
    generated('src/generated/schema.ts', schemaModule()),
    generated('src/generated/policy.ts', policyModule()),
    generated('src/generated/services.ts', servicesModule()),
    generated('src/generated/scenarios.ts', scenariosModule()),
    generated('src/generated/routes.ts', routesModule(blueprint)),
    ...blueprint.entities.map((entity) =>
      generated(`src/generated/screens/${pascal(entity.name)}Page.svelte`, entityScreen(entity))
    ),
    ...screenFiles(blueprint),
    owned('src/App.svelte', appComponent(blueprint)),
    owned('src/screens/Home.svelte', homeScreen()),
    owned('tests/generators.test.ts', generatorsTest()),
    owned('tests/services.test.ts', servicesTest(blueprint)),
    owned('README.md', readme(blueprint, slug)),
  ];

  // A library brand ships by id (defaultTheme); only built brands emit a theme module.
  if (blueprint.brand && !brandLibraryThemeId(blueprint.brand)) {
    const theme = resolveBlueprintBrand(blueprint.brand, { blueprintName: blueprint.name });
    const exportName = brandThemeExportName(theme.id);
    files.push(generated('src/generated/brand-theme.ts', emitBrandThemeModule(theme)));
    // Owned: replaces the template prototype so the brand theme is registered.
    files.push(owned('src/prototype.ts', prototypeWithBrand(exportName)));
  }

  return files;
}

/** Theme id written to protoyard.json when the blueprint declares a brand. */
export function brandDefaultThemeId(blueprint: Blueprint): string | null {
  if (!blueprint.brand) return null;
  const libraryTheme = brandLibraryThemeId(blueprint.brand);
  if (libraryTheme) return libraryTheme;
  return resolveBlueprintBrand(blueprint.brand, { blueprintName: blueprint.name }).id;
}
