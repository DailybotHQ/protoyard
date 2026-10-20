import {
  type AppModel,
  type AppRoute,
  type Blueprint,
  type BlueprintEntity,
  type BlueprintScreen,
  brandLibraryThemeId,
  brandThemeExportName,
  deriveAppModel,
  emitBrandThemeModule,
  entityTable,
  resolveBlueprintBrand,
  type ScreenNavIcon,
} from '@protoyard/blueprint';
import { getScreenKindMetadata } from '@protoyard/crud/registry-meta';
import { formatTs, tsString } from './format.ts';
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
  const metadata = getScreenKindMetadata(screen.type);
  const hasTabs = screen.type === 'detail' && Boolean(screen.tabs?.length);
  if (!hasTabs && !metadata.codegenWrapper) return null;
  const check = `const found = blueprint.screens[${index}];\nif (found?.type !== '${screen.type}') {\n  throw new Error('blueprint screen ${index} is not a ${screen.type}: regenerate');\n}\nconst screen = found;`;
  if (screen.type === 'settings') {
    return `<script lang="ts">\nimport { ${metadata.exportName} } from '${metadata.subpath}';\nimport { THEME_LIBRARY_META } from '@protoyard/themes/library';\nimport { useCrudApp } from '../../lib/context.ts';\n\nconst { runtime, blueprint } = useCrudApp();\n${check}\nconst library = THEME_LIBRARY_META.map(({ id, name }) => ({ id, name }));\n</script>\n\n<${metadata.exportName} {runtime} {blueprint} sections={screen.sections} title={screen.title} {library} />\n`;
  }
  if (hasTabs && entity) {
    return `<script lang="ts">\nimport { ${metadata.exportName} } from '${metadata.subpath}';\nimport type { RouteProps } from '@protoyard/renderer-svelte';\nimport { useCrudApp } from '../../lib/context.ts';\n\nlet props: RouteProps = $props();\nconst { runtime, services, blueprint } = useCrudApp();\n${check}\n</script>\n\n<${metadata.exportName} {runtime} {blueprint} {services} entityName={${lit(entity)}} recordId={props.params.id ?? ''} />\n`;
  }
  if (!entity && screen.type !== 'dashboard') return null;
  return `<script lang="ts">\nimport { ${metadata.exportName} } from '${metadata.subpath}';\nimport { useCrudApp } from '../../lib/context.ts';\n\nconst { runtime, services, blueprint } = useCrudApp();\n${check}\n</script>\n\n<${metadata.exportName} {runtime} {services} {blueprint} {screen} />\n`;
}

/** Lucide component for a `SCREEN_NAV_ICONS` id; `Map` shadows the global Map, so it is `MapIcon`. */
function lucideIcon(icon: ScreenNavIcon): string {
  return icon === 'map' ? 'MapIcon' : pascal(icon);
}

/** The lazy import a route renders: the overview, members, an entity page or a screen wrapper. */
function routeLoad(route: AppRoute): string {
  switch (route.view) {
    case 'home':
      return "load: () => import('../screens/Home.svelte')";
    case 'members':
      return "load: () => import('../screens/Members.svelte')";
    case 'entity':
      return `load: () => import('./screens/${pascal(route.entity)}Page.svelte')`;
    case 'screen':
      return `load: () => import('./screens/${route.component}.svelte')`;
  }
}

/** Prints the app model's routes and sidebar rows (ADR-029: one model for codegen and player). */
function routesModule(model: AppModel): string {
  const rows = model.routes.map(
    (route) =>
      `  {\n    name: ${lit(route.name)},\n    description: ${lit(route.description)},\n    path: ${lit(route.path)},\n    title: ${lit(route.title)},\n    ${routeLoad(route)},\n  },`
  );
  const navRows = model.nav.map(
    (item) =>
      `  { path: ${lit(item.path)}, label: ${lit(item.label)}, icon: ${lucideIcon(item.icon)}${item.exact ? ', exact: true' : ''} },`
  );
  const iconList = model.icons
    .map(lucideIcon)
    .map((name) => (name === 'MapIcon' ? 'Map as MapIcon' : name))
    .sort();
  const iconInline = `import { ${iconList.join(', ')} } from '@lucide/svelte';`;
  const iconImport =
    iconInline.length <= 100
      ? iconInline
      : `import {\n${iconList.map((name) => `  ${name},`).join('\n')}\n} from '@lucide/svelte';`;
  return `${iconImport}
import { defineRoutes } from '@protoyard/renderer-svelte';

/** Hash routes. Blueprint screens load through separate chunks. */
export const routes = defineRoutes([\n${rows.join('\n')}\n]);

/** Sidebar entries: entities first, then blueprint screens by nav order. */
export const nav = [\n${navRows.join('\n')}\n];
`;
}

/** Prints the app model's selected frame and sectioned navigation. */
function layoutModule(model: AppModel): string {
  // Typed (not \`as const\`) so the shell can read \`mobile\` when the blueprint leaves it out.
  return `import type { LayoutId } from '@protoyard/core';

/** Generated by protoyard; edit the blueprint instead. */
export const layout: { readonly id: LayoutId; readonly mobile?: LayoutId } = ${formatTs(model.layout)};

/** Grouped sidebar entries consumed by every shared layout. */
export const navGroups = ${formatTs(model.navGroups)} as const;
`;
}

