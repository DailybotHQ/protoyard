import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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

export async function cli(args: string[]): Promise<CliRun> {
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
