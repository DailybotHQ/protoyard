// @vitest-environment node
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * Release configuration: Changesets versions every public package in one
 * fixed group (ADR-028), and `pnpm version-packages` keeps the root version
 * (the one release.yml compares with the tag) in step with them.
 */

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/**
 * release.yml (ADR-028): on a `v*` tag the gate also builds, lints and
 * consumer-installs the packages, then packs them in dependency order,
 * checksums the tarballs and uploads both as an artifact. The `npm` job alone
 * gets `id-token: write`; it has no checkout, install or build, verifies the
 * checksums and publishes each tarball with `npm publish --provenance` in
 * order, with no npm token; the GitHub Release waits for it. The workflow is
 * read as text by job and step (no YAML dependency), and the pack, checksum,
 * verify, publish and dist-tag shell is run for real (with a recording fake
 * npm for publishing).
 */
const WORKFLOW = readFileSync(join(REPO, '.github', 'workflows', 'release.yml'), 'utf8');

/** The lines of one top-level job (`  <id>:` up to the next job). */
function job(id: string, workflow = WORKFLOW): string {
  const lines = workflow.split('\n');
  const start = lines.indexOf(`  ${id}:`);
  expect(start, `job ${id}`).toBeGreaterThan(-1);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {2}[a-z][a-z0-9-]*:\s*$/.test(line) || /^\S/.test(line));
  return [lines[start], ...(end === -1 ? rest : rest.slice(0, end))].join('\n');
}

/** Step names of a job, in order. */
function stepNames(block: string): string[] {
  return [...block.matchAll(/^ {6}- name: (.+)$/gm)].map((m) => (m[1] ?? '').trim());
}

describe('release workflow', () => {
  const gate = job('gate');
  const npmJob = job('npm');
  const release = job('release');

  it('grants id-token: write only to the npm job, behind the npm environment', () => {
    expect(WORKFLOW.match(/id-token:/g)).toHaveLength(1);
    expect(npmJob).toMatch(/^ {4}permissions:\n {6}contents: read\n {6}id-token: write$/m);
    expect(npmJob).toMatch(/^ {4}environment: npm$/m);
    // Workflow default stays read-only; the release job only writes contents.
    expect(WORKFLOW).toMatch(/^permissions:\n {2}contents: read$/m);
    expect(gate).not.toMatch(/permissions:/);
    expect(release).toMatch(/^ {4}permissions:\n {6}contents: write$/m);
  });

  it('runs no checkout, install, build or pack while the npm job holds the OIDC token', () => {
    expect(npmJob).not.toMatch(/actions\/checkout@/);
    expect(npmJob).not.toMatch(/\bpnpm\b|corepack|npm (?:install|ci|run|pack)\b|build:packages/);
    const names = stepNames(npmJob);
    const download = npmJob.indexOf('actions/download-artifact@');
    const verify = npmJob.indexOf('      - name: Verify the tarball checksums');
    const publish = npmJob.indexOf('      - name: Publish with provenance');
    expect(download).toBeGreaterThan(
      npmJob.indexOf('      - name: npm supports Trusted Publishing')
    );
    expect(verify).toBeGreaterThan(download);
    expect(publish).toBeGreaterThan(verify);
    expect(names.at(-1)).toBe('Publish with provenance');
    // The gate packs after verify:packages, checksums, then uploads the same folder.
    const pack = gate.indexOf('      - name: Pack every public package in dependency order');
    const sums = gate.indexOf('      - name: Checksum the tarballs');
    const upload = gate.indexOf('actions/upload-artifact@');
    expect(pack).toBeGreaterThan(gate.indexOf('run: pnpm verify:packages'));
    expect(sums).toBeGreaterThan(pack);
    expect(upload).toBeGreaterThan(sums);
    expect(gate).toMatch(/name: npm-tarballs\n {10}path: \$\{\{ runner\.temp \}\}\/tarballs/);
    expect(npmJob).toMatch(/name: npm-tarballs\n {10}path: \$\{\{ runner\.temp \}\}\/tarballs/);
  });
});

/**
 * ci.yml's packages job: build, dist parity and check:packages --require-all
 * on every pull request, with the pnpm store and dist cached and the check
 * report uploaded on failure; the pnpm and npm consumers in parallel on main.
 */
describe('ci workflow packages job', () => {
  const CI = readFileSync(join(REPO, '.github', 'workflows', 'ci.yml'), 'utf8');

  it('keeps every action SHA-pinned, checkouts credential-free, and no write permission', () => {
    const uses = [...CI.matchAll(/uses: (\S+)(.*)$/gm)];
    expect(uses.length).toBeGreaterThan(10);
    for (const [line, ref, comment] of uses) {
      expect(ref, line).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
      expect(comment, line).toMatch(/^ # v\d+\.\d+\.\d+$/);
    }
    const checkouts = [...CI.matchAll(/uses: actions\/checkout@\S+.*\n {8}with:\n {10}(.+)/g)];
    expect(checkouts.length).toBe([...CI.matchAll(/uses: actions\/checkout@/g)].length);
    for (const [, option] of checkouts) expect(option).toBe('persist-credentials: false');
    expect(CI).toMatch(/^permissions:\n {2}contents: read$/m);
    expect(CI).not.toMatch(/: write$/m);
  });
});
