import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileDesignSystemDocument } from '@protoyard/themes';
import { kitApproval } from '@texuli/spec/design-system';
import { biomeJson, tsString } from './codegen/format.ts';
import { contentHash, type DesignSystemLocation, readComponents } from './design-systems.ts';
import { dsSpecCatalog, readLibrary } from './ds-catalog.ts';
import { STORIES_DIR } from './ds-components.ts';
import { ComponentStorySchema } from './ds-contracts.ts';
import { baselineRelease, listReleases, type ReleaseIssue } from './ds-releases.ts';
import { CliError } from './output.ts';

/**
 * The design-system kit prototype (PLAN_013 T-kit): every file `protoyard ds
 * kit <id>` owns in `prototypes/<id>-kit/`, built from the design-system
 * folder alone. The page itself is Texuli's `DesignSystemKit`
 * (`texuli/ds-kit`); this module only gathers its data:
 *
 * - `src/kit/kit.json`: the document, its compiled output (with Texuli's
 *   allow manifest), Texuli's merged catalog (with the catalog extensions),
 *   the stories of the library components and, when an earlier release
 *   exists, that release's document and compiled output (the Changes
 *   section).
 * - `src/kit/library.ts`: one `@ds/<id>/<Name>` import per library component
 *   with a source file.
 * - The rest is the same for every design system: one routed screen, a
 *   database without domain tables, one scenario and its reviewer persona.
 *
 * Deterministic: the same folder (and the same Texuli) gives the same bytes,
 * so a rerun writes nothing and `--check` can tell a stale kit.
 */

export const KIT_TEMPLATE = 'blank';
export const KIT_DATA_FILE = 'src/kit/kit.json';
export const KIT_LIBRARY_FILE = 'src/kit/library.ts';
/** What a kit keeps from the template it was created from (the rest of src/ is replaced). */
export const KIT_KEEP = new Set(['src/main.ts', 'src/app.css', 'src/design-system.ts']);

export function kitSlug(id: string): string {
  return `${id}-kit`;
}

interface StoryVariant {
  name: string;
  props: Record<string, unknown>;
}

export interface KitPlan {
  /** Workspace-relative POSIX path inside the prototype → its exact content. */
  files: Map<string, string>;
  version: string;
  status: 'draft' | 'approved';
  contentHash: string;
  /** The release the Changes section compares with, or null. */
  previous: string | null;
  catalogComponents: number;
  /** Library ids with a live preview (a source file under components/). */
  previews: string[];
  /** Library ids with a story. */
  stories: string[];
  issues: ReleaseIssue[];
  /** The manifest fields the kit sets (merged into protoyard.json). */
  manifest: Record<string, unknown>;
}

/** The compiled fields `texuli/ds-kit` reads (`KitCompiled`) plus Texuli's allow manifest. */
function kitCompiled(compiled: Record<string, unknown>): Record<string, unknown> {
  const keys = [
    'id',
    'version',
    'name',
    'variant',
    'modes',
    'vars',
    'fontFaces',
    'assets',
    'accessibility',
    'report',
  ];
  return Object.fromEntries(
    keys.filter((k) => compiled[k] !== undefined).map((k) => [k, compiled[k]])
  );
}

/** Texuli's merged catalog, reduced to the fields `KitCatalog` reads. */
function kitCatalog(): { catalogHash: string; components: Record<string, unknown>[] } {
  const catalog = dsSpecCatalog() as unknown as {
    catalogHash: string;
    components: readonly Record<string, unknown>[];
  };
  return {
    catalogHash: catalog.catalogHash,
    components: catalog.components.map((c) => ({
      id: c.id,
      label: c.label,
      summary: c.summary,
      group: c.group,
      props: ((c.props as Record<string, unknown>[] | undefined) ?? []).map((p) => ({
        name: p.name,
        kind: p.kind,
        ...(p.enumValues ? { enumValues: p.enumValues } : {}),
      })),
      ...(c.axes ? { axes: c.axes } : {}),
      ...(c.states ? { states: c.states } : {}),
    })),
  };
}