/**
 * The app shell. The notifications bell is included only when an entity enables
 * notifications: its table exists only then (see FEATURE_TABLES).
 */
function appComponent(blueprint: Blueprint): string {
  const bell = blueprint.entities.some((e) => e.features.notifications);
  return `<script lang="ts">
import {
  avatarImage,
  createRouter,
  Router,
  useAppearance,
  usePrincipal,
} from '@protoyard/renderer-svelte';
import { LayoutHost, navFromSidebar } from '@protoyard/ui';
import { onDestroy, onMount } from 'svelte';
import AppSearch from './components/AppSearch.svelte';
${bell ? "import NotificationsBell from './components/NotificationsBell.svelte';\n" : ''}import { layout, navGroups } from './generated/layout.ts';
import { nav, routes } from './generated/routes.ts';
import { provideCrudApp } from './lib/context.ts';

const { runtime } = provideCrudApp();
const principal = usePrincipal();
const appearance = useAppearance();
let viewportWidth = $state(typeof window === 'undefined' ? 0 : window.innerWidth);

onMount(() => {
  const updateWidth = () => (viewportWidth = window.innerWidth);
  window.addEventListener('resize', updateWidth);
  return () => window.removeEventListener('resize', updateWidth);
});

const router = createRouter([...routes], { titleSuffix: runtime.manifest.name });
onDestroy(() => router.destroy());

const appearanceLayout = $derived(
  appearance.current.layout.source === 'override' || appearance.current.layout.source === 'scenario'
    ? appearance.current.layout.value
    : layout.id
);
const activeLayout = $derived(
  layout.mobile &&
    viewportWidth > 0 &&
    viewportWidth < 768 &&
    appearance.current.layout.source !== 'override' &&
    appearance.current.layout.source !== 'scenario'
    ? layout.mobile
    : appearanceLayout
);
const items = $derived(
  nav.map((item) => ({
    href: \`#\${item.path}\`,
    label: item.label,
    icon: item.icon,
    active: router.isActive(item.path, 'exact' in item && item.exact),
  }))
);
const sections = $derived(
  navGroups
    .map((group) => ({
      label: group.label,
      items: group.paths.flatMap((path) => {
        const item = items.find((candidate) => candidate.href === \`#\${path}\`);
        return item ? [item] : [];
      }),
    }))
    .filter((group) => group.items.length > 0)
);
const layoutNav = $derived(
  navFromSidebar(sections, {
    brand: { label: runtime.manifest.name, icon: 'folder-kanban' },
    ...(principal.current
      ? {
          user: {
            image: avatarImage(principal.current.persona.avatar),
            name: principal.current.persona.name,
            detail: principal.current.persona.title ?? principal.current.role ?? '',
          },
        }
      : {}),
  })
);
</script>

<LayoutHost layout={activeLayout} nav={layoutNav} storageKey={runtime.manifest.storage.namespace}>
  <div class="mx-auto w-full max-w-7xl px-4 py-6 pb-safe sm:px-6 lg:px-8">
    <div class="mb-4 flex justify-end gap-2">
      <AppSearch />
${bell ? '      <NotificationsBell />\n' : ''}    </div>
    <Router {router} />
  </div>
</LayoutHost>
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
/** `src/generated/brand-theme.ts`, formatted the way Biome writes it. */
function brandThemeModule(theme: Parameters<typeof emitBrandThemeModule>[0]): string {
  const exportName = brandThemeExportName(theme.id);
  return `import { defineTheme, type Theme } from '@protoyard/core';

/** On-brand theme derived from blueprint.json \`brand\`. */
export const ${exportName}: Theme = defineTheme(${formatTs(theme)});

export default ${exportName};
`;
}

function prototypeWithBrand(exportName: string): string {
  return `import { deriveIntegrity } from '@protoyard/blueprint';
import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';
import { blueprint } from './generated/blueprint.ts';
import { ${exportName} } from './generated/brand-theme.ts';
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
  // One heading line: a name with newlines must not inject Markdown.
  const title = blueprint.name.replace(/\s+/g, ' ').trim();
  return `# ${title}

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
  const model = deriveAppModel(blueprint);
  const files: EmittedFile[] = [
    owned('blueprint.json', blueprintText),
    generated('src/generated/blueprint.ts', blueprintModule()),
    generated('src/generated/schema.ts', schemaModule()),
    generated('src/generated/policy.ts', policyModule()),
    generated('src/generated/services.ts', servicesModule()),
    generated('src/generated/scenarios.ts', scenariosModule()),
    generated('src/generated/routes.ts', routesModule(model)),
    generated('src/generated/layout.ts', layoutModule(model)),
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
    files.push(generated('src/generated/brand-theme.ts', brandThemeModule(theme)));
    // Owned: replaces the template prototype so the brand theme is registered.
    files.push(owned('src/prototype.ts', prototypeWithBrand(exportName)));
  }

  return files;
}

/**
 * Theme id written to protoyard.json when the blueprint declares a brand.
 * Shared with the player's runtime definition (`@protoyard/blueprint`).
 */
export { brandDefaultThemeId } from '@protoyard/blueprint';
