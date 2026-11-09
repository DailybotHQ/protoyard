// @vitest-environment node
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { sha256File } from '../src/lib/design-systems.ts';
import { scanDesignSystemSource } from '../src/lib/ds-check/index.ts';
import { componentSource } from '../src/lib/ds-components.ts';
import type { SpecFacts } from '../src/lib/inspect.ts';
import { renderRegion, skeleton } from '../src/lib/spec-render.ts';
import { cliArgs, createMcpToolHandler, MCP_TOOLS, runCliEnvelope } from '../src/mcp/tools.ts';
import { addPrototype, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

type Envelope<T = Record<string, unknown>> = {
  ok: boolean;
  data: T;
  error?: { code: string; message: string; hint?: string };
};

// Each case runs the CLI in process several times (design-system compiles): a loaded
// machine can take more than the default 5 s.
const PURPOSE = 'Shows a ticket status with its label';
const WHY = 'Badge alone has no label layout';

describe('ds component request, approve-request and new (PLAN_013 T-component)', {
  timeout: 60_000,
}, () => {
  let ws: TempWorkspace | undefined;
  afterEach(() => {
    ws?.cleanup();
    ws = undefined;
  });
  const root = () => (ws as TempWorkspace).root;
  const run = (...args: string[]) => cli(['--root', root(), '--json', 'ds', ...args]);
  const component = (...args: string[]) => run('component', ...args);
  const json = (path: string) =>
    JSON.parse(readFileSync(join(root(), path), 'utf8')) as Record<string, unknown>;
  const error = async (promise: ReturnType<typeof run>) => {
    const result = await promise;
    expect(result.code, result.stdout).not.toBe(0);
    return result.json<Envelope>().error as NonNullable<Envelope['error']>;
  };

  async function designSystem(id = 'harbor') {
    ws ??= createWorkspace();
    const created = await run('new', id, '--brand', '#0f766e');
    expect(created.code, created.stdout).toBe(0);
  }

  const request = (name = 'StatusPill', ...extra: string[]) =>
    component('request', 'harbor', name, '--purpose', PURPOSE, '--why', WHY, ...extra);

  it('records a request with no code, then a human approval, then scaffolds the component', async () => {
    await designSystem();
    const requested = await request('StatusPill', '--by', 'Ada Example');
    expect(requested.code, requested.stdout).toBe(0);
    const file = 'design-systems/harbor/requests/StatusPill.json';
    const recorded = json(file);
    expect(recorded).toMatchObject({
      format: 'protoyard/ds-component-request',
      version: 1,
      name: 'StatusPill',
      purpose: PURPOSE,
      why: WHY,
      requestedBy: 'Ada Example',
      status: 'open',
    });
    expect(Number.isNaN(Date.parse(recorded.requestedAt as string))).toBe(false);
    expect(existsSync(join(root(), 'design-systems/harbor/components/StatusPill.svelte'))).toBe(
      false
    );
    expect(json('design-systems/harbor/components.json').components).toEqual([]);

    const approved = await component('approve-request', 'harbor', 'StatusPill', '--by', 'Bo');
    expect(approved.code, approved.stdout).toBe(0);
    expect(json(file)).toMatchObject({ status: 'approved', approvedBy: 'Bo' });
    expect(typeof json(file).approvedAt).toBe('string');

    const created = await component('new', 'harbor', 'StatusPill');
    expect(created.code, created.stdout).toBe(0);
    const data = created.json<Envelope<{ files: string[]; import: string }>>().data;
    expect(data.files).toEqual([
      'design-systems/harbor/components/StatusPill.svelte',
      'design-systems/harbor/components.json',
      'design-systems/harbor/document.json',
      'design-systems/harbor/stories/StatusPill.json',
    ]);
    // The document's library carries the entry checkDesignSystemAllow reads.
    expect(json('design-systems/harbor/document.json').library).toEqual([
      {
        id: 'status-pill',
        name: 'StatusPill',
        purpose: PURPOSE,
        version: '0.1.0',
        status: 'draft',
        composes: ['badge', 'card'],
      },
    ]);
    expect(data.import).toBe("import StatusPill from '@ds/harbor/StatusPill';");

    const svelte = join(root(), 'design-systems/harbor/components/StatusPill.svelte');
    expect(json('design-systems/harbor/components.json').components).toEqual([
      {
        name: 'StatusPill',
        purpose: PURPOSE,
        version: '0.1.0',
        status: 'draft',
        file: 'components/StatusPill.svelte',
        sha256: sha256File(svelte),
      },
    ]);
    expect(json('design-systems/harbor/stories/StatusPill.json')).toEqual({
      format: 'protoyard/ds-story',
      version: 1,
      component: 'StatusPill',
      variants: [
        { name: 'Default', props: { label: 'StatusPill', status: 'Ready', variant: 'neutral' } },
      ],
    });

    // The scaffold passes every check ds rule and compiles as Svelte 5 runes.
    const source = readFileSync(svelte, 'utf8');
    expect(
      scanDesignSystemSource('components/StatusPill.svelte', source, { designSystemId: 'harbor' })
    ).toEqual([]);
    expect(source).not.toMatch(/<style|style=|style:/);
    expect(source).toContain('$props()');
    expect(source).toMatch(/from 'texuli\/badge'/);
    const { compile } = await import('svelte/compiler');
    expect(() => compile(source, { filename: 'StatusPill.svelte' })).not.toThrow();

    // ds validate stays green: no drift between components.json and the file.
    const validated = await run('validate', 'harbor');
    expect(validated.code, validated.stdout).toBe(0);
    expect(validated.json<Envelope<{ drift: unknown[] }>>().data.drift).toEqual([]);

    // A second component keeps the library sorted by name.
    expect((await request('ActivityRow')).code).toBe(0);
    expect((await component('approve-request', 'harbor', 'ActivityRow', '--by', 'Bo')).code).toBe(
      0
    );
    expect((await component('new', 'harbor', 'ActivityRow')).code).toBe(0);
    expect(
      (json('design-systems/harbor/components.json').components as { name: string }[]).map(
        (c) => c.name
      )
    ).toEqual(['ActivityRow', 'StatusPill']);
    expect(
      (json('design-systems/harbor/document.json').library as { id: string }[]).map((e) => e.id)
    ).toEqual(['activity-row', 'status-pill']);
    expect((await run('validate', 'harbor')).code).toBe(0);
  });

  it('request refuses bad names, unknown or flat design systems, unsafe or long text and duplicates', async () => {
    await designSystem();
    const flat = await run(
      'new',
      'flat-ds',
      '--brand',
      '#334155',
      '--out',
      'design-systems/flat-ds.json'
    );
    expect(flat.code, flat.stdout).toBe(0);

    expect((await error(request('statusPill'))).code).toBe('usage');
    expect((await error(request('Status-Pill'))).code).toBe('usage');
    expect(
      (
        await error(
          component('request', 'nowhere', 'StatusPill', '--purpose', PURPOSE, '--why', WHY)
        )
      ).code
    ).toBe('not_found');
    const flatError = await error(
      component('request', 'flat-ds', 'StatusPill', '--purpose', PURPOSE, '--why', WHY)
    );
    expect(flatError.code).toBe('validation');
    expect(flatError.hint).toContain('ds migrate');

    const line = await error(
      component('request', 'harbor', 'StatusPill', '--purpose', 'two\nlines', '--why', WHY)
    );
    expect(line).toMatchObject({ code: 'validation' });
    expect(line.message).toContain('--purpose');
    expect(
      (
        await error(
          component('request', 'harbor', 'StatusPill', '--purpose', PURPOSE, '--why', 'a\u0007b')
        )
      ).code
    ).toBe('validation');
    expect(
      (
        await error(
          component('request', 'harbor', 'StatusPill', '--purpose', 'x'.repeat(281), '--why', WHY)
        )
      ).message
    ).toContain('280');
    expect(
      (
        await error(
          component(
            'request',
            'harbor',
            'StatusPill',
            '--purpose',
            PURPOSE,
            '--why',
            'y'.repeat(1001)
          )
        )
      ).message
    ).toContain('1000');
    expect((await error(component('request', 'harbor', 'StatusPill', '--why', WHY))).code).toBe(
      'usage'
    );
    expect((await error(request('StatusPill', '--by', 'Ada Example'))).code).toBe('validation');
    // A length that fits exactly is accepted.
    expect(
      (
        await component(
          'request',
          'harbor',
          'Edge',
          '--purpose',
          'x'.repeat(280),
          '--why',
          'y'.repeat(1000)
        )
      ).code
    ).toBe(0);

    expect((await request()).code).toBe(0);
    const open = await error(request());
    expect(open.code).toBe('conflict');
    expect(open.message).toContain('open request');
    expect((await component('approve-request', 'harbor', 'StatusPill', '--by', 'Bo')).code).toBe(0);
    expect((await error(request())).code).toBe('conflict');
    expect((await component('new', 'harbor', 'StatusPill')).code).toBe(0);
    const existing = await error(request());
    expect(existing.code).toBe('conflict');
    expect(existing.message).toContain('already has a component');
  });

  it('approve-request needs a request, a name and a single approval', async () => {
    await designSystem();
    const missing = await error(component('approve-request', 'harbor', 'StatusPill', '--by', 'Bo'));
    expect(missing.code).toBe('not_found');
    expect(missing.hint).toContain('ds component request');
    expect((await request()).code).toBe(0);
    expect((await error(component('approve-request', 'harbor', 'StatusPill'))).code).toBe('usage');
    expect(json('design-systems/harbor/requests/StatusPill.json').status).toBe('open');
    expect((await component('approve-request', 'harbor', 'StatusPill', '--by', 'Bo')).code).toBe(0);
    expect(
      (await error(component('approve-request', 'harbor', 'StatusPill', '--by', 'Bo'))).code
    ).toBe('conflict');
  });

  it('new refuses without an approved request, inside a prototype, for a locked target and for an existing component', async () => {
    await designSystem();
    const none = await error(component('new', 'harbor', 'StatusPill'));
    expect(none.code).toBe('validation');
    expect(none.hint).toMatch(/ds component request harbor StatusPill.*approve-request/);

    expect((await request()).code).toBe(0);
    const open = await error(component('new', 'harbor', 'StatusPill'));
    expect(open.message).toContain('not approved yet');
    expect((await component('approve-request', 'harbor', 'StatusPill', '--by', 'Bo')).code).toBe(0);

    // From inside a prototype folder (any depth).
    addPrototype(ws as TempWorkspace, 'open-app');
    mkdirSync(join(root(), 'prototypes/open-app/src/screens'), { recursive: true });
    for (const cwd of ['prototypes/open-app', 'prototypes/open-app/src/screens']) {
      const inside = await error(
        cli([
          '--root',
          root(),
          '--cwd',
          join(root(), cwd),
          '--json',
          'ds',
          'component',
          'new',
          'harbor',
          'StatusPill',
        ])
      );
      expect(inside.code).toBe('usage');
      expect(inside.message).toContain('inside a prototype folder');
    }

    // A locked --prototype target.
    addPrototype(ws as TempWorkspace, 'locked-app', {
      designSystem: { id: 'harbor', version: '1.0.0', locked: true },
    });
    const locked = await error(
      component('new', 'harbor', 'StatusPill', '--prototype', 'open-app', 'locked-app')
    );
    expect(locked.code).toBe('usage');
    expect(locked.message).toContain('locked-app is locked');
    expect(locked.hint).toContain('Stop and ask the human');
    expect(existsSync(join(root(), 'design-systems/harbor/components/StatusPill.svelte'))).toBe(
      false
    );

    // An unlocked target is fine; then the component exists.
    const created = await component('new', 'harbor', 'StatusPill', '--prototype', 'open-app');
    expect(created.code, created.stdout).toBe(0);
    expect((await error(component('new', 'harbor', 'StatusPill'))).code).toBe('conflict');

    // A component file nobody listed also blocks the scaffold.
    expect(
      (await component('request', 'harbor', 'Orphan', '--purpose', PURPOSE, '--why', WHY)).code
    ).toBe(0);
    expect((await component('approve-request', 'harbor', 'Orphan', '--by', 'Bo')).code).toBe(0);
    (ws as TempWorkspace).write(
      'design-systems/harbor/components/Orphan.svelte',
      '<span>x</span>\n'
    );
    expect((await error(component('new', 'harbor', 'Orphan'))).code).toBe('conflict');
  });

  it('new refuses a flat or unknown design system', async () => {
    await designSystem();
    expect(
      (await run('new', 'flat-ds', '--brand', '#334155', '--out', 'design-systems/flat-ds.json'))
        .code
    ).toBe(0);
    expect((await error(component('new', 'flat-ds', 'StatusPill'))).hint).toContain('ds migrate');
    expect((await error(component('new', 'nowhere', 'StatusPill'))).code).toBe('not_found');
    expect((await error(component('new', 'Not_An_Id', 'StatusPill'))).code).toBe('usage');
  });
});

describe('MCP ds_component_request and ds_component_new', { timeout: 60_000 }, () => {
  let ws: TempWorkspace | undefined;
  afterEach(() => {
    ws?.cleanup();
    ws = undefined;
  });

  it('has no approve-request tool, and builds argv with options before a single --', () => {
    const names = MCP_TOOLS.map((tool) => tool.name);
    expect(names).toContain('ds_component_request');
    expect(names).toContain('ds_component_new');
    expect(names.some((name) => name.includes('approve'))).toBe(false);
    for (const tool of MCP_TOOLS.filter((t) => t.name.startsWith('ds_component'))) {
      expect(tool.description).toContain('stop and ask the human');
      expect(tool.inputSchema).toMatchObject({ additionalProperties: false });
    }
    expect(
      cliArgs('ds_component_request', {
        id: 'harbor',
        name: 'StatusPill',
        purpose: '--version',
        why: WHY,
        by: 'Ada',
      })
    ).toEqual([
      'ds',
      'component',
      'request',
      '--purpose=--version',
      `--why=${WHY}`,
      '--by=Ada',
      '--',
      'harbor',
      'StatusPill',
    ]);
    expect(
      cliArgs('ds_component_new', { id: 'harbor', name: 'StatusPill', prototype: 'my-app' })
    ).toEqual(['ds', 'component', 'new', '--prototype=my-app', '--', 'harbor', 'StatusPill']);
  });

  it('refuses invalid arguments before the CLI runs', async () => {
    const calls: string[][] = [];
    const handler = createMcpToolHandler({
      runCli: async (args) => {
        calls.push(args);
        return { ok: true, command: 'x', data: {} };
      },
    });
    for (const [tool, args] of [
      ['ds_component_request', { id: 'harbor', name: 'statusPill', purpose: 'p', why: 'w' }],
      ['ds_component_request', { id: 'harbor', name: 'StatusPill', purpose: 'a\nb', why: 'w' }],
      [
        'ds_component_request',
        { id: 'harbor', name: 'StatusPill', purpose: 'p', why: 'w'.repeat(1001) },
      ],
      [
        'ds_component_request',
        { id: 'harbor', name: 'StatusPill', purpose: 'x'.repeat(281), why: 'w' },
      ],
      ['ds_component_request', { id: 'harbor', name: 'StatusPill', purpose: 'p' }],
      [
        'ds_component_request',
        { id: 'harbor', name: 'StatusPill', purpose: 'p', why: 'w', status: 'approved' },
      ],
      ['ds_component_new', { id: '../x', name: 'StatusPill' }],
      ['ds_component_new', { id: 'harbor', name: 'StatusPill', prototype: '--help' }],
      ['ds_component_new', { id: 'harbor', name: 'StatusPill', approvedBy: 'me' }],
    ] as const) {
      expect(await handler(tool, args as Record<string, unknown>), tool).toMatchObject({
        ok: false,
        error: { code: 'validation' },
      });
    }
    expect(calls).toEqual([]);
  });

  it('records a request and scaffolds the approved component through the real CLI', async () => {
    ws = createWorkspace();
    const local = ws;
    const handler = createMcpToolHandler({
      workspaceRoot: local.root,
      runCli: (args) => runCliEnvelope(['--root', local.root, ...args]),
    });
    expect(
      (await cli(['--root', local.root, 'ds', 'new', 'harbor', '--brand', '#0f766e'])).code
    ).toBe(0);
    expect(
      await handler('ds_component_request', {
        id: 'harbor',
        name: 'StatusPill',
        purpose: PURPOSE,
        why: WHY,
      })
    ).toMatchObject({ ok: true, command: 'ds component request', data: { name: 'StatusPill' } });
    // Not approved yet: the tool cannot scaffold it.
    expect(await handler('ds_component_new', { id: 'harbor', name: 'StatusPill' })).toMatchObject({
      ok: false,
      error: { code: 'validation' },
    });
    // A human approves it on the command line.
    expect(
      (
        await cli([
          '--root',
          local.root,
          'ds',
          'component',
          'approve-request',
          'harbor',
          'StatusPill',
          '--by',
          'Bo',
        ])
      ).code
    ).toBe(0);
    expect(await handler('ds_component_new', { id: 'harbor', name: 'StatusPill' })).toMatchObject({
      ok: true,
      command: 'ds component new',
      data: { entry: { name: 'StatusPill', status: 'draft' } },
    });
    expect(existsSync(join(local.root, 'design-systems/harbor/components/StatusPill.svelte'))).toBe(
      true
    );
  });
});

describe('the scaffold source', () => {
  it('passes the check ds rules for any valid name and id', () => {
    for (const [name, id] of [
      ['A', 'x'],
      ['StatusPill', 'harbor'],
      ['Row2', 'acme-brand'],
    ] as const) {
      expect(scanDesignSystemSource(`${name}.svelte`, componentSource(name, id))).toEqual([]);
    }
  });
});

describe('generated AGENTS.md wording for locked prototypes', () => {
  const facts = {
    manifest: {
      id: 'example.tasks',
      slug: 'tasks-app',
      name: 'Tasks',
      version: '0.1.0',
      platform: 'responsive',
      category: 'ops',
      defaultTheme: 'harbor',
      namespace: 'tasks-app',
    },
    generatorVersion: 1,
    schemaVersion: 1,
    versions: [],
    tables: [],
    policy: null,
    personasScenario: null,
    personas: [],
    scenarios: [],
    themes: [],
    timeline: false,
    routes: null,
    warnings: [],
  } as unknown as SpecFacts;
  const locked = {
    ...facts,
    manifest: { ...facts.manifest, designSystem: { id: 'harbor', version: '1.2.0', locked: true } },
  } as SpecFacts;

  it('leaves an unlocked prototype byte-identical', () => {
    // The commands region as it was before locked design systems.
    const before = [
      '```bash',
      'pnpm protoyard dev tasks-app                  # run it (DevTools included)',
      'pnpm vitest run prototypes/tasks-app          # unit + integration tests',
      'pnpm protoyard validate tasks-app --build     # contract, schema, build',
      'pnpm protoyard spec tasks-app --check         # generated spec regions are current',
      'pnpm protoyard export tasks-app               # relocatable ZIP',
      '```',
    ].join('\n');
    expect(renderRegion('commands', facts)).toBe(before);
    expect(skeleton('AGENTS.md', facts)).not.toContain('design system');
    expect(skeleton('AGENTS.md', facts)).not.toContain('check ds');
  });

  it('tells an agent in a locked prototype to stop and ask', () => {
    const text = renderRegion('commands', locked);
    expect(text).toContain('pnpm protoyard check ds tasks-app');
    expect(text).toContain('This prototype is locked to design system `harbor@1.2.0`.');
    expect(text).toContain(
      'Build UI only from its allowed Texuli components and its own components (`@ds/harbor/<Name>`).'
    );
    expect(text).toContain(
      'If nothing fits, stop and ask the human: name, purpose, and why the existing components do not fit.'
    );
    expect(text).toContain('`protoyard ds component request harbor <Name>');
    expect(text).toContain('have it approved, then `protoyard ds component new harbor <Name>`.');
    expect(text).toContain('Never style controls locally; `protoyard check ds` fails the build.');
    expect(skeleton('AGENTS.md', locked)).toContain(text);
  });
});