async function compileOrThrow(document: unknown, what: string) {
  const result = await compileDesignSystemDocument(document);
  if (!result.ok) {
    throw new CliError(
      'validation',
      `${what} does not compile: ${result.errors.slice(0, 3).join('; ')}`
    );
  }
  return result.compiled as unknown as Record<string, unknown>;
}

function readStory(dir: string, name: string): StoryVariant[] | null {
  const file = join(dir, STORIES_DIR, `${name}.json`);
  if (!existsSync(file) || lstatSync(file).isSymbolicLink()) return null;
  try {
    const parsed = ComponentStorySchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    if (!parsed.success || parsed.data.component !== name) return null;
    return parsed.data.variants.map((v) => ({ name: v.name, props: v.props }));
  } catch {
    return null;
  }
}

/** Everything the kit of `location` holds, computed without writing. */
export async function kitPlan(
  location: DesignSystemLocation,
  document: unknown,
  slug: string
): Promise<KitPlan> {
  if (location.layout !== 'folder' || !location.dir || !location.id) {
    throw new CliError(
      'validation',
      `${location.file} is a flat document; only a folder has a kit.`,
      {
        hint: `Run \`protoyard ds migrate ${location.id ?? '<id>'}\` first.`,
      }
    );
  }
  const id = location.id;
  const dir = location.dir;
  const compiled = await compileOrThrow(document, location.file);
  const name = typeof compiled.name === 'string' && compiled.name ? compiled.name : id;
  const version = String(compiled.version);
  const hash = contentHash(document);
  // Texuli's approval view (the one the kit's Approval section shows).
  const status = kitApproval(document).status === 'approved' ? 'approved' : 'draft';

  const { releases, issues } = listReleases(location);
  const baseline = baselineRelease(releases, { version, contentHash: hash, current: true });
  const previous = baseline
    ? {
        release: baseline.release,
        document: baseline.document,
        compiled: kitCompiled(
          await compileOrThrow(baseline.document, `release ${baseline.release}`)
        ),
      }
    : undefined;

  // The library: document entries, matched to components.json by name.
  const sources = new Map(
    (readComponents(location)?.components ?? [])
      .filter(
        (c) => existsSync(join(dir, c.file)) && !lstatSync(join(dir, c.file)).isSymbolicLink()
      )
      .map((c) => [c.name, c])
  );
  const library = readLibrary(document)
    .filter((entry) => /^[a-z][a-z0-9-]{0,63}$/.test(entry.id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const previews = library.filter((entry) => sources.has(entry.name));
  const stories: Record<string, StoryVariant[]> = {};
  for (const entry of library) {
    if (!/^[A-Z][A-Za-z0-9]{0,63}$/.test(entry.name)) continue;
    const story = readStory(dir, entry.name);
    if (story) stories[entry.id] = story;
  }

  const catalog = kitCatalog();
  const data = {
    format: 'protoyard/ds-kit-data',
    version: 1,
    designSystem: id,
    document,
    compiled: kitCompiled(compiled),
    allow: compiled.allowManifest,
    catalog,
    ...(previous ? { previous } : {}),
    stories,
  };

  const files = new Map<string, string>();
  files.set(KIT_DATA_FILE, biomeJson(data));
  files.set(
    KIT_LIBRARY_FILE,
    libraryModule(
      id,
      previews.map((e) => ({ id: e.id, name: e.name }))
    )
  );
  for (const [path, body] of Object.entries(staticFiles(id, name, slug))) files.set(path, body);

  return {
    files,
    version,
    status,
    contentHash: hash,
    previous: previous?.release ?? null,
    catalogComponents: catalog.components.length,
    previews: previews.map((e) => e.id),
    stories: Object.keys(stories),
    issues,
    manifest: kitManifestFields(id, name),
  };
}

function libraryModule(id: string, entries: { id: string; name: string }[]): string {
  const header = `// Written by \`protoyard ds kit ${id}\` from design-systems/${id}/: re-run it, do not edit.\n`;
  // Biome's import order: by source, so '@ds/…' before 'svelte'.
  const imports = [...entries]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((e) => `import ${e.name} from '@ds/${id}/${e.name}';`)
    .join('\n');
  const body =
    entries.length === 0
      ? '{}'
      : `{\n${entries.map((e) => `  ${/^[A-Za-z_$][\w$]*$/.test(e.id) ? e.id : tsString(e.id)}: ${e.name},`).join('\n')}\n}`;
  return `${header}${imports ? `${imports}\n` : ''}import type { Component } from 'svelte';

/** The design system's own components with a source file, keyed by library id. */
export const components: Readonly<Record<string, Component<Record<string, unknown>>>> = ${body};
`;
}

/** The manifest fields the kit owns. */
export function kitManifestFields(id: string, name: string): Record<string, unknown> {
  return {
    description: `The ${name} design system kit: foundations, voice, components, its own library and the changes since the last release, from design-systems/${id}/.`,
    category: 'design-system',
    tags: ['design-system', 'kit', id],
    catalog: {
      category: 'design',
      productType: 'Design system kit',
      platforms: ['web'],
      features: ['component-catalog', 'design-foundations'],
      highlights: [
        `The whole ${name} design system on one page`,
        'Foundations, voice, components and library',
        'Approval with its content-hash check',
      ],
      difficulty: 'beginner',
    },
    icon: '✳️',
    scenarios: ['review'],
    defaultScenario: 'review',
  };
}

function staticFiles(id: string, name: string, slug: string): Record<string, string> {
  const owned = `Written by \`protoyard ds kit ${id}\`: re-run it instead of editing.`;
  return {
    'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="description" content="The ${escapeHtml(name)} design system kit." />
    <link rel="icon" href="./favicon.svg" type="image/svg+xml" />
    <title>${escapeHtml(name)} kit</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`,
    'README.md': `# ${escapeMarkdown(name)} kit

The UI kit of the design system \`${id}\`: the whole design system on one page,
rendered by Texuli's \`DesignSystemKit\` (\`texuli/ds-kit\`) from data. It shows
the foundations (light and dark), the voice and rules, every catalog component
the design system allows with its variants, sizes and states, the design
system's own components with their stories, the approval with its
content-hash check and, when an earlier release exists, what changed since it.

\`protoyard ds kit ${id}\` writes this prototype and refreshes it: re-run it
after the design system changes. \`protoyard ds kit ${id} --check\` fails when
the kit is out of date. Everything under \`src/\` except \`main.ts\` and
\`app.css\` belongs to that command; \`src/design-system.ts\` is written by
\`ds use\`, which the command runs.

\`\`\`bash
pnpm protoyard ds kit ${id}
pnpm protoyard dev ${slug}
pnpm protoyard validate ${slug} --build
\`\`\`

The path names the section and item (\`#/matrix/button\`, \`#/library/status-pill\`),
so links to one part of the kit survive a refresh. The kit stores nothing: its
one scenario only gives the page a reviewer persona.
`,
    'src/App.svelte': `<script lang="ts">
// ${owned}
import { createRouter, Router } from '@protoyard/renderer-svelte';
import KitPage from './screens/KitPage.svelte';

/** One screen: the path names the kit section and item (#/matrix/button), so deep links survive a refresh. */
const router = createRouter(
  [
    {
      path: '/:section?/:item?',
      component: KitPage,
      title: 'Kit',
      name: 'Design system kit',
      description:
        'The design system on one page: foundations, voice, components, library and changes.',
    },
  ],
  { titleSuffix: ${tsString(`${name} kit`)} }
);
</script>

<main id="main" class="mx-auto w-full max-w-7xl px-4 py-6 pb-safe sm:px-6">
  <Router {router} />
</main>
`,
    'src/screens/KitPage.svelte': `<script lang="ts">
// ${owned}
import { navigate, type RouteProps } from '@protoyard/renderer-svelte';
import { DesignSystemKit, type KitLibrarySnippet } from 'texuli/ds-kit';
import { components } from '../kit/library.ts';
import { kit, kitPath, sectionOf } from '../kit/model.ts';

let { params }: RouteProps = $props();

const section = $derived(sectionOf(params.section));
const item = $derived(section && params.item ? params.item : undefined);
const library: Record<string, KitLibrarySnippet> = Object.fromEntries(
  Object.keys(components).map((id) => [id, preview])
);
</script>

{#snippet preview({ id }: { id: string })}
  {@const Preview = components[id]}
  {#if Preview}
    <div class="grid gap-4">
      {#each kit.stories[id] ?? [{ name: 'Default', props: {} }] as story, index (index)}
        <figure class="grid gap-2">
          <figcaption>{story.name}</figcaption>
          <Preview {...story.props} />
        </figure>
      {/each}
    </div>
  {/if}
{/snippet}

<DesignSystemKit
  document={kit.document}
  compiled={kit.compiled}
  allow={kit.allow}
  catalog={kit.catalog}
  previous={kit.previous}
  {library}
  currentSection={section}
  currentItem={item}
  onNavigate={(next, nextItem) => navigate(kitPath(next, nextItem))}
  idPrefix="kit"
/>
`,
    'src/kit/model.ts': `// ${owned}
import type { DesignSystemKitProps, KitSectionId } from 'texuli/ds-kit';
import data from './kit.json';

export interface KitStory {
  name: string;
  props: Record<string, unknown>;
}

/** What \`protoyard ds kit\` writes to kit.json: the props of \`DesignSystemKit\`, from data. */
export interface KitData {
  format: 'protoyard/ds-kit-data';
  version: 1;
  designSystem: string;
  document: DesignSystemKitProps['document'];
  compiled: NonNullable<DesignSystemKitProps['compiled']>;
  /** Texuli's compiled allow manifest (\`compileDesignSystem(...).allowManifest\`). */
  allow?: DesignSystemKitProps['allow'];
  catalog: NonNullable<DesignSystemKitProps['catalog']>;
  /** The release the Changes section compares with. */
  previous?: NonNullable<DesignSystemKitProps['previous']> & { release: string };
  /** Story variants of the library components, keyed by library id. */
  stories: Record<string, KitStory[]>;
}

/**
 * Untrusted data as the kit reads it: \`DesignSystemKit\` validates nothing it
 * does not need and renders text as text only. The cast is for the JSON
 * import, which types every string as \`string\` where the kit's props name
 * literal unions (states, formats); the allow manifest's \`library\` entries
 * already match \`KitAllowManifest\` (\`{ id, status, version }\`).
 */
export const kit = data as unknown as KitData;

export const SECTIONS: readonly KitSectionId[] = [
  'foundations',
  'voice',
  'matrix',
  'library',
  'changes',
];

/** The kit section a path segment names, or undefined (the kit then keeps its own place). */
export function sectionOf(value: string | undefined): KitSectionId | undefined {
  return SECTIONS.find((section) => section === value);
}

/** The hash path of a section and item: \`/matrix/button\`. */
export function kitPath(section: KitSectionId, item?: string): string {
  return item ? \`/\${section}/\${encodeURIComponent(item)}\` : \`/\${section}\`;
}
`,
    'src/prototype.ts': `// ${owned}
import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';
import { designSystemTheme } from './design-system.ts';
import { generateKitWorld } from './scenarios/generators.ts';
import { scenarios } from './scenarios/index.ts';

/** The kit page of a design system: one reviewer, no domain tables, the design system's theme. */
export const definition = definePrototype({
  themes: [designSystemTheme],
  manifest: parseManifest(manifestJson),
  database,
  scenarios,
  generate: generateKitWorld,
  generatorVersion: 1,
});
`,
    'src/database/schema.ts': `// ${owned}
import type { DatabaseDefinition } from '@protoyard/core';

/** The kit stores no domain rows: everything it shows comes from src/kit/kit.json. */
export const database: DatabaseDefinition = {
  versions: [{ version: 1, stores: {} }],
};
`,
    'src/scenarios/index.ts': `// ${owned}
import type { ScenarioInput } from '@protoyard/core';

export const scenarios: ScenarioInput[] = [
  {
    id: 'review',
    name: 'Design review',
    description: 'A designer reviews the design system kit.',
    group: 'Review',
    seed: 1,
    referenceTime: '2026-11-09T09:00:00.000Z',
    density: 'normal',
    organization: { id: 'org_0001', name: 'Design review', ageDays: 30, size: 1 },
    actor: { id: 'user_0001', role: 'reviewer', joinedDaysAgo: 30 },
    generators: {},
  },
];
`,
    'src/scenarios/generators.ts': `// ${owned}
import type { GenerateContext, WorldSeed } from '@protoyard/core';
import { createAvatarPool } from '@protoyard/scenarios';

/** One organization and its reviewer; deterministic (the seed and the reference time only). */
export function generateKitWorld(ctx: GenerateContext): WorldSeed {
  const { scenario, time } = ctx;
  const joined = time.iso(time.daysAgo(scenario.organization.ageDays));
  const faces = createAvatarPool(ctx.rng.fork('kit:avatars'));
  return {
    organizations: [
      {
        id: scenario.organization.id,
        name: scenario.organization.name ?? 'Design review',
        type: 'company',
        plan: 'free',
        billingStatus: 'active',
        createdAt: joined,
        size: 1,
        featureFlags: {},
      },
    ],
    personas: [
      {
        id: 'user_0001',
        name: 'Rae Example',
        avatar: faces.next(),
        email: 'rae@example.com',
        title: 'Design reviewer',
        avatarColor: '#0f766e',
        locale: 'en-US',
        timezone: 'UTC',
        joinedAt: joined,
        onboardingComplete: true,
        preferences: {},
        summary: 'Reviews the design system kit',
      },
    ],
    memberships: [
      {
        id: 'membership_0001',
        personaId: 'user_0001',
        organizationId: scenario.organization.id,
        role: 'reviewer',
        joinedAt: joined,
        capabilities: [],
      },
    ],
    tables: {},
  };
}
`,
    'tests/kit.test.ts': `// ${owned}
import { describe, expect, it } from 'vitest';
import { kit, kitPath, SECTIONS, sectionOf } from '../src/kit/model.ts';

describe('design-system kit', () => {
  it('holds the compiled design system it was written for', () => {
    expect((kit.document as { id?: unknown }).id).toBe(kit.designSystem);
    expect(kit.compiled.id).toBe(kit.designSystem);
    expect(kit.catalog.components.length).toBeGreaterThan(0);
  });

  it('maps every section to a hash path and back', () => {
    for (const section of SECTIONS) {
      expect(sectionOf(kitPath(section).slice(1))).toBe(section);
    }
    expect(kitPath('matrix', 'protoyard:data-table')).toBe('/matrix/protoyard%3Adata-table');
    expect(sectionOf('nowhere')).toBeUndefined();
  });
});
`,
  };
}

/**
 * A design-system name as plain Markdown text: control characters dropped and
 * every character Markdown or HTML reads as syntax escaped, so a name from an
 * untrusted document cannot add headings, links, images or HTML to the
 * README agents read.
 */
export function escapeMarkdown(value: string): string {
  return (
    value
      // biome-ignore lint/suspicious/noControlCharactersInRegex: dropping them is the point.
      .replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ')
      .replace(/[\\`*_{}[\]()#+!|<>~]/g, (c) => `\\${c}`)
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
