// @vitest-environment node
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addCrudTemplate,
  cli,
  createWorkspace,
  helpdeskBlueprint,
  type TempWorkspace,
} from './helpers.ts';

let ws: TempWorkspace;
beforeEach(() => {
  ws = createWorkspace();
  addCrudTemplate(ws);
});
afterEach(() => ws.cleanup());

const path = (rel: string) => join(ws.root, rel);
const read = (rel: string) => readFileSync(path(rel), 'utf8');

function writeBlueprint(input: unknown, name = 'helpdesk.json') {
  ws.write(name, input as string | object);
  return path(name);
}

type Check = { id: string; status: string; details: string[] };

describe('protoyard blueprint validate <file>', () => {
  it('accepts a valid blueprint and summarizes it', async () => {
    const run = await cli(['--json', 'blueprint', 'validate', writeBlueprint(helpdeskBlueprint())]);
    expect(run.code).toBe(0);
    expect(run.json<{ data: unknown }>().data).toMatchObject({
      valid: true,
      entities: [
        { name: 'customer', fields: 2 },
        { name: 'support-ticket', fields: 3 },
      ],
      roles: ['owner', 'admin', 'member', 'viewer'],
      schemaVersion: 1,
      issues: [],
    });
  });

  it('reports every issue with its path and exits 4', async () => {
    const bad = helpdeskBlueprint();
    (bad.entities[1] as Record<string, unknown>).titleField = 'headline';
    (bad.roles[2] as { permissions: Record<string, string[]> }).permissions.invoice = ['read'];
    const run = await cli(['--json', 'blueprint', 'validate', writeBlueprint(bad)]);
    expect(run.code).toBe(4);
    const { error, data } = run.json<{
      error: { message: string };
      data: { valid: boolean; issues: { path: string; message: string }[] };
    }>();
    expect(data.valid).toBe(false);
    expect(data.issues).toEqual([
      {
        path: 'entities.1.titleField',
        message: 'titleField "headline" is not a field of "support-ticket"',
      },
      { path: 'roles.2.permissions.invoice', message: 'unknown entity "invoice"' },
    ]);
    expect(error.message).toContain('Invalid blueprint (2 issues)');
  });

  it('exits 4 for invalid JSON or a history that does not rebuild, 3 for a missing file', async () => {
    expect(
      (await cli(['--json', 'blueprint', 'validate', writeBlueprint('{ nope', 'x.json')])).code
    ).toBe(4);
    const dropped = helpdeskBlueprint({
      entities: [helpdeskBlueprint().entities[0]],
      history: [{ schemaVersion: 1, blueprint: helpdeskBlueprint() }],
    });
    const history = await cli([
      '--json',
      'blueprint',
      'validate',
      writeBlueprint(dropped, 'h.json'),
    ]);
    expect(history.code).toBe(4);
    expect(history.json<{ error: { message: string } }>().error.message).toContain(
      'history does not rebuild'
    );
    expect((await cli(['--json', 'blueprint', 'validate', path('missing.json')])).code).toBe(3);
  });
});

describe('protoyard validate — blueprint drift check', () => {
  async function generated() {
    const run = await cli([
      '--root',
      ws.root,
      '--json',
      'generate',
      'help-desk',
      '--blueprint',
      writeBlueprint(helpdeskBlueprint()),
      '--no-install',
    ]);
    expect(run.code).toBe(0);
  }
  async function blueprintCheck(): Promise<Check | undefined> {
    const run = await cli([
      '--root',
      ws.root,
      '--json',
      'validate',
      'help-desk',
      '--skip-typecheck',
    ]);
    return run.json<{ data: { checks: Check[] } }>().data.checks.find((c) => c.id === 'blueprint');
  }

  it('passes for a freshly generated prototype', async () => {
    await generated();
    const check = await blueprintCheck();
    expect(check?.status).toBe('pass');
    expect(check?.details[0]).toMatch(/^2 entities, schema v1, \d+ generated files fresh$/);
  });

  it('fails when blueprint.json was edited without regenerating', async () => {
    await generated();
    const edited = helpdeskBlueprint({ name: 'Edited desk' });
    writeFileSync(
      path('prototypes/help-desk/blueprint.json'),
      `${JSON.stringify(edited, null, 2)}\n`
    );
    const check = await blueprintCheck();
    expect(check?.status).toBe('fail');
    expect(
      check?.details.some((d) => d.startsWith('blueprint.json changed since the last generation'))
    ).toBe(true);
  });

  it('fails for a hand-edited, missing or orphaned generated file', async () => {
    await generated();
    const policy = path('prototypes/help-desk/src/generated/policy.ts');
    writeFileSync(policy, `${read('prototypes/help-desk/src/generated/policy.ts')}// edited\n`);
    rmSync(path('prototypes/help-desk/src/generated/screens/CustomerPage.svelte'));
    ws.write('prototypes/help-desk/src/generated/screens/GhostPage.svelte', '<p>ghost</p>\n');
    const check = await blueprintCheck();
    expect(check?.status).toBe('fail');
    expect(check?.details).toEqual(
      expect.arrayContaining([
        'src/generated/policy.ts was edited by hand (hash mismatch)',
        'missing src/generated/screens/CustomerPage.svelte',
        'src/generated/screens/GhostPage.svelte was edited by hand (hash mismatch)',
      ])
    );
  });

  it('fails when protoyard.json disagrees with the versions the history rebuilds', async () => {
    await generated();
    const manifestPath = path('prototypes/help-desk/protoyard.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.storage.schemaVersion = 3;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const check = await blueprintCheck();
    expect(check?.status).toBe('fail');
    expect(check?.details).toContain(
      'history rebuilds schema v1, but protoyard.json storage.schemaVersion is v3'
    );
  });

  it('skips templates and hand-wired blueprints (no generation snapshot)', async () => {
    const run = await cli([
      '--root',
      ws.root,
      '--json',
      'validate',
      'crud-app',
      '--skip-typecheck',
    ]);
    const check = run
      .json<{ data: { checks: Check[] } }>()
      .data.checks.find((c) => c.id === 'blueprint');
    expect(check).toMatchObject({ status: 'skip' });
  });
});
