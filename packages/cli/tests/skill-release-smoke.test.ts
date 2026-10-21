// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const PACK = join(REPO, 'skills', 'protoyard');
const SCRIPT = join(REPO, 'scripts', 'smoke-install-skill.sh');
const BASH = '/bin/bash';
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(REPO, 'tmp', 'skill-release-smoke-test-'));
  roots.push(root);
  const bin = join(root, 'bin');
  const callLog = join(root, 'npx-args.txt');
  mkdirSync(bin);
  writeFileSync(
    join(bin, 'npx'),
    '#!/bin/sh\nset -eu\nprintf "%s\\n" "$*" > "$CALL_LOG"\nmkdir -p "$HOME/.agents/skills/protoyard"\ncp -R "$FIXTURE_SOURCE"/. "$HOME/.agents/skills/protoyard/"\n'
  );
  execFileSync('chmod', ['+x', join(bin, 'npx')]);
  return { root, bin, callLog };
}

function runSmoke(tag: string, root: ReturnType<typeof fixture>) {
  return spawnSync(BASH, [SCRIPT, tag], {
    cwd: REPO,
    env: {
      ...process.env,
      CALL_LOG: root.callLog,
      FIXTURE_SOURCE: PACK,
      PATH: `${root.bin}:${process.env.PATH ?? ''}`,
    },
    encoding: 'utf8',
  });
}

describe('tagged skill release smoke script', () => {
  it('installs the exact source URL in an isolated fixture and checks the pack', () => {
    const root = fixture();
    const result = runSmoke('v1.0.0', root);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Smoke install passed: Protoyard skill 1.0.0');
    const args = readFileSync(root.callLog, 'utf8');
    expect(args).toContain('https://github.com/DailybotHQ/protoyard/tree/v1.0.0');
    expect(args).toContain('--skill protoyard --global --agent codex --copy --yes');
  });

  it('rejects a non-version tag before invoking the installer', () => {
    const root = fixture();
    const result = runSmoke('main', root);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('expected a version tag');
  });
});
