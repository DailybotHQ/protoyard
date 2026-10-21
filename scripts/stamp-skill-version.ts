/**
 * Stamp or verify the version in every distributable Protoyard SKILL.md.
 *
 *   pnpm exec tsx scripts/stamp-skill-version.ts 1.2.3
 *   pnpm exec tsx scripts/stamp-skill-version.ts 1.2.3 --check
 *   pnpm exec tsx scripts/stamp-skill-version.ts 1.2.3 --dry-run
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SEMVER =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)));
const FRONTMATTER_VERSION = /^(version:\s*)(["'])([^"']*)\2\s*$/m;

export interface StampOptions {
  root?: string;
  check?: boolean;
  dryRun?: boolean;
}

export interface StampResult {
  files: string[];
  changed: string[];
  errors: string[];
}

function skillFiles(root: string): string[] {
  const found: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory).sort()) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) visit(path);
      else if (entry === 'SKILL.md') found.push(path);
    }
  };
  visit(root);
  return found;
}

function replaceVersion(source: string, version: string, file: string): string {
  if (!source.startsWith('---\n') && !source.startsWith('---\r\n')) {
    throw new Error(`${file}: frontmatter must start with ---`);
  }
  const firstBreak = source.indexOf('\n');
  const closing = firstBreak < 0 ? null : /^---\r?\n/m.exec(source.slice(firstBreak + 1));
  if (!closing) throw new Error(`${file}: frontmatter must close with ---`);
  const headerEnd = firstBreak + 1 + (closing.index ?? 0) + closing[0].length;
  const header = source.slice(0, headerEnd);
  const match = FRONTMATTER_VERSION.exec(header);
  if (!match) throw new Error(`${file}: version must be a quoted SemVer field`);
  const current = match[3] ?? '';
  if (!SEMVER.test(current)) throw new Error(`${file}: version is not SemVer-shaped`);
  return header.replace(FRONTMATTER_VERSION, `$1$2${version}$2`) + source.slice(headerEnd);
}

/** Plan every file first, then optionally write, so malformed files are never partially stamped. */
export function stampSkillVersions(version: string, options: StampOptions = {}): StampResult {
  if (!SEMVER.test(version))
    throw new Error(`release version must be SemVer-shaped (got '${version}')`);
  const root = resolve(options.root ?? join(REPO, 'skills', 'protoyard'));
  const files = skillFiles(root);
  if (files.length === 0) throw new Error(`no SKILL.md files found under ${root}`);

  const planned: Array<{ path: string; display: string; before: string; after: string }> = [];
  const errors: string[] = [];
  for (const path of files) {
    const display = relative(options.root ?? REPO, path);
    const before = readFileSync(path, 'utf8');
    try {
      planned.push({ path, display, before, after: replaceVersion(before, version, display) });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (errors.length > 0)
    return { files: planned.map(({ display }) => display), changed: [], errors };

  const changed = planned.filter(({ before, after }) => before !== after);
  if (options.check) {
    for (const entry of changed) {
      const actual = FRONTMATTER_VERSION.exec(entry.before)?.[3] ?? '(missing)';
      errors.push(`${entry.display}: expected ${version}, found ${actual}`);
    }
    return { files: planned.map(({ display }) => display), changed: [], errors };
  }
  if (!options.dryRun) {
    for (const entry of changed) writeFileSync(entry.path, entry.after);
  }
  return {
    files: planned.map(({ display }) => display),
    changed: changed.map(({ display }) => display),
    errors,
  };
}

export function parseArgs(argv: string[]): {
  version: string;
  root?: string;
  check: boolean;
  dryRun: boolean;
} {
  let version: string | undefined;
  let root: string | undefined;
  let check = false;
  let dryRun = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--check') check = true;
    else if (arg === '--dry-run') dryRun = true;
    else if (arg === '--root') {
      const value = argv[++index];
      if (!value) throw new Error('--root needs a directory');
      root = resolve(value);
    } else if (arg?.startsWith('--')) throw new Error(`unknown option ${arg}`);
    else if (arg && version === undefined) version = arg;
    else throw new Error('provide exactly one release version');
  }
  if (!version) throw new Error('provide a release version');
  if (check && dryRun) throw new Error('--check and --dry-run cannot be combined');
  return { version, ...(root ? { root } : {}), check, dryRun };
}

export function main(argv = process.argv.slice(2)): number {
  try {
    const options = parseArgs(argv);
    const result = stampSkillVersions(options.version, options);
    for (const error of result.errors) console.error(`ERROR: ${error}`);
    if (result.errors.length > 0) return 1;
    if (options.check) {
      console.log(`OK: ${result.files.length} skill versions match ${options.version}`);
    } else if (options.dryRun) {
      console.log(
        `DRY RUN: ${result.changed.length} of ${result.files.length} skill versions would be stamped to ${options.version}`
      );
    } else {
      console.log(
        `Stamped ${result.changed.length} of ${result.files.length} skill versions to ${options.version}`
      );
    }
    return 0;
  } catch (error) {
    console.error(`stamp-skill-version: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main();
}
