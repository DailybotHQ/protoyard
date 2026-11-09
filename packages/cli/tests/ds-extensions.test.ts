// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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
  namespacedAllowKeys,
  texuliView,
} from '../src/lib/ds-catalog.ts';
import { type DsAllowContext, scanDesignSystemSource } from '../src/lib/ds-check/index.ts';
import {
  CATALOG_EXTENSIONS,
  type CatalogExtensionManifest,
  mergeCatalogManifests,
  PROTOYARD_UI_EXTENSIONS,
  PROTOYARD_UI_HOST_CHROME,
  TEXULI_ANNOUNCED_IDS,
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
 * Texuli re-exports of `@protoyard/ui` that no Texuli catalog id covers yet
 * and that Texuli has not announced either. Raise them with Texuli; never give
 * them a Protoyard extension (they are Texuli's components). A new entry here
 * is a deliberate decision, so the list is pinned.
 */
const TEXULI_REEXPORT_GAPS = ['AppShell', 'TypingIndicator', 'Wizard'];

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

  it('gives every Protoyard-own component exactly one extension manifest, and nothing else one', () => {
    const missing: string[] = [];
    for (const entry of own) {
      const claims = PROTOYARD_UI_EXTENSIONS.filter((m) =>
        m.imports.some((i) => i.module === '@protoyard/ui' && i.exports.includes(entry.name))
      );
      if (claims.length !== 1) missing.push(`${entry.name} (${claims.length} manifests)`);
      else expect(claims[0]?.id).toBe(`protoyard:${kebabCase(entry.name)}`);
    }
    expect(
      missing,
      'Add one manifest per new @protoyard/ui component in packages/cli/src/lib/ds-extensions/protoyard-ui.ts'
    ).toEqual([]);
    const ownNames = new Set(own.map((e) => e.name));
    const stale = PROTOYARD_UI_EXTENSIONS.flatMap((m) =>
      m.imports.flatMap((i) => i.exports)
    ).filter((name) => !ownNames.has(name));
    expect(stale, 'manifests for names @protoyard/ui does not export as its own').toEqual([]);
  });

  it('maps every Texuli re-export to a Texuli id, an announced id, or a pinned gap', () => {
    const announced: string[] = [];
    const gaps: string[] = [];
    for (const entry of reexports) {
      const match = catalogIdFor(catalog, entry.module, entry.name);
      expect(match.id?.includes(':') ?? false, `${entry.name} must not map to an extension`).toBe(
        false
      );
      if (match.id) continue;
      if (TEXULI_ANNOUNCED_IDS.includes(kebabCase(entry.name))) announced.push(entry.name);
      else gaps.push(entry.name);
    }
    expect(gaps.sort()).toEqual(TEXULI_REEXPORT_GAPS);
    // Re-exports are never claimed by an extension manifest.
    const claimed = new Set(
      PROTOYARD_UI_EXTENSIONS.flatMap((m) => m.imports.flatMap((i) => i.exports))
    );
    expect(reexports.filter((e) => claimed.has(e.name))).toEqual([]);
    expect(announced.length).toBeGreaterThan(0);
  });

  it('keeps composes equal to the Texuli ids each component renders (through its children)', () => {
    const drift: string[] = [];
    for (const entry of own) {
      const manifest = PROTOYARD_UI_EXTENSIONS.find(
        (m) => m.id === `protoyard:${kebabCase(entry.name)}`
      );
      const derived = derivedComposition(entry.file as string, catalog).ids;
      const written = [...(manifest?.composes ?? [])].sort();
      if (JSON.stringify(derived) !== JSON.stringify(written)) {
        drift.push(`${entry.name}: composes ${JSON.stringify(derived)}`);
      }
    }
    expect(drift).toEqual([]);
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

  it('merges every shipped extension with no refusal, host chrome included', () => {
    expect(catalog.extensionRefusals).toEqual([]);
    expect(catalog.extensions.map((c) => c.id)).toEqual(CATALOG_EXTENSIONS.map((m) => m.id));
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

describe('mergeCatalogManifests (the refusal rules agreed with Texuli)', () => {
  const texuli: CatalogManifestLike[] = [
    { id: 'button', package: 'texuli' },
    { id: 'card', package: 'texuli' },
  ];

  it('merges namespaced extensions whose composes resolve', () => {
    const merged = mergeCatalogManifests(texuli, [ext('acme:panel', ['card', 'button'])]);
    expect(merged.refusals).toEqual([]);
    expect(merged.manifests.map((m) => m.id)).toEqual(['button', 'card', 'acme:panel']);
  });

  it('refuses a missing or reserved namespace, a collision and unresolved composes', () => {
    const merged = mergeCatalogManifests(texuli, [
      ext('panel', ['card'], ['A']),
      ext('texuli:panel', ['card'], ['B']),
      ext('acme:panel', ['card'], ['C']),
      ext('acme:panel', ['card'], ['D']),
      ext('acme:other', ['card'], ['C']),
      ext('acme:ghost', ['card', 'no-such-id'], ['E']),
    ]);
    expect(merged.refusals.map((r) => [r.code, r.id])).toEqual([
      ['namespace-required', 'panel'],
      ['namespace-required', 'texuli:panel'],
      ['id-collision', 'acme:panel'],
      ['id-collision', 'acme:other'],
      ['composes-unresolved', 'acme:ghost'],
    ]);
    expect(merged.refusals[4]?.message).toContain('no-such-id');
    expect(merged.extensions.map((m) => m.id)).toEqual(['acme:panel']);
  });

  it('mergeWithExtensions uses the local merge while Texuli has no mergeCatalogs', () => {
    const merged = mergeWithExtensions(texuli, [ext('acme:panel', ['card'])]);
    expect(merged.manifests.map((m) => m.id)).toEqual(['button', 'card', 'acme:panel']);
  });
});

describe('the merged catalog: mapper, presets, allow checks and the Texuli view', () => {
  const catalog = dsCatalog();

  it('maps own @protoyard/ui components to extension ids and leaves the rest unchanged', () => {
    expect(catalogIdFor(catalog, '@protoyard/ui', 'DataTable')).toEqual({
      id: 'protoyard:data-table',
      how: 'extension',
    });
    expect(catalogIdFor(catalog, '@protoyard/ui', 'Button')).toEqual({
      id: 'button',
      how: 'exact',
    });
    expect(catalogIdFor(catalog, 'texuli/table', 'Table')).toEqual({ id: 'table', how: 'exact' });
    // An extension import from another module does not map; names never reach an extension.
    expect(catalogIdFor(catalog, 'texuli', 'DataTable').id).not.toBe('protoyard:data-table');
    expect(
      composedCatalogIds(
        "<script>import { DataTable, Button } from '@protoyard/ui';</script><DataTable /><Button />"
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

  it('all lists every extension; minimal lists the ones its Texuli set covers', () => {
    const all = allowPreset('all');
    for (const extension of catalog.extensions) expect(all).toHaveProperty([extension.id]);
    const minimal = Object.keys(allowPreset('minimal'));
    expect(minimal).toContain('protoyard:dialog'); // composes dialog
    expect(minimal).toContain('protoyard:select'); // select parts through select
    expect(minimal).not.toContain('protoyard:kanban'); // composes data-board
    expect(minimal).not.toContain('protoyard:avatar'); // composes nothing the catalog knows yet
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

  it('texuliView drops extension keys and flattens extension composes while Texuli refuses them', () => {
    const document = {
      id: 'x',
      allow: { button: {}, 'protoyard:data-table': {} },
      library: [{ id: 'panel', composes: ['card', 'protoyard:dialog'] }],
    };
    const view = texuliView(document);
    if (namespacedAllowKeys()) {
      expect(view).toBe(document);
      return;
    }
    expect(view).toEqual({
      id: 'x',
      allow: { button: {} },
      library: [{ id: 'panel', composes: ['card', 'dialog'] }],
    });
    expect(document.allow).toHaveProperty(['protoyard:data-table']);
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
    const merged = mergeCatalogManifests(
      [{ id: 'card', package: 'texuli' } as CatalogManifestLike],
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
