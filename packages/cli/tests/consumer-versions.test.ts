// @vitest-environment node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setQuickPlayerLocator } from '../src/commands/quick/index.ts';
import { createPlayerAssetsManifest } from '../src/lib/quick/player-assets.ts';
import { CLI_VERSION } from '../src/lib/workspace.ts';
import {
  addCrudTemplate,
  cli,
  createWorkspace,
  helpdeskBlueprint,
  type TempWorkspace,
} from './helpers.ts';

let ws: TempWorkspace;
let restorePlayer: (() => void) | undefined;
afterEach(() => {
  restorePlayer?.();
  restorePlayer = undefined;
  ws?.cleanup();
});

const deps = {
  protoyard: 'workspace:*',
  '@protoyard/runtime': 'workspace:*',
  '@protoyard/crud': 'workspace:^',
  'create-protoyard': 'workspace:*',
  '@dailybot/ui': 'workspace:*',
};

function setup() {
  ws = createWorkspace();
  ws.write('package.json', {
    name: 'consumer',
    private: true,
    protoyard: { workspace: 1 },
  });
  addCrudTemplate(ws);
  ws.write('templates/crud-app/package.json', {
    name: '@prototype-template/crud-app',
    dependencies: deps,
  });
  ws.write('templates/blank/protoyard.json', {
    id: 'template.blank',
    slug: 'blank',
    kind: 'template',
    name: 'Blank',
    description: 'Blank.',
    version: '0.1.0',
    category: 'general',
    tags: [],
    storage: { namespace: 'blank', schemaVersion: 1 },
    scenarios: ['default'],
  });
  ws.write('templates/blank/package.json', {
    name: '@prototype-template/blank',
    dependencies: deps,
  });
  ws.write('templates/blank/index.html', '<div id="app"></div>');
  ws.write('templates/blank/src/main.ts', 'export {};');
  return (...args: string[]) => cli(['--root', ws.root, '--json', ...args]);
}

function expectPublishedDependencies(path: string, expectConsumerRange = false) {
  const pkg = JSON.parse(readFileSync(join(ws.root, path), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };
  const all = Object.assign(
    {},
    pkg.dependencies,
    pkg.devDependencies,
    pkg.optionalDependencies,
    pkg.peerDependencies
  );
  for (const [name, version] of Object.entries(all)) {
    if (name === 'protoyard' || name === 'create-protoyard' || name.startsWith('@protoyard/')) {
      expect(version, `${path}: ${name}`).toBe(CLI_VERSION);
    }
  }
  if (expectConsumerRange) expect(all['@dailybot/ui']).toBe('workspace:*');
}

describe('published Protoyard versions in consumer workspaces', () => {
  it('rewrites generate, brief generation, quick promotion and remix while retaining other workspace ranges', async () => {
    const run = setup();
    const blueprint = helpdeskBlueprint();
    ws.write('helpdesk.json', blueprint);
    expect(
      (
        await run(
          'generate',
          'generated-app',
          '--blueprint',
          join(ws.root, 'helpdesk.json'),
          '--no-install'
        )
      ).code
    ).toBe(0);
    expectPublishedDependencies('prototypes/generated-app/package.json');

    // The brief path invokes generate in process, using the same consumer detection.
    ws.write('brief.md', 'A help desk for fictional support tickets and customers.');
    const fromBrief = await run(
      'blueprint',
      'new',
      join(ws.root, 'brief.json'),
      '--from-brief',
      join(ws.root, 'brief.md'),
      '--generate',
      'brief-app',
      '--no-install'
    );
    expect(fromBrief.code, fromBrief.stderr || fromBrief.stdout).toBe(0);
    expectPublishedDependencies('prototypes/brief-app/package.json');

    // Remix copies package.json from the source prototype and personalizes it.
    ws.write('prototypes/source-app/protoyard.json', {
      id: 'local.source-app',
      slug: 'source-app',
      kind: 'prototype',
      name: 'Source',
      description: 'Source.',
      version: '0.1.0',
      category: 'general',
      tags: [],
      template: 'blank',
      storage: { namespace: 'source-app', schemaVersion: 1 },
      scenarios: ['default'],
    });
    ws.write('prototypes/source-app/package.json', {
      name: '@prototype/source-app',
      dependencies: deps,
    });
    const remix = await run('new', 'remixed-app', '--from', 'source-app', '--no-install');
    expect(remix.code, remix.stderr || remix.stdout).toBe(0);
    expectPublishedDependencies('prototypes/remixed-app/package.json', true);

    // Create the quick player fixture, then promote a recorded exploration.
    const playerDir = join(ws.root, 'fixture-player/dist/app');
    mkdirSync(join(playerDir, 'assets'), { recursive: true });
    writeFileSync(join(playerDir, 'index.html'), '<title>fixture</title>');
    const manifest = await createPlayerAssetsManifest(playerDir, '1.0.0');
    restorePlayer = setQuickPlayerLocator(() => ({
      dir: playerDir,
      packageDir: join(ws.root, 'fixture-player'),
      version: '1.0.0',
      manifest,
      source: 'repository',
    }));
    const quickCreate = await run(
      'quick',
      '--blueprint',
      join(ws.root, 'helpdesk.json'),
      '--slug',
      'quick-explore'
    );
    expect(quickCreate.code, quickCreate.stderr || quickCreate.stdout).toBe(0);
    const promoted = await run(
      'quick',
      'promote',
      'quick-explore',
      'quick-promoted',
      '--no-install'
    );
    expect(promoted.code, promoted.stderr || promoted.stdout).toBe(0);
    expectPublishedDependencies('prototypes/quick-promoted/package.json');
  }, 30_000);
});
