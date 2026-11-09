// @vitest-environment node
import { chmodSync, mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { contentHash } from '../src/lib/design-systems.ts';
import type { RegistryDesignSystem } from '../src/lib/ds-registry.ts';
import { workspacePaths } from '../src/lib/paths.ts';
import { buildIndex, readRegistry } from '../src/lib/registry.ts';
import { createMcpToolHandler, MCP_TOOLS, runCliEnvelope } from '../src/mcp/tools.ts';
import { addPrototype, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

/**
 * PLAN_013 T-registry: the index lists design systems in the registry's own
 * `designSystems` array with the prototypes bound to each; `ds list` and the
 * MCP tool `ds_list` return them; two design systems never mix.
 */

const AT = '2026-11-09T12:00:00.000Z';
const HASH = 'b'.repeat(64);

function documentFor(id: string, name: string, version = '1.0.0') {
  return {
    format: 'texuli/design-system',
    formatVersion: 1,
    id,
    version,
    name,
    color: { brand: { seed: '#0f766e' } },
    // Lockability needs an allow section (Texuli spec 0.13.0).
    allow: { button: {}, card: {} },
  };
}

/** The approval is the legacy approval.json sidecar here: the registry still reads it. */
function folder(
  ws: TempWorkspace,
  id: string,
  name: string,
  options: { approved?: boolean; components?: number } = {}
) {
  const document = documentFor(id, name);
  ws.write(`design-systems/${id}/document.json`, document);
  ws.write(
    `design-systems/${id}/approval.json`,
    options.approved
      ? {
          status: 'approved',
          version: document.version,
          approvedBy: 'Ada Example',
          approvedAt: AT,
          contentHash: contentHash(document),
        }
      : { status: 'draft', version: document.version }
  );
  const names = ['StatusPill', 'MetricTile', 'OrderRow'].slice(0, options.components ?? 0);
  ws.write(`design-systems/${id}/components.json`, {
    format: 'protoyard/ds-components',
    version: 1,
    components: names.map((component) => ({
      name: component,
      purpose: `The ${component} component`,
      version: '0.1.0',
      status: 'draft',
      file: `components/${component}.svelte`,
      sha256: HASH,
    })),
  });
  return document;
}

/** Two design systems, a flat one and prototypes bound to each (one locked, one not). */
function twoSystems(ws: TempWorkspace) {
  folder(ws, 'harbor', 'Harbor', { approved: true, components: 2 });
  folder(ws, 'atlas', 'Atlas', { components: 1 });
  ws.write('design-systems/legacy.json', documentFor('legacy', 'Legacy', '0.3.0'));
  addPrototype(ws, 'harbor-orders', {
    name: 'Harbor Orders',
    designSystem: { id: 'harbor', version: '1.0.0', locked: true },
  });
  addPrototype(ws, 'harbor-sketch', {
    name: 'Harbor Sketch',
    designSystem: { id: 'harbor', version: '1.0.0', locked: false },
  });
  addPrototype(ws, 'atlas-board', {
    name: 'Atlas Board',
    designSystem: { id: 'atlas', version: '1.0.0', locked: false },
  });
  addPrototype(ws, 'plain-app', { name: 'Plain App' });
}

const byId = (list: RegistryDesignSystem[], id: string) =>
  list.find((ds) => ds.id === id) as RegistryDesignSystem;

describe('design systems in the registry (PLAN_013 T-registry)', { timeout: 60_000 }, () => {
  let ws: TempWorkspace | undefined;
  afterEach(() => {
    if (ws) {
      // Restore permissions a test removed, so cleanup can delete the files.
      try {
        chmodSync(join(ws.root, 'design-systems/atlas/document.json'), 0o644);
      } catch {
        // not changed
      }
    }
    ws?.cleanup();
    ws = undefined;
  });

  it('indexes folders and flat documents with approval, components and bound prototypes', async () => {
    ws = createWorkspace();
    twoSystems(ws);
    const { registry } = await buildIndex(workspacePaths(ws.root));

    expect(registry.designSystems.map((ds) => ds.id)).toEqual(['atlas', 'harbor', 'legacy']);
    expect(registry.stats.designSystems).toBe(3);
    expect(registry.designSystemIssues).toEqual([]);

    const harbor = byId(registry.designSystems, 'harbor');
    expect(harbor).toEqual({
      id: 'harbor',
      name: 'Harbor',
      version: '1.0.0',
      status: 'approved',
      approvedBy: 'Ada Example',
      approvedAt: AT,
      approvedVersion: '1.0.0',
      contentHash: contentHash(documentFor('harbor', 'Harbor')),
      lockable: true,
      layout: 'folder',
      path: 'design-systems/harbor',
      componentCount: 2,
      boundPrototypes: [
        { slug: 'harbor-orders', name: 'Harbor Orders', version: '1.0.0', locked: true },
        { slug: 'harbor-sketch', name: 'Harbor Sketch', version: '1.0.0', locked: false },
      ],
    });

    const atlas = byId(registry.designSystems, 'atlas');
    expect(atlas).toMatchObject({
      status: 'draft',
      approvedBy: null,
      approvedAt: null,
      lockable: false,
      layout: 'folder',
      componentCount: 1,
      boundPrototypes: [
        { slug: 'atlas-board', name: 'Atlas Board', version: '1.0.0', locked: false },
      ],
    });

    expect(byId(registry.designSystems, 'legacy')).toMatchObject({
      version: '0.3.0',
      status: 'draft',
      layout: 'flat',
      path: 'design-systems/legacy.json',
      componentCount: 0,
      lockable: false,
      boundPrototypes: [],
    });

    // Each prototype entry carries its own binding; the plain one has none.
    const binding = (slug: string) => registry.entries.find((e) => e.slug === slug)?.designSystem;
    expect(binding('harbor-orders')).toEqual({ id: 'harbor', version: '1.0.0', locked: true });
    expect(binding('atlas-board')).toEqual({ id: 'atlas', version: '1.0.0', locked: false });
    expect(binding('plain-app')).toBeNull();

    // The file on disk has the same top-level array, and entries keep their kinds.
    const onDisk = await readRegistry(workspacePaths(ws.root));
    expect(onDisk?.designSystems).toEqual(registry.designSystems);
    expect(new Set(onDisk?.entries.map((e) => e.kind))).toEqual(new Set(['prototype']));
  });

  it('reports an approval that no longer matches the document as not lockable', async () => {
    ws = createWorkspace();
    folder(ws, 'harbor', 'Harbor', { approved: true });
    ws.write('design-systems/harbor/document.json', {
      ...documentFor('harbor', 'Harbor'),
      color: { brand: { seed: '#1d4ed8' } },
    });
    const { registry } = await buildIndex(workspacePaths(ws.root));
    expect(byId(registry.designSystems, 'harbor')).toMatchObject({
      status: 'approved',
      approvedVersion: '1.0.0',
      lockable: false,
    });
  });

  it('turns broken design systems and unknown bindings into issues without failing the index', async () => {
    ws = createWorkspace();
    folder(ws, 'harbor', 'Harbor', { approved: true });
    ws.write('design-systems/broken/document.json', '{ not json');
    ws.write('design-systems/wrong-id/document.json', documentFor('other', 'Other'));
    ws.write('design-systems/bad-approval/document.json', documentFor('bad-approval', 'Bad'));
    ws.write('design-systems/bad-approval/approval.json', { status: 'approved' });
    ws.write('design-systems/no-document/README.md', 'nothing here');
    ws.write('design-systems/Bad_Name.json', documentFor('bad', 'Bad'));
    ws.write('design-systems/harbor.json', documentFor('harbor', 'Harbor flat'));
    ws.write('design-systems/notes.md', 'not a design system');
    mkdirSync(join(ws.root, 'outside'), { recursive: true });
    symlinkSync(join(ws.root, 'outside'), join(ws.root, 'design-systems/linked'));
    addPrototype(ws, 'orphan-app', { designSystem: { id: 'missing', version: '1.0.0' } });

    const { registry } = await buildIndex(workspacePaths(ws.root));
    expect(registry.designSystems.map((ds) => ds.id)).toEqual(['harbor']);
    const issues = Object.fromEntries(
      registry.designSystemIssues.map((issue) => [issue.path, issue.errors.join(' ')])
    );
    expect(Object.keys(issues).sort()).toEqual([
      'design-systems/Bad_Name.json',
      'design-systems/bad-approval',
      'design-systems/broken',
      'design-systems/harbor.json',
      'design-systems/linked',
      'design-systems/no-document',
      'design-systems/wrong-id',
      'prototypes/orphan-app',
    ]);
    expect(issues['design-systems/broken']).toMatch(/not valid JSON/);
    expect(issues['design-systems/wrong-id']).toMatch(/declares id "other"/);
    expect(issues['design-systems/bad-approval']).toMatch(/approval\.json is not valid/);
    expect(issues['design-systems/no-document']).toMatch(/Missing/);
    expect(issues['design-systems/harbor.json']).toMatch(/takes precedence/);
    expect(issues['design-systems/linked']).toMatch(/symlink/);
    expect(issues['prototypes/orphan-app']).toMatch(/"missing"/);
    // Prototype indexing is untouched: the orphan is still a valid entry.
    expect(registry.entries.map((e) => e.slug)).toEqual(['orphan-app']);
    expect(registry.invalid).toEqual([]);
  });

  it('`ds list` prints them, and --json returns the registry entries', async () => {
    ws = createWorkspace();
    twoSystems(ws);
    const json = await cli(['--root', ws.root, '--json', 'ds', 'list']);
    expect(json.code, json.stdout).toBe(0);
    const envelope = json.json<{
      ok: boolean;
      command: string;
      data: { count: number; designSystems: RegistryDesignSystem[]; issues: unknown[] };
    }>();
    expect(envelope).toMatchObject({ ok: true, command: 'ds list', data: { count: 3 } });
    const { registry } = await buildIndex(workspacePaths(ws.root));
    expect(envelope.data.designSystems).toEqual(registry.designSystems);
    expect(envelope.data.issues).toEqual([]);

    const text = await cli(['--root', ws.root, 'ds', 'list']);
    expect(text.code).toBe(0);
    expect(text.stdout).toMatch(/harbor\s+Harbor\s+1\.0\.0\s+approved\s+yes\s+folder\s+2/);
    expect(text.stdout).toContain('harbor-orders@1.0.0 (locked)');
    expect(text.stdout).toMatch(/legacy\s+Legacy\s+0\.3\.0\s+draft\s+no\s+flat/);

    const empty = createWorkspace();
    try {
      const none = await cli(['--root', empty.root, 'ds', 'list']);
      expect(none.code).toBe(0);
      expect(none.stdout).toContain('No design systems yet');
    } finally {
      empty.cleanup();
    }
  });

  it('MCP ds_list takes no arguments and returns the same envelope', async () => {
    ws = createWorkspace();
    twoSystems(ws);
    const local = ws;
    const tool = MCP_TOOLS.find((t) => t.name === 'ds_list');
    expect(tool?.inputSchema).toEqual({
      type: 'object',
      properties: {},
      additionalProperties: false,
    });
    const handler = createMcpToolHandler({
      workspaceRoot: local.root,
      runCli: (args) => runCliEnvelope(['--root', local.root, ...args]),
    });
    expect(await handler('ds_list', { id: 'harbor' })).toMatchObject({
      ok: false,
      error: { code: 'validation' },
    });
    const result = await handler('ds_list', {});
    expect(result).toMatchObject({ ok: true, command: 'ds list', data: { count: 3 } });
    const data = (result as { data: { designSystems: RegistryDesignSystem[] } }).data;
    expect(byId(data.designSystems, 'harbor').boundPrototypes.map((p) => p.slug)).toEqual([
      'harbor-orders',
      'harbor-sketch',
    ]);
  });
});

describe('no cross-talk between two design systems', { timeout: 60_000 }, () => {
  let ws: TempWorkspace | undefined;
  afterEach(() => {
    if (ws) {
      try {
        chmodSync(join(ws.root, 'design-systems/atlas/document.json'), 0o644);
      } catch {
        // not changed
      }
    }
    ws?.cleanup();
    ws = undefined;
  });

  it('attributes each prototype to its own design system, locked or not', async () => {
    ws = createWorkspace();
    twoSystems(ws);
    const { registry } = await buildIndex(workspacePaths(ws.root));
    const owners = new Map<string, string[]>();
    for (const ds of registry.designSystems) {
      for (const p of ds.boundPrototypes)
        owners.set(p.slug, [...(owners.get(p.slug) ?? []), ds.id]);
    }
    expect(Object.fromEntries(owners)).toEqual({
      'harbor-orders': ['harbor'],
      'harbor-sketch': ['harbor'],
      'atlas-board': ['atlas'],
    });
    expect(owners.has('plain-app')).toBe(false);
  });

  it("check ds on a harbor prototype passes while atlas's files are broken or unreadable", async () => {
    ws = createWorkspace();
    twoSystems(ws);
    ws.write(
      'prototypes/harbor-orders/src/App.svelte',
      '<script lang="ts">\nimport { Button } from \'texuli/button\';\n</script>\n\n<div class="flex gap-2"><Button>Save</Button></div>\n'
    );
    // atlas: a component with every kind of violation, a corrupt approval and
    // (when the OS honors it) an unreadable document.
    ws.write(
      'design-systems/atlas/components/Loud.svelte',
      '<button style="color: red" class="bg-red-500">x</button>\n<style>button { color: red; }</style>\n'
    );
    ws.write('design-systems/atlas/approval.json', '{ "status": ');
    const canRevoke = typeof process.getuid === 'function' && process.getuid() !== 0;
    if (canRevoke) chmodSync(join(ws.root, 'design-systems/atlas/document.json'), 0o000);

    const run = await cli(['--root', ws.root, '--json', 'check', 'ds', 'harbor-orders']);
    expect(run.code, run.stdout).toBe(0);
    const envelope = run.json<{
      ok: boolean;
      data: { ok: boolean; prototypes: { slug: string }[]; violations: unknown[] };
    }>();
    expect(envelope.data.ok).toBe(true);
    expect(envelope.data.prototypes.map((p) => p.slug)).toEqual(['harbor-orders']);
    expect(envelope.data.violations).toEqual([]);
    expect(run.stdout).not.toContain('atlas');

    // The index still lists harbor, and reports atlas on its own.
    const { registry } = await buildIndex(workspacePaths(ws.root));
    expect(registry.designSystems.map((ds) => ds.id)).toEqual(['harbor', 'legacy']);
    // A broken atlas is reported once, on its folder (its binding is not an "unknown id").
    expect(registry.designSystemIssues.map((issue) => issue.path)).toEqual([
      'design-systems/atlas',
    ]);
    expect(byId(registry.designSystems, 'harbor').boundPrototypes.map((p) => p.slug)).toEqual([
      'harbor-orders',
      'harbor-sketch',
    ]);

    // Without slugs, check ds checks the locked prototypes only: atlas-board is left alone.
    const all = await cli(['--root', ws.root, '--json', 'check', 'ds']);
    expect(all.code, all.stdout).toBe(0);
    expect(
      all.json<{ data: { prototypes: { slug: string }[] } }>().data.prototypes.map((p) => p.slug)
    ).toEqual(['harbor-orders']);
  });
});
