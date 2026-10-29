import {
  type AnyBlueprint,
  type Blueprint,
  type BlueprintEntity,
  brandLibraryThemeId,
  brandThemeExportName,
  emitBrandThemeModule,
  entityTable,
  resolveBlueprintBrand,
} from '@protoyard/blueprint';
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

/**
 * The app shell: the shared blueprint app (\`@protoyard/crud/app\`, ADR-029),
 * the same one the player runs. Routes, navigation, layout and screens come from
 * the blueprint at runtime, so they are not emitted as files.
 */
export function appComponent(): string {
  return `<script lang="ts">
import { ErrorState, LoadingState } from '@protoyard/ui';
import { blueprint } from './generated/blueprint.ts';

/**
 * The shared blueprint app shell (@protoyard/crud/app), the same one the player
 * runs. It loads as its own chunk, so the first download stays small. This file
 * is yours: pass \`home\`, \`extraRoutes\`, \`recordHref\` or an \`actions\` snippet
 * to BlueprintApp to customize the app.
 */
let attempt = $state(0);
const shell = $derived.by(() => {
  void attempt;
  return import('@protoyard/crud/app');
});

/** Theme library choices for the settings screen, loaded only when it opens. */
async function themeLibrary() {
  const { THEME_LIBRARY_META } = await import('@protoyard/themes/library');
  return THEME_LIBRARY_META.map(({ id, name }) => ({ id, name }));
}
</script>

{#await shell}
  <LoadingState label="Loading the prototype" class="py-16" />
{:then { BlueprintApp }}
  <BlueprintApp {blueprint} {themeLibrary} />
{:catch error}
  <ErrorState
    title="The prototype could not be loaded"
    message={error instanceof Error ? error.message : String(error)}
    onRetry={() => {
      attempt += 1;
    }}
    retryLabel="Try again"
  />
{/await}
`;
}

const CONTENT_BLUEPRINT_TYPES = {
  deck: 'DeckBlueprint',
  page: 'PageBlueprint',
  doc: 'DocBlueprint',
} as const;

/** Validated kind blueprint module: the kind's synchronous parser (kinds/parse) keeps only its body schema. */
function contentBlueprintModule(kind: keyof typeof CONTENT_BLUEPRINT_TYPES): string {
  const typeName = CONTENT_BLUEPRINT_TYPES[kind];
  const parser = `parse${typeName}`;
  return `import type { ${typeName} } from '@protoyard/blueprint';
import { ${parser} } from '@protoyard/blueprint/kinds/parse';
import blueprintJson from '../../blueprint.json';

/**
 * The validated ${kind} blueprint (blueprint.json is the single source of truth).
 * Parsed synchronously: a top-level await on a lazily loaded schema would
 * deadlock the single-chunk Claude artifact build.
 */
export const blueprint: ${typeName} = ${parser}(blueprintJson);
`;
}

/** The blueprint brand, resolved at generate time for a content kind's runtime module. */
interface ContentBrand {
  /** The theme the prototype opens in, or null for the default theme. */
  themeId: string | null;
  /** Export name in `src/generated/brand-theme.ts`, or null when no theme is built. */
  exportName: string | null;
}

/**
 * Shared runtime module for a generated deck, page or doc prototype. The
 * brand is resolved here, at generate time (`defineKindPrototype`), so the
 * prototype's first chunk never loads the palette generator a seed needs.
 */
function contentRuntimeModule(
  kind: keyof typeof CONTENT_BLUEPRINT_TYPES,
  brand: ContentBrand
): string {
  const typeName = CONTENT_BLUEPRINT_TYPES[kind];
  const bodyExport = kind === 'page' ? 'pageDocument' : kind === 'doc' ? 'docDocument' : null;
  const brandImport = brand.exportName
    ? `import { ${brand.exportName} } from './generated/brand-theme.ts';\n`
    : '';
  return `import type { ${typeName} } from '@protoyard/blueprint';
import { type AnyContentBlueprint, defineKindPrototype } from '@protoyard/blueprint/kinds';
import { parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { blueprint } from './generated/blueprint.ts';
${brandImport}
const manifest = parseManifest(manifestJson);
const contentBlueprint = blueprint as ${typeName};

${bodyExport ? `export const ${bodyExport} = contentBlueprint.${kind};\n` : ''}export const definition = defineKindPrototype(contentBlueprint as AnyContentBlueprint, {
  namespace: manifest.storage.namespace,
  slug: manifest.slug,
  version: manifest.version,
  defaultThemeId: ${brand.themeId === null ? 'null' : lit(brand.themeId)},
  brandTheme: ${brand.exportName ?? 'null'},
});
definition.manifest.blueprintKind = '${kind}';
if (manifest.template) definition.manifest.template = manifest.template;
if (manifest.catalog) definition.manifest.catalog = manifest.catalog;
definition.manifest.build = manifest.build;
definition.manifest.thumbnail = manifest.thumbnail;
definition.manifest.status = manifest.status;
`;
}

