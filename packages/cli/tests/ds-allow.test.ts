// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MINIMAL_LOCKED_COMPONENTS } from '@texuli/spec/design-system';
import { afterEach, describe, expect, it } from 'vitest';
import {
  allowedVia,
  type CatalogManifestLike,
  catalogFromManifests,
  catalogIdFor,
  composedCatalogIds,
  dsCatalog,
  importedNames,
  isPartOf,
  kebabCase,
  pascalCase,
} from '../src/lib/ds-catalog.ts';
import { addPrototype, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

/**
 * PLAN_013 T-tx015: the allow section of a locked design system (Texuli spec
 * 0.13.0) and the mapper from imported components to catalog ids.
 */

type Envelope<T> = {
  ok: boolean;
  data: T;
  error?: { code: string; message: string; hint?: string; data?: unknown };
};

const PROTOTYPE = `import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';

export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
});
`;

describe('the catalog and the mapper', () => {
  const catalog = dsCatalog();

  it('builds the allow catalog from every Texuli manifest, with axes and states', () => {
    expect(catalog.components.length).toBeGreaterThan(100);
    expect(catalog.allowCatalog.components).toHaveLength(catalog.components.length);
    const button = catalog.byId.get('button');
    expect(button?.axes.variant?.prop).toBe('variant');
    expect(button?.axes.variant?.values).toContain('ghost');
    expect(button?.states.length).toBeGreaterThan(0);
    expect(dsCatalog()).toBe(catalog);
  });

  it('maps an exact name, a compound part and a package-qualified name; others are unmapped', () => {
    expect(catalogIdFor(catalog, 'texuli/button', 'Button')).toEqual({
      id: 'button',
      how: 'exact',
    });
    expect(catalogIdFor(catalog, 'texuli', 'AlertDialog')).toEqual({
      id: 'alert-dialog',
      how: 'exact',
    });
    // A catalog id of its own wins over the prefix (select-trigger, not select).
    expect(catalogIdFor(catalog, 'texuli/select', 'SelectTrigger')).toEqual({
      id: 'select-trigger',
      how: 'exact',
    });
    expect(catalogIdFor(catalog, 'texuli/card', 'CardHeader')).toEqual({
      id: 'card',
      how: 'prefix',
    });
    // The prefix must end at a word boundary.
    expect(catalogIdFor(catalog, 'texuli', 'Selector')).toEqual({ id: null, how: 'unmapped' });
    expect(catalogIdFor(catalog, '@texuli/data', 'Grid')).toEqual({
      id: 'data-grid',
      how: 'package',
    });
    // @protoyard/ui re-exports map by name the same way.
    expect(catalogIdFor(catalog, '@protoyard/ui', 'Button')).toEqual({
      id: 'button',
      how: 'exact',
    });
    expect(catalogIdFor(catalog, 'texuli/icons', 'Icon')).toEqual({ id: null, how: 'unmapped' });
    // Not a governed module.
    expect(catalogIdFor(catalog, 'bits-ui', 'Button')).toEqual({ id: null, how: 'unmapped' });
  });

  it('maps by the manifest imports first when the catalog lists them (Texuli drop 2)', () => {
    const manifests: CatalogManifestLike[] = [
      {
        id: 'button',
        package: 'texuli',
        imports: [
          { module: 'texuli/button', exports: ['Button'] },
          { module: 'texuli', exports: ['Button'] },
        ],
      },
      {
        id: 'card',
        package: 'texuli',
        imports: [{ module: 'texuli/card', exports: ['Card', 'CardHeader', 'Panel'] }],
      },
    ];
    const withImports = catalogFromManifests(manifests);
    expect(withImports.hasImports).toBe(true);
    expect(catalogIdFor(withImports, 'texuli/card', 'Panel')).toEqual({
      id: 'card',
      how: 'import',
    });
    expect(catalogIdFor(withImports, 'texuli', 'Button')).toEqual({ id: 'button', how: 'import' });
    // A Texuli export the catalog does not list never falls back to names.
    expect(catalogIdFor(withImports, 'texuli/card', 'CardFooter')).toEqual({
      id: null,
      how: 'unmapped',
    });
    // @protoyard/ui maps by a unique export name, else by name.
    expect(catalogIdFor(withImports, '@protoyard/ui', 'Panel')).toEqual({
      id: 'card',
      how: 'import',
    });
    expect(catalogIdFor(withImports, '@protoyard/ui', 'CardTitle')).toEqual({
      id: 'card',
      how: 'prefix',
    });
    // Without imports the same manifests map by name.
    const byName = catalogFromManifests(manifests.map(({ imports: _imports, ...m }) => m));
    expect(byName.hasImports).toBe(false);
    expect(catalogIdFor(byName, 'texuli/card', 'CardFooter')).toEqual({
      id: 'card',
      how: 'prefix',
    });
    expect(catalogIdFor(byName, 'texuli/card', 'Panel')).toEqual({ id: null, how: 'unmapped' });
  });

  it('knows catalog parts from ids and related, and reads imports and tags', () => {
    expect(isPartOf(catalog, 'select-trigger', 'select')).toBe(true);
    expect(isPartOf(catalog, 'alert-dialog', 'alert')).toBe(false);
    expect(allowedVia(catalog, ['select'], 'select-item')).toBe('select');
    expect(allowedVia(catalog, ['alert'], 'alert-dialog')).toBeNull();
    expect(pascalCase('dropdown-menu-item')).toBe('DropdownMenuItem');
    expect(kebabCase('StatusPill')).toBe('status-pill');
    expect(kebabCase('KPITile')).toBe('kpi-tile');
    expect(
      importedNames(
        "import X, { A, B as C, type D } from 'texuli';\nimport type { E } from 'texuli';\nimport * as NS from 'texuli/tabs';"
      )
    ).toEqual([
      { local: 'X', exported: 'X', module: 'texuli' },
      { local: 'A', exported: 'A', module: 'texuli' },
      { local: 'C', exported: 'B', module: 'texuli' },
      { local: 'NS', exported: 'NS', module: 'texuli/tabs', namespace: true },
    ]);
    expect(
      composedCatalogIds(
        "<script>import { Card, CardContent } from 'texuli/card'; import { Badge } from 'texuli/badge'; import { Kbd } from 'other';</script><Card><CardContent><Badge /></CardContent></Card><Kbd />"
      )
    ).toEqual(['badge', 'card']);
  });
});

describe('ds new --allow, ds validate and ds allow init', () => {
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

  it('writes the all preset by default, and minimal, a file or none on request', async () => {
    ws = createWorkspace();
    expect((await run('new', 'every', '--brand', '#0f766e')).code).toBe(0);
    const every = read('design-systems/every/document.json');
    expect(Object.keys(every.allow as object)).toHaveLength(dsCatalog().components.length);
    expect(every.approval).toMatchObject({ status: 'draft' });

    const minimal = await run('new', 'core', '--brand', '#0f766e', '--allow', 'minimal');
    expect(minimal.code, minimal.stdout).toBe(0);
    expect(Object.keys(read('design-systems/core/document.json').allow as object).sort()).toEqual(
      [...MINIMAL_LOCKED_COMPONENTS].sort()
    );

    ws.write('tmp/allow.json', { button: { variants: ['default'] }, card: {} });
    expect(
      (await run('new', 'narrow', '--brand', '#0f766e', '--allow', 'tmp/allow.json')).code
    ).toBe(0);
    expect(read('design-systems/narrow/document.json').allow).toEqual({
      button: { variants: ['default'] },
      card: {},
    });

    const none = await run('new', 'loose', '--brand', '#0f766e', '--allow', 'none');
    expect(none.code, none.stdout).toBe(0);
    const loose = read('design-systems/loose/document.json');
    expect(loose.allow).toBeUndefined();
    expect(loose.approval).toBeUndefined();
    const validated = await run('validate', 'loose');
    expect(validated.json<Envelope<{ locked: boolean; lockRefusal: string }>>().data).toMatchObject(
      {
        locked: false,
        lockRefusal: expect.stringContaining('ds allow init loose'),
      }
    );

    ws.write('tmp/bad-allow.json', { button: { variants: ['sparkly'] } });
    const bad = await run('new', 'bad', '--brand', '#0f766e', '--allow', 'tmp/bad-allow.json');
    expect(bad.code).not.toBe(0);
    expect(bad.stdout).toContain('unknown-variant at $.allow.button.variants[0]');
    expect((await run('new', 'odd', '--brand', '#0f766e', '--allow', 'some')).code).not.toBe(0);
  });

  it('ds validate reports catalog codes with JSON paths and fails on an invalid allow', async () => {
    ws = createWorkspace();
    expect((await run('new', 'harbor', '--brand', '#0f766e', '--allow', 'minimal')).code).toBe(0);
    const ok = await run('validate', 'harbor');
    expect(ok.code, ok.stdout).toBe(0);
    expect(
      ok.json<Envelope<{ locked: boolean; allowComponents: number; approvalSource: string }>>().data
    ).toMatchObject({
      locked: true,
      allowComponents: MINIMAL_LOCKED_COMPONENTS.length,
      approvalSource: 'document',
    });

    const document = read('design-systems/harbor/document.json');
    ws.write('design-systems/harbor/document.json', {
      ...document,
      allow: { ...(document.allow as object), button: { sizes: ['huge'] }, 'no-such-thing': {} },
      library: [
        {
          id: 'pill',
          name: 'Pill',
          purpose: 'p',
          version: '0.1.0',
          status: 'draft',
          composes: ['ghost-widget'],
        },
      ],
    });
    const bad = await run('validate', 'harbor');
    expect(bad.code).toBe(4);
    const { errors } = bad.json<Envelope<{ errors: { code: string; path: string }[] }>>().data;
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unknown-size', path: '$.allow.button.sizes[0]' }),
        expect.objectContaining({ code: 'unknown-component', path: '$.allow["no-such-thing"]' }),
        expect.objectContaining({
          code: 'unknown-component',
          path: '$.library[0].composes[0]',
        }),
      ])
    );
  });

  it('refuses to lock a design system without allow, until ds allow init adds one', async () => {
    ws = createWorkspace();
    addPrototype(ws, 'locked-app');
    ws.write('prototypes/locked-app/src/prototype.ts', PROTOTYPE);
    ws.write('prototypes/locked-app/package.json', {
      name: 'locked-app',
      private: true,
      devDependencies: { '@protoyard/runtime': 'workspace:*' },
    });
    expect((await run('new', 'harbor', '--brand', '#0f766e', '--allow', 'none')).code).toBe(0);
    // Approving a design system without allow is refused too.
    const approve = await run('approve', 'harbor', '--by', 'Ada Example');
    expect(approve.code).not.toBe(0);
    expect(approve.stdout).toContain('no allow section');

    const lock = await run('use', 'locked-app', 'harbor', '--lock');
    expect(lock.code).not.toBe(0);
    expect(lock.stdout).toContain('has no allow section');
    expect(lock.stdout).toContain('protoyard ds allow init harbor');

    const dry = await run('allow', 'init', 'harbor', '--preset', 'minimal', '--dry-run');
    expect(dry.code, dry.stdout).toBe(0);
    expect(read('design-systems/harbor/document.json').allow).toBeUndefined();
    const init = await run('allow', 'init', 'harbor', '--preset', 'minimal');
    expect(init.code, init.stdout).toBe(0);
    expect(read('design-systems/harbor/document.json').approval).toMatchObject({ status: 'draft' });
    expect((await run('allow', 'init', 'harbor')).code).not.toBe(0);
    expect((await run('allow', 'init', 'harbor', '--force')).code).toBe(0);

    expect((await run('approve', 'harbor', '--by', 'Ada Example')).code).toBe(0);
    const locked = await run('use', 'locked-app', 'harbor', '--lock');
    expect(locked.code, locked.stdout).toBe(0);
  });
});
