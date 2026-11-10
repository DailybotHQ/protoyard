// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { compileDesignSystemDocument } from '@protoyard/themes';
import { SPEC_CATALOG_HASH } from '@texuli/spec';
import {
  approveDesignSystem,
  DESIGN_SYSTEM_FORMAT_VERSION,
  validateDesignSystem,
} from '@texuli/spec/design-system';
import { afterEach, describe, expect, it } from 'vitest';
import {
  allowPreset,
  type CatalogManifestLike,
  catalogFromManifests,
  catalogIdFor,
  checkAllow,
  composedCatalogIds,
  dsCatalog,
  kebabCase,
  mergeWithExtensions,
  specCatalogOf,
} from '../src/lib/ds-catalog.ts';
import { type DsAllowContext, scanDesignSystemSource } from '../src/lib/ds-check/index.ts';
import {
  CATALOG_EXTENSIONS,
  type CatalogExtensionManifest,
  PROTOYARD_UI_EXTENSIONS,
  PROTOYARD_UI_HOST_CHROME,
  PROTOYARD_UI_NON_COMPONENTS,
  PROTOYARD_UI_REEXPORTS,
  toExtensionFiles,
} from '../src/lib/ds-extensions/index.ts';
import { cli, createWorkspace, type TempWorkspace } from './helpers.ts';
import {
  derivedComposition,
  UI_NON_COMPONENT_EXPORTS,
  uiComponentExports,
} from './ui-components.ts';

/**
 * PLAN_013 T-tx015: catalog extension manifests for the Protoyard-own
 * components of `@protoyard/ui`, merged into the Texuli catalog for locked
 * design systems.
 */

/**
 * Texuli imports the `@protoyard/ui` sources use that the Texuli catalog
 * (0.15.0) neither maps to an id nor lists as a non-component: the
 * `@texuli/primitives` headless parts (no catalog by design) and compound
 * parts of `texuli/sheet` and `texuli/navigation` (raised with Texuli). They
 * never reach a prototype tag (only `@protoyard/ui`'s own source), so they do
 * not change a mapping; the list is pinned so a new one is a decision.
 */
const TEXULI_IMPORT_GAPS = [
  '@texuli/primitives/dialog#DialogPrimitiveOverlay',
  '@texuli/primitives/menu#MenuPrimitiveRoot',
  '@texuli/primitives/menu#MenuPrimitiveTrigger',
  '@texuli/primitives/popover#PopoverPrimitiveRoot',
  '@texuli/primitives/popover#PopoverPrimitiveTrigger',
  'texuli/navigation#PaginationNextButton',
  'texuli/navigation#PaginationPreviousButton',
  'texuli/sheet#DetailPanelClose',
  'texuli/sheet#DetailPanelDescription',
  'texuli/sheet#DetailPanelPortal',
  'texuli/sheet#DetailPanelRoot',
  'texuli/sheet#DetailPanelTitle',
  'texuli/sheet#DetailPanelTrigger',
  'texuli/sheet#DrawerDescription',
  'texuli/sheet#DrawerHandle',
  'texuli/sheet#DrawerOverlay',
  'texuli/sheet#DrawerPortal',
  'texuli/sheet#DrawerRoot',
  'texuli/sheet#DrawerTitle',
  'texuli/sheet#DrawerTrigger',
  'texuli/sheet#SheetClose',
  'texuli/sheet#SheetDescription',
  'texuli/sheet#SheetPortal',
  'texuli/sheet#SheetRoot',
  'texuli/sheet#SheetTitle',
  'texuli/sheet#SheetTrigger',
];

const UI_NON_COMPONENT_NAMES = PROTOYARD_UI_NON_COMPONENTS.flatMap((entry) => entry.exports);