/**
 * The deck template's App, main and prototype read `./deck-blueprint.ts`; a
 * generated deck points it at the generated blueprint, so the prototype shows
 * the user's deck rather than the template's sample (kinds parity test).
 */
function deckBlueprintModule(): string {
  return `import type { DeckBlueprint } from '@protoyard/blueprint';
import { blueprint } from './generated/blueprint.ts';

/** The generated deck (blueprint.json is the single source of truth). */
export const deckBlueprint: DeckBlueprint = blueprint;
`;
}

/**
 * Template files a generated prototype of this kind leaves out: the template's
 * own sample data, and its brand module (the generated runtime imports
 * `src/generated/brand-theme.ts` instead).
 */
export function kindTemplateFilesRemoved(kind: Exclude<AnyBlueprint, Blueprint>['kind']): string[] {
  return kind === 'deck' ? ['src/blueprint.json', TEMPLATE_BRAND_THEME_PATH] : [];
}

/** The deck template's brand module, rewritten by `protoyard new` from `src/blueprint.json`. */
export const TEMPLATE_BRAND_THEME_PATH = 'src/brand-theme.ts';

/**
 * `src/brand-theme.ts` of a prototype made from the deck template: the brand
 * of its `src/blueprint.json`, resolved when `protoyard new` copies it, so the
 * prototype's first chunk never loads the palette generator a seed brand
 * needs (`defineKindPrototype`). Throws `BrandThemeError` like `generate`.
 */
export function templateBrandThemeModule(blueprint: Exclude<AnyBlueprint, Blueprint>): string {
  const libraryId = blueprint.brand ? brandLibraryThemeId(blueprint.brand) : undefined;
  const theme =
    blueprint.brand && !libraryId
      ? resolveBlueprintBrand(blueprint.brand, { blueprintName: blueprint.name })
      : null;
  const themeId = theme?.id ?? libraryId ?? null;
  return `${theme ? "import { defineTheme, type Theme } from '@protoyard/core';" : "import type { Theme } from '@protoyard/core';"}

/**
 * The brand of src/blueprint.json, resolved ahead so this deck's first chunk
 * never loads the palette generator a seed brand needs. \`protoyard new\`,
 * \`dev\` (on every blueprint change) and \`validate\` rewrite it: edit
 * \`brand\` in src/blueprint.json, not this file.
 */
export const brandTheme: Theme | null = ${theme ? `defineTheme(${formatTs(theme)})` : 'null'};

/** The theme the deck opens in: the brand theme, a library theme id, or null for the default. */
export const defaultThemeId: string | null = ${themeId === null ? 'null' : lit(themeId)};
`;
}

/** Kind emission stays small and has no entity schema, services or tests. */
export function emitContentKindPrototype(
  blueprint: Exclude<AnyBlueprint, Blueprint>,
  blueprintText: string
): EmittedFile[] {
  const kind = blueprint.kind;
  // A library brand ships by id; only a built brand emits a theme module, as for apps.
  const libraryId = blueprint.brand ? brandLibraryThemeId(blueprint.brand) : undefined;
  const theme =
    blueprint.brand && !libraryId
      ? resolveBlueprintBrand(blueprint.brand, { blueprintName: blueprint.name })
      : null;
  const brand: ContentBrand = {
    themeId: theme?.id ?? libraryId ?? null,
    exportName: theme ? brandThemeExportName(theme.id) : null,
  };
  return [
    owned('blueprint.json', blueprintText),
    generated('src/generated/blueprint.ts', contentBlueprintModule(kind)),
    ...(theme ? [generated('src/generated/brand-theme.ts', brandThemeModule(theme))] : []),
    generated('src/prototype.ts', contentRuntimeModule(kind, brand)),
    ...(kind === 'deck' ? [generated('src/deck-blueprint.ts', deckBlueprintModule())] : []),
  ];
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
  return `import { blueprintGeneratorVersion, deriveIntegrity } from '@protoyard/blueprint';
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
  // Changes whenever the blueprint's generative surface or the generator SDK does.
  generatorVersion: blueprintGeneratorVersion(blueprint),
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
- \`src/App.svelte\` renders \`BlueprintApp\` from \`@protoyard/crud/app\`, the same app shell the
  Protoyard player runs: routes, navigation, layout and screens come from the blueprint. A
  dashboard declaring \`path: "/"\` owns the home route; otherwise the home shows a count per entity.
- Everything else (\`src/App.svelte\`, scenarios, tests) is yours to change. Customize the app by
  passing \`home\`, \`extraRoutes\`, \`recordHref\` or an \`actions\` snippet to \`BlueprintApp\`.
- Roles and permissions are a simulation for UX, not security. Data is fictional.

\`\`\`bash
pnpm protoyard dev ${slug}
pnpm vitest run prototypes/${slug}
pnpm protoyard validate ${slug} --build
\`\`\`
`;
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

/** Template files a generated app never copies (none today: the template is blueprint-driven). */
export const TEMPLATE_FILES_REMOVED: readonly string[] = [];

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
    owned('src/App.svelte', appComponent()),
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
