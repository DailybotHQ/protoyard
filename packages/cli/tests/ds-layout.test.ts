// @vitest-environment node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { designSystemAlias } from '@protoyard/renderer-svelte/vite';
import { designSystemContentHash } from '@texuli/spec/design-system';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalJson, contentHash, sha256File } from '../src/lib/design-systems.ts';
import { cli, createWorkspace, type TempWorkspace } from './helpers.ts';

type Envelope<T> = { ok: boolean; data: T; error?: { code: string; message: string } };

describe('design-system folders (PLAN_013 T-layout)', () => {
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

  it('writes a folder by default: document with a draft approval inside, empty component library', async () => {
    ws = createWorkspace();
    const created = await run('new', 'harbor', '--brand', '#0f766e');
    expect(created.code, created.stdout).toBe(0);
    const data = created.json<Envelope<{ file: string; layout: string; files: string[] }>>().data;
    expect(data.layout).toBe('folder');
    // The approval lives in the document now (spec 0.13.0): no approval.json.
    expect(data.files).toEqual([
      'design-systems/harbor/document.json',
      'design-systems/harbor/components.json',
    ]);
    expect(existsSync(join(ws.root, 'design-systems/harbor/approval.json'))).toBe(false);
    const document = read('design-systems/harbor/document.json') as { version: string };
    expect(read('design-systems/harbor/document.json').approval).toEqual({
      status: 'draft',
      version: document.version,
    });
    expect(read('design-systems/harbor/components.json')).toEqual({
      format: 'protoyard/ds-components',
      version: 1,
      components: [],
    });
    // --out keeps the flat document.
    const flat = await run(
      'new',
      'flat-one',
      '--brand',
      '#334155',
      '--out',
      'design-systems/flat-one.json'
    );
    expect(flat.code, flat.stdout).toBe(0);
    expect(existsSync(join(ws.root, 'design-systems/flat-one.json'))).toBe(true);
    expect(existsSync(join(ws.root, 'design-systems/flat-one'))).toBe(false);
  });

  it('validates by id, reports draft status and refuses component drift', async () => {
    ws = createWorkspace();
    expect((await run('new', 'harbor', '--brand', '#0f766e')).code).toBe(0);
    const ok = await run('validate', 'harbor');
    expect(ok.code, ok.stdout).toBe(0);
    const data =
      ok.json<Envelope<{ status: string; lockable: boolean; contentHash: string }>>().data;
    expect(data.status).toBe('draft');
    expect(data.lockable).toBe(false);
    expect(data.contentHash).toBe(contentHash(read('design-systems/harbor/document.json')));

    // A component file nobody listed, then a listed one whose source changed.
    ws.write('design-systems/harbor/components/StatusPill.svelte', '<span>pill</span>\n');
    const unlisted = await run('validate', 'harbor');
    expect(unlisted.code).not.toBe(0);
    expect(unlisted.stdout).toContain('components/StatusPill.svelte: unlisted');
    const file = join(ws.root, 'design-systems/harbor/components/StatusPill.svelte');
    ws.write('design-systems/harbor/components.json', {
      format: 'protoyard/ds-components',
      version: 1,
      components: [
        {
          name: 'StatusPill',
          purpose: 'Shows a status.',
          version: '1.0.0',
          status: 'draft',
          file: 'components/StatusPill.svelte',
          sha256: sha256File(file),
        },
      ],
    });
    expect((await run('validate', 'harbor')).code).toBe(0);
    writeFileSync(file, '<span>changed</span>\n');
    const changed = await run('validate', 'harbor');
    expect(changed.code).not.toBe(0);
    expect(changed.stdout).toContain('components/StatusPill.svelte: changed');
  });

  it('refuses a folder whose document id does not match, and an invalid components.json', async () => {
    ws = createWorkspace();
    expect((await run('new', 'harbor', '--brand', '#0f766e')).code).toBe(0);
    const doc = read('design-systems/harbor/document.json');
    ws.write('design-systems/other/document.json', doc);
    const mismatch = await run('validate', 'other');
    expect(mismatch.code).not.toBe(0);
    expect(mismatch.stdout).toContain('its folder is design-systems/other/');
    ws.write('design-systems/harbor/components.json', { format: 'nope' });
    expect((await run('validate', 'harbor')).code).not.toBe(0);
  });

  it('migrates a flat document into a draft folder, and never over an existing folder', {
    timeout: 60_000,
  }, async () => {
    ws = createWorkspace();
    expect(
      (await run('new', 'dusk', '--brand', '#7c3aed', '--out', 'design-systems/dusk.json')).code
    ).toBe(0);
    const before = readFileSync(join(ws.root, 'design-systems/dusk.json'), 'utf8');
    const dry = await run('migrate', 'dusk', '--dry-run');
    expect(dry.code, dry.stdout).toBe(0);
    expect(existsSync(join(ws.root, 'design-systems/dusk.json'))).toBe(true);
    const migrated = await run('migrate', 'dusk');
    expect(migrated.code, migrated.stdout).toBe(0);
    expect(existsSync(join(ws.root, 'design-systems/dusk.json'))).toBe(false);
    expect(readFileSync(join(ws.root, 'design-systems/dusk/document.json'), 'utf8')).toBe(before);
    expect(existsSync(join(ws.root, 'design-systems/dusk/approval.json'))).toBe(false);
    const validated = await run('validate', 'dusk');
    expect(validated.code).toBe(0);
    expect(validated.json<Envelope<{ status: string }>>().data.status).toBe('draft');
    // A second run finds the folder up to date; a flat file next to a folder is refused.
    const again = await run('migrate', 'dusk');
    expect(again.code, again.stdout).toBe(0);
    expect(again.json<Envelope<{ changes: string[] }>>().data.changes).toEqual([]);
    ws.write('design-systems/dusk.json', JSON.parse(before) as object);
    expect((await run('migrate', 'dusk')).code).not.toBe(0);
    expect((await run('migrate', '../escape')).code).not.toBe(0);
  });

  it("hashes canonical JSON without the approval section (Texuli's one implementation)", () => {
    expect(canonicalJson({ b: 1, a: [2, { d: null, c: 'x' }] })).toBe(
      '{"a":[2,{"c":"x","d":null}],"b":1}'
    );
    const document = { id: 'x', version: '1.0.0', tokens: { a: 1 } };
    expect(contentHash(document)).toBe(designSystemContentHash(document));
    // Texuli spec 0.13.0 excludes the whole approval section…
    expect(contentHash({ ...document, approval: { status: 'approved', approvedBy: 'Ada' } })).toBe(
      contentHash(document)
    );
    // …and each library entry's own approval, but not the entry itself.
    const entry = {
      id: 'pill',
      name: 'Pill',
      purpose: 'p',
      version: '0.1.0',
      status: 'draft',
      composes: ['badge'],
    };
    const withLibrary = { ...document, library: [entry] };
    expect(
      contentHash({
        ...document,
        library: [{ ...entry, approval: { status: 'approved', version: '0.1.0' } }],
      })
    ).toBe(contentHash(withLibrary));
    expect(contentHash(withLibrary)).not.toBe(contentHash(document));
    expect(contentHash({ ...document, version: '1.0.1' })).not.toBe(contentHash(document));
  });

  it('resolves @ds/<id>/<Component> inside design-systems/ only', () => {
    ws = createWorkspace();
    const alias = designSystemAlias(join(ws.root, 'prototypes', 'any'));
    const resolve = (spec: string) =>
      alias.find.test(spec) ? spec.replace(alias.find, alias.replacement) : null;
    expect(resolve('@ds/acme/StatusPill')).toMatch(
      /design-systems\/acme\/components\/StatusPill\.svelte$/
    );
    for (const bad of [
      '@ds/../x/Y',
      '@ds/acme/../Y',
      '@ds/Acme/Y',
      '@ds/acme/statusPill',
      '@ds/acme/A/B',
    ]) {
      expect(resolve(bad)).toBeNull();
    }
  });
});
