// @vitest-environment node
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { TEMPLATES_ROOT } from '@protoyard/templates';
import { describe, expect, it } from 'vitest';
import { rewriteWorkspaceDependencies } from '../src/commands/new.ts';
import { workspacePaths } from '../src/lib/paths.ts';
import { CLI_VERSION } from '../src/lib/workspace.ts';
import { addPrototype, addTemplate, cli, createWorkspace } from './helpers.ts';

describe('protoyard new in consumer workspaces', () => {
  it('loads packed templates and pins every workspace dependency to the CLI version', async () => {
    const ws = createWorkspace();
    try {
      rmSync(join(ws.root, 'pnpm-workspace.yaml'));
      ws.write('package.json', { name: 'consumer', private: true, protoyard: {} });

      expect(workspacePaths(ws.root).templates).toBe(TEMPLATES_ROOT);
      const run = await cli([
        '--root',
        ws.root,
        '--json',
        'new',
        'consumer-app',
        '--template',
        'blank',
        '--no-install',
      ]);

      expect(run.code).toBe(0);
      const pkg = JSON.parse(
        readFileSync(join(ws.root, 'prototypes/consumer-app/package.json'), 'utf8')
      ) as Record<string, Record<string, string>>;
      const protoyardDeps = Object.values(pkg)
        .filter((section) => section && typeof section === 'object')
        .flatMap((section) => Object.entries(section))
        .filter(([name]) => name.startsWith('@protoyard/'));
      expect(protoyardDeps.length).toBeGreaterThan(0);
      expect(protoyardDeps.every(([, version]) => version === CLI_VERSION)).toBe(true);
      expect(JSON.stringify(pkg)).not.toContain('workspace:');
      const tsconfig = JSON.parse(
        readFileSync(join(ws.root, 'prototypes/consumer-app/tsconfig.json'), 'utf8')
      ) as Record<string, unknown>;
      expect(tsconfig.extends).toBeUndefined();
      expect(existsSync(join(ws.root, 'prototypes/consumer-app/tests/avatars.test.ts'))).toBe(
        false
      );
    } finally {
      ws.cleanup();
    }
  });

  it('applies the same rewrite when remixing a prototype', async () => {
    const ws = createWorkspace();
    try {
      rmSync(join(ws.root, 'pnpm-workspace.yaml'));
      ws.write('package.json', { name: 'consumer', private: true, protoyard: {} });
      addPrototype(ws, 'starter');
      ws.write('prototypes/starter/package.json', {
        name: '@prototype/starter',
        dependencies: { '@protoyard/core': 'workspace:*' },
        devDependencies: { '@protoyard/runtime': 'workspace:^' },
      });

      const run = await cli([
        '--root',
        ws.root,
        '--json',
        'new',
        'remixed-app',
        '--from',
        'starter',
        '--no-install',
      ]);

      expect(run.code).toBe(0);
      const pkg = JSON.parse(
        readFileSync(join(ws.root, 'prototypes/remixed-app/package.json'), 'utf8')
      ) as Record<string, Record<string, string>>;
      expect(pkg.dependencies?.['@protoyard/core']).toBe(CLI_VERSION);
      expect(pkg.devDependencies?.['@protoyard/runtime']).toBe(CLI_VERSION);
    } finally {
      ws.cleanup();
    }
  });

  it('preserves workspace ranges in the monorepo layout', async () => {
    const ws = createWorkspace();
    try {
      addTemplate(ws, 'blank');
      ws.write('templates/blank/package.json', {
        name: '@protoyard-template/blank',
        dependencies: { '@protoyard/core': 'workspace:*' },
      });
      const run = await cli([
        '--root',
        ws.root,
        '--json',
        'new',
        'monorepo-app',
        '--template',
        'blank',
        '--no-install',
      ]);

      expect(run.code).toBe(0);
      const pkg = JSON.parse(
        readFileSync(join(ws.root, 'prototypes/monorepo-app/package.json'), 'utf8')
      ) as { dependencies: Record<string, string> };
      expect(pkg.dependencies['@protoyard/core']).toBe('workspace:*');
    } finally {
      ws.cleanup();
    }
  });

  it('rewrites workspace ranges in every dependency section and leaves registry versions alone', () => {
    const pkg: Record<string, unknown> = {
      dependencies: { '@protoyard/core': 'workspace:*', dexie: '^4.4.6' },
      devDependencies: { '@protoyard/runtime': 'workspace:^' },
      optionalDependencies: { '@protoyard/offline': 'workspace:~' },
      peerDependencies: { '@protoyard/ui': 'workspace:*' },
    };

    rewriteWorkspaceDependencies(pkg, CLI_VERSION);

    expect(pkg).toEqual({
      dependencies: { '@protoyard/core': CLI_VERSION, dexie: '^4.4.6' },
      devDependencies: { '@protoyard/runtime': CLI_VERSION },
      optionalDependencies: { '@protoyard/offline': CLI_VERSION },
      peerDependencies: { '@protoyard/ui': CLI_VERSION },
    });
  });
});
