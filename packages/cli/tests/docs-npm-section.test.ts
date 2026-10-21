// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseArgs as checkPackagesArgs } from '../../../scripts/check-packages.ts';
import { parseArgs as verifyPackagesArgs } from '../../../scripts/verify-packages.ts';
import { parseArgs as versionPackagesArgs } from '../../../scripts/version-packages.ts';

/**
 * The npm release runbook (docs/PUBLISHING.md, "Releasing the packages to
 * npm"): it names the consent checkpoint and trusted publishing, claims no
 * publish that has not happened, and every `pnpm …` command, flag and
 * relative link in it (and in the pointers to it) resolves to something real.
 */

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const PUBLISHING = join(REPO, 'docs', 'PUBLISHING.md');
const rootScripts = (
  JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  }
).scripts;

/** One `## ` section of a Markdown file, up to the next `## ` heading. */
function section(file: string, heading: string): string {
  const text = readFileSync(file, 'utf8');
  const start = text.indexOf(`\n## ${heading}\n`);
  expect(start, `${heading} in ${file}`).toBeGreaterThan(-1);
  const end = text.indexOf('\n## ', start + 1);
  return text.slice(start, end === -1 ? undefined : end);
}

const NPM = section(PUBLISHING, 'Releasing the packages to npm');

/** GitHub heading ids, as the gallery's docs renderer computes them. */
const slug = (heading: string) =>
  heading
    .replace(/[`*_~]/g, '')
    .trim()
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-');

function anchors(file: string): Set<string> {
  const text = readFileSync(file, 'utf8');
  return new Set([...text.matchAll(/^#{1,6} (.+)$/gm)].map((m) => slug(m[1] ?? '')));
}

/** `pnpm …` commands in code blocks and inline code, without trailing comments. */
function pnpmCommands(markdown: string): string[] {
  const inline = [...markdown.matchAll(/`(pnpm [^`]+)`/g)].map((m) => m[1] ?? '');
  const blocks = [...markdown.matchAll(/```bash\n([\s\S]*?)```/g)].flatMap((m) =>
    (m[1] ?? '').split('\n').map((line) => line.trim())
  );
  return [...inline, ...blocks]
    .filter((line) => line.startsWith('pnpm '))
    .map((line) => line.replace(/\s+#.*$/, '').trim());
}

/** Shell-like words: double-quoted strings stay one word. */
const words = (command: string) =>
  [...command.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2] ?? '');

describe('the npm release runbook', () => {
  it('names trusted publishing, the consent checkpoint and the stop-for-a-human rule', () => {
    expect(NPM).toMatch(/trusted publishing/i);
    expect(NPM).toMatch(/### Consent checkpoint: stop for a human/);
    expect(NPM).toMatch(/No Protoyard package has been published to npm yet\./);
    for (const subsection of [
      'What is published',
      'One lockstep version',
      'Add a changeset',
      'Prepare a release',
      'Trusted publishing setup (once per package)',
      'The release workflow',
    ]) {
      expect(NPM).toContain(`\n### ${subsection}\n`);
    }
    // The developer, never an agent, passes the checkpoint.
    expect(NPM).toMatch(
      /never does\.\*\* Push a `v\*` tag, run `npm publish` without\s+`--dry-run`/
    );
    expect(NPM).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN|_authToken/);
  });

  it('names the published set and the lockstep version that the repository really has', () => {
    const version = (
      JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as { version: string }
    ).version;
    expect(NPM).toContain(`Every manifest says \`${version}\``);
    expect(NPM).toContain('`DailybotHQ/protoyard`');
    const workflow = readFileSync(join(REPO, '.github', 'workflows', 'release.yml'), 'utf8');
    expect(workflow).toMatch(/^ {4}environment: npm$/m);
    expect(NPM).toContain('the environment `npm`');
  });

  it('uses only real root scripts, pnpm built-ins and flags the scripts accept', () => {
    const commands = pnpmCommands(NPM);
    expect(commands.length).toBeGreaterThanOrEqual(8);
    const parsers: Record<string, (args: string[]) => unknown> = {
      'check:packages': (args) => checkPackagesArgs(args),
      'verify:packages': (args) => verifyPackagesArgs(args),
      'version-packages': (args) => versionPackagesArgs(args),
    };
    for (const command of commands) {
      const [, first, ...rest] = words(command);
      if (first === '-r') {
        // Recursive pnpm: only ever a dry-run publish over the publishable folders.
        expect(command, command).toMatch(/ publish --dry-run --no-git-checks$/);
        for (const filter of rest.filter((_, i) => rest[i - 1] === '--filter')) {
          expect(existsSync(join(REPO, filter.replace('/**', ''))), filter).toBe(true);
        }
        continue;
      }
      // pnpm's own `pack` is named in prose for what the npm job does.
      if (first === 'pack' && rest.length === 0) continue;
      expect(rootScripts, command).toHaveProperty(first ?? '');
      const parse = parsers[first ?? ''];
      if (parse) expect(() => parse(rest), command).not.toThrow();
    }
  });

  it('names only scripts that exist', () => {
    for (const [, path] of NPM.matchAll(/`bash (scripts\/[\w.-]+)/g)) {
      expect(existsSync(join(REPO, path ?? '')), path).toBe(true);
    }
    for (const [, path] of NPM.matchAll(/`(\.github\/workflows\/[\w.-]+)`/g)) {
      expect(existsSync(join(REPO, path ?? '')), path).toBe(true);
    }
  });

  it('has relative links that resolve, anchors included, in the runbook and its pointers', () => {
    const sources: [string, string][] = [
      [PUBLISHING, NPM],
      [
        join(REPO, 'docs', 'DEVELOPMENT_COMMANDS.md'),
        readFileSync(join(REPO, 'docs', 'DEVELOPMENT_COMMANDS.md'), 'utf8'),
      ],
      [join(REPO, 'README.md'), readFileSync(join(REPO, 'README.md'), 'utf8')],
    ];
    let checked = 0;
    for (const [file, text] of sources) {
      for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
        if (!target || /^[a-z]+:/i.test(target)) continue;
        const [path, anchor] = target.split('#');
        const resolved = path ? resolve(dirname(file), path) : file;
        expect(existsSync(resolved), `${file}: ${target}`).toBe(true);
        if (anchor && resolved.endsWith('.md')) {
          expect(anchors(resolved), `${file}: ${target}`).toContain(anchor);
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('is pointed to from DEVELOPMENT_COMMANDS.md and the README', () => {
    for (const file of ['docs/DEVELOPMENT_COMMANDS.md', 'README.md']) {
      expect(readFileSync(join(REPO, file), 'utf8'), file).toContain(
        'PUBLISHING.md#releasing-the-packages-to-npm'
      );
    }
  });
});
