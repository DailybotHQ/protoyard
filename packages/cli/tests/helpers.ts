import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';
import { runCli } from '../src/program.ts';

export interface TempWorkspace {
  root: string;
  write(path: string, content: string | object): void;
  cleanup(): void;
}

/** A throwaway workspace with the layout the CLI expects. */
export function createWorkspace(): TempWorkspace {
  const root = mkdtempSync(join(tmpdir(), 'protoyard-cli-'));
  const write = (path: string, content: string | object) => {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(
      file,
      typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`
    );
  };
  write('pnpm-workspace.yaml', 'packages:\n  - prototypes/*\n  - templates/*\n');
  write('package.json', { name: 'fixture-workspace', private: true });
  mkdirSync(join(root, 'prototypes'), { recursive: true });
  mkdirSync(join(root, 'templates'), { recursive: true });
  return { root, write, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

export function manifest(overrides: Record<string, unknown> = {}) {
  const slug = (overrides.slug as string | undefined) ?? 'sample-app';
  return {
    id: `example.${slug}`,
    slug,
    kind: 'prototype',
    name: 'Sample App',
    description: 'A fixture prototype.',
    version: '0.1.0',
    category: 'general',
    tags: ['fixture'],
    storage: { namespace: slug, schemaVersion: 1 },
    scenarios: ['default'],
    defaultScenario: 'default',
    ...overrides,
  };
}

export function addPrototype(
  ws: TempWorkspace,
  slug: string,
  overrides: Record<string, unknown> = {}
) {
  ws.write(`prototypes/${slug}/protoyard.json`, manifest({ slug, ...overrides }));
}

/** A template with the folder contract plus junk that must never be copied. */
export function addTemplate(ws: TempWorkspace, name = 'blank') {
  const base = `templates/${name}`;
  ws.write(
    `${base}/protoyard.json`,
    manifest({ id: `template.${name}`, slug: name, kind: 'template', name: 'Blank' })
  );
  ws.write(`${base}/package.json`, {
    name: `@protoyard-template/${name}`,
    private: true,
    scripts: { dev: 'vite' },
  });
  ws.write(`${base}/README.md`, '# Blank template\n\nStart here.\n');
  ws.write(
    `${base}/index.html`,
    '<div id="app"></div><script type="module" src="/src/main.ts"></script>\n'
  );
  ws.write(`${base}/src/main.ts`, 'export {};\n');
  ws.write(`${base}/node_modules/junk/index.js`, 'junk');
  ws.write(`${base}/dist/index.html`, 'old build');
}

/**
 * A prototype Vite can build with no renderer: plain HTML + one module. It
 * proves the build/export pipeline (scoping, manifest, zip) end to end.
 */
export function addBuildablePrototype(ws: TempWorkspace, slug: string, body = 'hello') {
  addPrototype(ws, slug);
  const base = `prototypes/${slug}`;
  ws.write(`${base}/package.json`, { name: `@prototype/${slug}`, private: true });
  ws.write(`${base}/vite.config.ts`, 'export default { logLevel: "silent" };\n');
  ws.write(
    `${base}/index.html`,
    '<!doctype html><html><head><title>t</title></head><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>\n'
  );
  ws.write(
    `${base}/src/main.ts`,
    `document.getElementById('app')!.textContent = ${JSON.stringify(body)};\n`
  );
}

export interface CliRun {
  code: number;
  stdout: string;
  stderr: string;
  json<T = Record<string, unknown>>(): T;
}

/**
 * Runs the CLI in-process. CI is pinned off (CI=1 implies --yes, which
 * changes behavior) so results never depend on where the tests run; pass
 * `env` to opt into specific variables.
 */
export async function cli(args: string[], env: Record<string, string> = {}): Promise<CliRun> {
  vi.stubEnv('CI', '');
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  try {
    return await runInProcess(args);
  } finally {
    vi.unstubAllEnvs();
  }
}

async function runInProcess(args: string[]): Promise<CliRun> {
  let stdout = '';
  let stderr = '';
  let code = 0;
  await runCli(args, {
    streams: { stdout: (s) => (stdout += s), stderr: (s) => (stderr += s) },
    setExitCode: (c) => {
      code = c;
    },
  });
  return { code, stdout, stderr, json: () => JSON.parse(stdout) };
}

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CRUD_TEMPLATE = join(REPO_ROOT, 'templates/crud-app');

/** Copies the real crud-app template (no installs or build output) for `generate` tests. */
export function addCrudTemplate(ws: TempWorkspace) {
  cpSync(CRUD_TEMPLATE, join(ws.root, 'templates/crud-app'), {
    recursive: true,
    filter: (src) => !/[/\\](node_modules|dist)([/\\]|$)/.test(src),
  });
}

/**
 * Makes a generated prototype loadable without `pnpm install`: links the
 * template's installed dependencies into it and the repository's (tsx,
 * svelte-check) into the workspace root, plus the shared tsconfig and test support.
 */
export function linkInstalled(ws: TempWorkspace, slug: string) {
  if (!existsSync(join(ws.root, 'node_modules'))) {
    symlinkSync(join(REPO_ROOT, 'node_modules'), join(ws.root, 'node_modules'), 'dir');
    cpSync(join(REPO_ROOT, 'tsconfig.base.json'), join(ws.root, 'tsconfig.base.json'));
    cpSync(join(REPO_ROOT, 'tests/support'), join(ws.root, 'tests/support'), { recursive: true });
  }
  symlinkSync(
    join(CRUD_TEMPLATE, 'node_modules'),
    join(ws.root, `prototypes/${slug}/node_modules`),
    'dir'
  );
}

/** A small fictional help desk blueprint used by the generate / blueprint tests. */
export function helpdeskBlueprint(overrides: Record<string, unknown> = {}) {
  return {
    formatVersion: 1,
    name: 'Help <desk> & "co"',
    description: "Customers and tickets: it's fictional.",
    entities: [
      {
        name: 'customer',
        plural: 'customers',
        fields: [
          { name: 'name', kind: 'text', required: true, minLength: 2 },
          { name: 'manager', kind: 'persona' },
        ],
        titleField: 'name',
        ownerField: 'manager',
      },
      {
        name: 'support-ticket',
        plural: 'support-tickets',
        label: 'Tickets "VIP" </script>',
        fields: [
          { name: 'subject', kind: 'text', required: true },
          {
            name: 'status',
            kind: 'enum',
            values: ['open', 'solved'],
            default: 'open',
            required: true,
          },
          {
            name: 'customer',
            kind: 'relation',
            to: 'customer',
            required: true,
            onDelete: 'cascade',
          },
        ],
        titleField: 'subject',
      },
    ],
    roles: [
      { name: 'owner', permissions: { '*': ['*'] } },
      { name: 'admin', permissions: { '*': ['*'] } },
      { name: 'member', permissions: { '*': ['read', 'create', 'update'] } },
      { name: 'viewer', permissions: { '*': ['read'] } },
    ],
    ...overrides,
  };
}