describe('@protoyard/ui catalog extensions cover every own component (CI gate)', () => {
  const catalog = dsCatalog();
  const exports = uiComponentExports();
  const own = exports.filter((entry) => entry.file);
  const reexports = exports.filter((entry) => !entry.file);

  it('reads the component exports of @protoyard/ui mechanically', () => {
    expect(own.length).toBeGreaterThan(40);
    expect(reexports.length).toBeGreaterThan(20);
    expect(own.map((e) => e.name)).toEqual(expect.arrayContaining(['DataTable', 'Header']));
    expect(reexports.map((e) => e.name)).toEqual(expect.arrayContaining(['Button', 'Card']));
    for (const name of UI_NON_COMPONENT_EXPORTS) {
      expect(exports.map((e) => e.name)).not.toContain(name);
    }
  });

  it('gives every own component that renders Texuli ones exactly one manifest; the rest are non-components', () => {
    const missing: string[] = [];
    const nonComponents: string[] = [];
    for (const entry of own) {
      const derived = derivedComposition(entry.file as string, catalog);
      const claims = PROTOYARD_UI_EXTENSIONS.filter((m) =>
        m.imports.some((i) => i.module === '@protoyard/ui' && i.exports.includes(entry.name))
      );
      if (derived.ids.length === 0) {
        // Texuli's extension format needs a composes id: renders only non-components or elements.
        nonComponents.push(entry.name);
        expect(claims, `${entry.name} renders no catalog id: no manifest`).toEqual([]);
        expect(derived.unmapped, `${entry.name} renders unmapped Texuli imports`).toEqual([]);
        continue;
      }
      if (claims.length !== 1) missing.push(`${entry.name} (${claims.length} manifests)`);
      else expect(claims[0]?.id).toBe(`protoyard:${kebabCase(entry.name)}`);
    }
    expect(
      missing,
      'Add one manifest per new @protoyard/ui component in packages/cli/src/lib/ds-extensions/protoyard-ui.ts'
    ).toEqual([]);
    expect(nonComponents.sort(), 'PROTOYARD_UI_NON_COMPONENTS').toEqual(
      [...UI_NON_COMPONENT_NAMES].sort()
    );
    const ownNames = new Set(own.map((e) => e.name));
    const stale = PROTOYARD_UI_EXTENSIONS.flatMap((m) =>
      m.imports.flatMap((i) => i.exports)
    ).filter((name) => !ownNames.has(name));
    expect(stale, 'manifests for names @protoyard/ui does not export as its own').toEqual([]);
    expect(PROTOYARD_UI_EXTENSIONS).toHaveLength(own.length - UI_NON_COMPONENT_NAMES.length);
  });

  it('lists every Texuli re-export as the Texuli import it is, and each maps to a Texuli id', () => {
    const scanned = reexports
      .map((e) => ({ module: '@protoyard/ui', name: e.name, from: e.module, export: e.exported }))
      .sort((a, b) => (a.name < b.name ? -1 : 1));
    expect([...PROTOYARD_UI_REEXPORTS].sort((a, b) => (a.name < b.name ? -1 : 1))).toEqual(scanned);
    const byHow = new Map<string, string[]>();
    for (const entry of reexports) {
      const match = catalogIdFor(catalog, '@protoyard/ui', entry.name);
      expect(match.id?.includes(':') ?? false, `${entry.name} must not map to an extension`).toBe(
        false
      );
      // Through the re-export, the same answer as the Texuli import itself.
      expect(match).toEqual(catalogIdFor(catalog, entry.module, entry.exported));
      byHow.set(match.how, [...(byHow.get(match.how) ?? []), entry.name]);
    }
    // Texuli 0.15.0 maps every re-export; AppShell is a Texuli non-component (shell chrome).
    expect([...byHow.keys()].sort()).toEqual(['import', 'non-component']);
    expect(byHow.get('non-component')).toEqual(['AppShell']);
    // Re-exports are never claimed by an extension manifest.
    const claimed = new Set(
      PROTOYARD_UI_EXTENSIONS.flatMap((m) => m.imports.flatMap((i) => i.exports))
    );
    expect(reexports.filter((e) => claimed.has(e.name))).toEqual([]);
  });

  it('keeps composes equal to the Texuli ids each component renders (through its children)', () => {
    const drift: string[] = [];
    const gaps = new Set<string>();
    for (const entry of own) {
      const derived = derivedComposition(entry.file as string, catalog);
      for (const gap of derived.unmapped) gaps.add(gap);
      const manifest = PROTOYARD_UI_EXTENSIONS.find(
        (m) => m.id === `protoyard:${kebabCase(entry.name)}`
      );
      if (!manifest) continue;
      const written = [...manifest.composes].sort();
      if (JSON.stringify(derived.ids) !== JSON.stringify(written)) {
        drift.push(`${entry.name}: composes ${JSON.stringify(derived.ids)}`);
      }
    }
    expect(drift).toEqual([]);
    expect([...gaps].sort()).toEqual(TEXULI_IMPORT_GAPS);
  });

  it('declares axis values the component source really has, each with a default among them', () => {
    const problems: string[] = [];
    for (const entry of own) {
      const manifest = PROTOYARD_UI_EXTENSIONS.find(
        (m) => m.id === `protoyard:${kebabCase(entry.name)}`
      );
      if (!manifest) continue;
      const dir = dirname(entry.file as string);
      const sources = [
        readFileSync(entry.file as string, 'utf8'),
        ...(dir.endsWith('/components')
          ? []
          : readdirSync(dir)
              .filter((f) => f.endsWith('.ts'))
              .map((f) => readFileSync(join(dir, f), 'utf8'))),
      ].join('\n');
      for (const [axis, prop] of Object.entries(manifest.axes ?? {})) {
        const schema = manifest.props.find((p) => p.name === prop);
        if (!schema?.enumValues?.length) {
          problems.push(`${manifest.id}: axis ${axis} needs an enum prop`);
          continue;
        }
        if (!schema.enumValues.includes(schema.default as string)) {
          problems.push(`${manifest.id}: ${prop} default is not one of its values`);
        }
        if (!new RegExp(`\\b${prop}\\??\\s*[:=]`).test(sources)) {
          problems.push(`${manifest.id}: no ${prop} prop in the source`);
        }
        // Values typed in the source (Texuli-typed props are checked by the Texuli types).
        if (/ComponentProps</.test(sources) && manifest.id === 'protoyard:select') continue;
        for (const value of schema.enumValues) {
          if (!sources.includes(`'${value}'`)) {
            problems.push(`${manifest.id}: ${prop} "${value}" is not in the source`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("merges every shipped extension through Texuli's mergeCatalogs: ok, one namespace", () => {
    expect(catalog.extensionRefusals).toEqual([]);
    expect(catalog.merge).toEqual({
      ok: true,
      catalogHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      extensions: [{ namespace: 'protoyard', digest: expect.stringMatching(/^[0-9a-f]{64}$/) }],
    });
    expect(catalog.merge?.catalogHash).not.toBe(SPEC_CATALOG_HASH);
    expect(catalog.extensions.map((c) => c.id)).toEqual(CATALOG_EXTENSIONS.map((m) => m.id));
    expect(catalog.extensions).toHaveLength(57);
    for (const id of PROTOYARD_UI_HOST_CHROME) expect(catalog.byId.has(id)).toBe(true);
  });
});

const ext = (
  id: string,
  composes: readonly string[],
  exports: readonly string[] = ['X']
): CatalogExtensionManifest => ({
  id,
  package: '@acme/ui',
  label: id,
  summary: id,
  group: 'acme',
  tier: 'app',
  useWhen: [],
  dontUseWhen: [],
  a11y: [],
  props: [{ name: 'tone', kind: 'enum', enumValues: ['calm', 'loud'], default: 'calm' }],
  examples: [],
  axes: { tone: 'tone' },
  states: ['hover'],
  imports: [{ module: '@acme/ui', exports }],
  composes,
});

describe("mergeWithExtensions (Texuli's mergeCatalogs decides, with its codes)", () => {
  const texuli: CatalogManifestLike[] = [
    { id: 'button', package: 'texuli', imports: [{ module: 'texuli', exports: ['Button'] }] },
    { id: 'card', package: 'texuli' },
  ];
  const refused = (extensions: CatalogExtensionManifest[]) =>
    mergeWithExtensions(texuli, extensions).refusals.map((r) => [r.code, r.id, r.path]);

  it('merges namespaced extensions whose composes resolve, one extension file per namespace', () => {
    const merged = mergeWithExtensions(texuli, [
      ext('acme:panel', ['card', 'button'], ['Panel']),
      ext('acme:strip', ['acme:panel'], ['Strip']),
      ext('beta:list', ['card'], ['List']),
    ]);
    expect(merged.refusals).toEqual([]);
    expect(merged.manifests.map((m) => m.id)).toEqual([
      'button',
      'card',
      'acme:panel',
      'acme:strip',
      'beta:list',
    ]);
    expect(merged.merge.ok).toBe(true);
    expect(merged.merge.extensions.map((e) => e.namespace)).toEqual(['acme', 'beta']);
    expect(toExtensionFiles([ext('acme:panel', ['card'])])[0]?.file).toEqual({
      format: 'texuli/catalog-extension',
      version: 1,
      namespace: 'acme',
      components: [
        {
          id: 'acme:panel',
          label: 'acme:panel',
          summary: 'acme:panel',
          group: 'acme',
          placement: 'app',
          emit: [],
          capability: 'web-only',
          props: [{ name: 'tone', kind: 'enum', enumValues: ['calm', 'loud'] }],
          axes: { tone: { prop: 'tone', values: ['calm', 'loud'], default: 'calm' } },
          states: ['hover'],
          composes: ['card'],
        },
      ],
    });
  });

  it('refuses a missing or reserved namespace with extension-namespace', () => {
    expect(refused([ext('panel', ['card'])])).toEqual([
      ['extension-namespace', '*', 'extensions[0].namespace'],
    ]);
    expect(refused([ext('texuli:panel', ['card'])])).toEqual([
      ['extension-namespace', 'texuli:*', 'extensions[0].namespace'],
    ]);
  });

  it('refuses unresolved composes with extension-composes, and the whole file with it; a leaf (empty composes) merges', () => {
    const merged = mergeWithExtensions(texuli, [
      ext('acme:panel', ['card'], ['Panel']),
      ext('acme:ghost', ['card', 'no-such-id'], ['Ghost']),
      ext('beta:empty', [], ['Empty']),
    ]);
    expect(merged.refusals.map((r) => [r.code, r.id, r.path])).toEqual([
      ['extension-composes', 'acme:ghost', 'extensions[0].components[1].composes[1]'],
    ]);
    expect(merged.refusals[0]?.message).toContain('no-such-id');
    // Texuli refuses an extension file whole: acme:panel goes with acme:ghost.
    // Texuli 0.15.0 accepts a leaf extension (no composes), so beta:empty merges.
    expect(merged.manifests.map((m) => m.id)).toEqual(['button', 'card', 'beta:empty']);
    expect(merged.merge.ok).toBe(false);
  });

  it('refuses a duplicate id (Texuli) and a colliding import (checked here)', () => {
    expect(
      refused([ext('acme:panel', ['card'], ['A']), ext('acme:panel', ['card'], ['B'])])
    ).toEqual([['extension-collision', 'acme:panel', 'extensions[0].components[1].id']]);
    expect(
      refused([ext('acme:panel', ['card'], ['A']), ext('beta:panel', ['card'], ['A'])])
    ).toEqual([['extension-collision', 'beta:panel', '$.extensions[1].imports']]);
    // An extension cannot claim a Texuli import either.
    const claimsTexuli = ext('acme:button', ['button']);
    claimsTexuli.imports = [{ module: 'texuli', exports: ['Button'] }];
    expect(refused([claimsTexuli])).toEqual([
      ['extension-collision', 'acme:button', '$.extensions[0].imports'],
    ]);
  });

  it('passes Texuli the installed catalog in its SpecCatalog shape', () => {
    const catalog = dsCatalog();
    const texuliIds = catalog.components.filter((c) => !c.composes).map((c) => c.id);
    const spec = specCatalogOf(
      texuliIds.map((id) => ({ id, package: 'texuli', group: 'g', tier: 'content' }))
    );
    expect(spec.catalogHash).toBe(SPEC_CATALOG_HASH);
    expect(spec.components.map((c) => c.id)).toEqual([...texuliIds].sort());
    expect(spec.components[0]).toMatchObject({ placement: 'content', capability: 'unknown' });
    // Nothing to merge: Texuli answers with the catalog's own hash.
    const empty = mergeWithExtensions([], []);
    expect(empty.merge).toEqual({ ok: true, catalogHash: SPEC_CATALOG_HASH, extensions: [] });
  });
});

describe('the merged catalog: mapper, presets, allow checks and Texuli on the full document', () => {
  const catalog = dsCatalog();

  it('maps own components to extension ids, re-exports to Texuli ids, non-components to none', () => {
    const map = (module: string, name: string) => catalogIdFor(catalog, module, name);
    expect(map('@protoyard/ui', 'DataTable')).toEqual({
      id: 'protoyard:data-table',
      how: 'extension',
    });
    expect(map('@protoyard/ui', 'Button')).toEqual({ id: 'button', how: 'import' });
    // Aliased and default re-exports follow the Texuli import.
    expect(map('@protoyard/ui', 'FormField')).toEqual({ id: 'field', how: 'import' });
    expect(map('@protoyard/ui', 'RadioGroupItem')).toEqual({ id: 'radio', how: 'import' });
    expect(map('@protoyard/ui', 'SplitView')).toEqual({ id: 'split-view', how: 'import' });
    // Non-components: Texuli's list, and own components that render no catalog id.
    expect(map('@protoyard/ui', 'AppShell')).toEqual({ id: null, how: 'non-component' });
    expect(map('@protoyard/ui', 'SafeArea')).toEqual({ id: null, how: 'non-component' });
    // Since Texuli 0.15.0 the input wrappers render catalog components.
    expect(map('@protoyard/ui', 'StarRating')).toEqual({
      id: 'protoyard:star-rating',
      how: 'extension',
    });
    expect(map('texuli/motion', 'MotionProvider')).toEqual({ id: null, how: 'non-component' });
    expect(map('texuli', 'SafeArea')).toEqual({ id: null, how: 'non-component' });
    // A name @protoyard/ui does not list never maps by name.
    expect(map('@protoyard/ui', 'NoSuchThing')).toEqual({ id: null, how: 'unmapped' });
    expect(map('texuli/table', 'Table')).toEqual({ id: 'table', how: 'import' });
    // An extension import from another module does not map; names never reach an extension.
    expect(map('texuli', 'DataTable')).toEqual({ id: null, how: 'unmapped' });
    expect(
      composedCatalogIds(
        "<script>import { DataTable, Button, AppShell } from '@protoyard/ui';</script><AppShell><DataTable /><Button /></AppShell>"
      )
    ).toEqual(['button', 'protoyard:data-table']);
  });

  it('carries extension axes into the allow catalog', () => {
    expect(catalog.byId.get('protoyard:notice')?.axes.tone).toEqual({
      prop: 'tone',
      values: ['info', 'success', 'warning', 'error', 'brand'],
    });
    expect(catalog.allowCatalog.components.length).toBe(
      catalog.texuliAllowCatalog.components.length + catalog.extensions.length
    );
  });

  it('all lists every extension; minimal lists exactly the ones its Texuli set covers', () => {
    const all = allowPreset('all');
    for (const extension of catalog.extensions) expect(all).toHaveProperty([extension.id]);
    const minimal = Object.keys(allowPreset('minimal'));
    // dialog; input; card; select parts through select. Not kanban (data-board), avatar, icon…
    expect(minimal.filter((id) => id.includes(':'))).toEqual([
      'protoyard:dialog',
      'protoyard:input',
      'protoyard:page-grid',
      'protoyard:select',
    ]);
    expect([...minimal].sort()).toEqual(minimal);
  });

  it('checkAllow checks extension keys, values and composes against the merged catalog', () => {
    expect(checkAllow({ allow: { 'protoyard:notice': { tones: ['info'] } } }).ok).toBe(true);
    const bad = checkAllow({
      allow: {
        'protoyard:notice': { tones: ['loud'] },
        'protoyard:no-such': {},
      },
      library: [{ id: 'a', composes: ['protoyard:data-table', 'acme:x'] }],
    });
    expect(bad.errors.map((e) => `${e.code} ${e.path}`)).toEqual([
      'unknown-tone $.allow["protoyard:notice"].tones[0]',
      'unknown-component $.allow["protoyard:no-such"]',
      'unknown-component $.library[0].composes[1]',
    ]);
  });

  it('Texuli validates, compiles and approves the full document, extension keys included', async () => {
    const document = {
      format: 'texuli/design-system',
      formatVersion: DESIGN_SYSTEM_FORMAT_VERSION,
      id: 'harbor',
      version: '0.1.0',
      name: 'Harbor',
      color: { brand: { seed: '#0f766e' } },
      allow: { button: { tones: ['default'] }, 'protoyard:data-table': {} },
      library: [
        {
          id: 'order-panel',
          name: 'OrderPanel',
          purpose: 'An order with its actions.',
          version: '0.1.0',
          status: 'draft',
          composes: ['button', 'protoyard:dialog'],
        },
      ],
    };
    expect(validateDesignSystem(document, { trust: 'untrusted' })).toMatchObject({ ok: true });
    expect(checkAllow(document)).toMatchObject({ ok: true });
    const compiled = await compileDesignSystemDocument(document);
    expect(compiled.ok, JSON.stringify(compiled)).toBe(true);
    const approved = approveDesignSystem(document, {
      by: 'Ada Example',
      at: '2026-11-09T00:00:00.000Z',
    });
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.document.allow).toHaveProperty(['protoyard:data-table']);
    expect(approved.document.library?.[0]?.composes).toEqual(['button', 'protoyard:dialog']);
    expect(approved.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('check ds governs extension components', () => {
  const catalog = dsCatalog();
  const context = (allow: DsAllowContext['allow']): DsAllowContext => ({
    catalog,
    designSystemId: 'harbor',
    allow,
    library: [],
  });
  const source = `<script>
  import { Notice, StatusChip } from '@protoyard/ui';
</script>
<Notice tone="warning">Heads up</Notice>
<StatusChip tone="brand" />
`;

  it('ds-not-allowed: an own component is allowed only through its extension id', () => {
    const notAllowed = scanDesignSystemSource('src/A.svelte', source, {
      allow: context({ alert: {}, badge: {} }),
    });
    expect(notAllowed.map((v) => [v.rule, v.line, v.message.includes('protoyard:notice')])).toEqual(
      [
        ['ds-not-allowed', 4, true],
        ['ds-not-allowed', 5, false],
      ]
    );
    const allowed = scanDesignSystemSource('src/A.svelte', source, {
      allow: context({ 'protoyard:notice': {}, 'protoyard:status-chip': {} }),
    });
    expect(allowed).toEqual([]);
  });

  it('ds-disabled-value applies to extension axes', () => {
    const found = scanDesignSystemSource('src/A.svelte', source, {
      allow: context({
        'protoyard:notice': { tones: ['info'] },
        'protoyard:status-chip': { tones: ['brand'] },
      }),
    });
    expect(found.map((v) => [v.rule, v.line])).toEqual([['ds-disabled-value', 4]]);
    expect(found[0]?.message).toContain('tone "warning" of "protoyard:notice"');
  });
});

describe('ds new, validate and approve with extension keys', { timeout: 60_000 }, () => {
  let ws: TempWorkspace | undefined;
  afterEach(() => {
    ws?.cleanup();
    ws = undefined;
  });
  const run = (...args: string[]) =>
    cli(['--root', (ws as TempWorkspace).root, '--json', 'ds', ...args]);
  const read = (path: string) =>
    JSON.parse(readFileSync(join((ws as TempWorkspace).root, path), 'utf8')) as Record<
      string,
      unknown
    >;

  it('writes extension keys, validates, approves over the full document and stays lockable', async () => {
    ws = createWorkspace();
    const created = await run('new', 'harbor', '--brand', '#0f766e', '--allow', 'all');
    expect(created.code, created.stdout).toBe(0);
    const allow = read('design-systems/harbor/document.json').allow as Record<string, unknown>;
    expect(Object.keys(allow)).toEqual(Object.keys(allowPreset('all')));
    expect(allow['protoyard:notice']).toEqual({
      tones: ['info', 'success', 'warning', 'error', 'brand'],
    });

    const validated = await run('validate', 'harbor');
    expect(validated.code, validated.stdout).toBe(0);

    const approved = await run('approve', 'harbor', '--by', 'Ada Example');
    expect(approved.code, approved.stdout).toBe(0);
    const document = read('design-systems/harbor/document.json');
    expect(document.allow).toHaveProperty(['protoyard:data-table']);
    expect(document.approval).toMatchObject({ status: 'approved', approvedBy: 'Ada Example' });

    const after = await run('validate', 'harbor');
    expect(after.code, after.stdout).toBe(0);
    expect(after.json<{ data: { lockRefusal: string | null } }>().data.lockRefusal ?? null).toBe(
      null
    );
  });

  it('refuses an unknown extension key or value from an allow file', async () => {
    ws = createWorkspace();
    ws.write('tmp/allow.json', { button: {}, 'protoyard:notice': { tones: ['loud'] } });
    const bad = await run('new', 'bad', '--brand', '#0f766e', '--allow', 'tmp/allow.json');
    expect(bad.code).not.toBe(0);
    expect(bad.json<{ data: { errors: { code: string; path: string }[] } }>().data.errors).toEqual([
      expect.objectContaining({
        code: 'unknown-tone',
        path: '$.allow["protoyard:notice"].tones[0]',
      }),
    ]);

    ws.write('tmp/narrow.json', { 'protoyard:notice': { tones: ['info'] }, button: {} });
    const narrow = await run('new', 'narrow', '--brand', '#0f766e', '--allow', 'tmp/narrow.json');
    expect(narrow.code, narrow.stdout).toBe(0);
    expect(read('design-systems/narrow/document.json').allow).toEqual({
      'protoyard:notice': { tones: ['info'] },
      button: {},
    });
  });
});

describe('catalogFromManifests keeps Texuli import mapping separate from extensions', () => {
  it('extension imports do not switch Texuli modules to import-only mapping', () => {
    const merged = mergeWithExtensions(
      [{ id: 'card', package: 'texuli' }],
      [ext('acme:panel', ['card'], ['Panel'])]
    );
    const catalog = catalogFromManifests(merged.manifests as CatalogManifestLike[]);
    expect(catalog.hasImports).toBe(false);
    expect(catalogIdFor(catalog, 'texuli/card', 'Card')).toEqual({ id: 'card', how: 'exact' });
    expect(catalogIdFor(catalog, '@acme/ui', 'Panel')).toEqual({
      id: 'acme:panel',
      how: 'extension',
    });
  });
});

describe('ds extensions: the files Texuli check takes', { timeout: 60_000 }, () => {
  let ws: TempWorkspace | undefined;
  afterEach(() => {
    ws?.cleanup();
    ws = undefined;
  });

  it('writes Texuli extension files that make texuli ds check accept the same allow keys', async () => {
    ws = createWorkspace();
    const root = ws.root;
    const written = await cli(['--root', root, '--json', 'ds', 'extensions', '--out', 'tmp/ext']);
    expect(written.code, written.stdout).toBe(0);
    const data = written.json<{ data: { files: { path: string; components: number }[] } }>().data;
    expect(data.files).toEqual([
      { path: 'tmp/ext/protoyard.catalog-extension.json', namespace: 'protoyard', components: 57 },
    ]);
    const file = JSON.parse(
      readFileSync(join(root, 'tmp/ext/protoyard.catalog-extension.json'), 'utf8')
    );
    expect(file).toMatchObject({ format: 'texuli/catalog-extension', namespace: 'protoyard' });

    // Texuli's own merge accepts them whole: every protoyard: id joins the catalog.
    const { loadMergedCatalog } = await import('@texuli/tools/ds-check');
    const merged = await loadMergedCatalog([file]);
    expect(merged.ok).toBe(true);
    expect(merged.issues).toEqual([]);
    const ids = new Set(merged.catalog.components.map((c: { id: string }) => c.id));
    for (const key of Object.keys(allowPreset('all')).filter((k) => k.startsWith('protoyard:'))) {
      expect(ids.has(key), key).toBe(true);
    }

    const outside = await cli([
      '--root',
      root,
      '--json',
      'ds',
      'extensions',
      '--out',
      '../elsewhere',
    ]);
    expect(outside.code).not.toBe(0);
    expect(outside.json<{ error?: { code: string } }>().error?.code).toBe('unsafe_path');
  });
});
