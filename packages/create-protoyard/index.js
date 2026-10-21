// @ts-check
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCliBin } from 'protoyard';

/** @typedef {import('./index.d.ts').CreateOptions} CreateOptions */
/** @typedef {import('./index.d.ts').CreateResult} CreateResult */
/** @typedef {import('./index.d.ts').CreateErrorCode} CreateErrorCode */

const HERE = dirname(fileURLToPath(import.meta.url));

/** This scaffolder's own version: the workspace pins `protoyard` to it (lockstep). */
export const VERSION = /** @type {{ version: string }} */ (
  JSON.parse(readFileSync(join(HERE, 'package.json'), 'utf8'))
).version;

export const STARTER_SLUG = 'starter';
export const DEFAULT_TEMPLATE = 'blank';
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EXIT = /** @type {const} */ ({
  usage: 2,
  unsafe_path: 2,
  not_found: 3,
  conflict: 1,
  failure: 1,
});

export class CreateError extends Error {
  /**
   * @param {CreateErrorCode} code
   * @param {string} message
   * @param {string} [hint]
   */
  constructor(code, message, hint) {
    super(message);
    this.name = 'CreateError';
    this.code = code;
    this.hint = hint;
    this.exitCode = EXIT[code];
  }
}

/**
 * The npm package name for a workspace folder: lowercase, with anything
 * outside `[a-z0-9._-]` folded to `-`. Null when nothing usable remains.
 *
 * @param {string} folder
 * @returns {string | null}
 */
export function packageNameFor(folder) {
  const name = folder
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[._-]+|[-]+$/g, '')
    .slice(0, 214);
  return name ? name : null;
}

/** `pnpm` when the caller ran `pnpm create`, `npm` for `npm create`, else pnpm. */
export function detectPackageManager(userAgent = process.env.npm_config_user_agent ?? '') {
  return userAgent.startsWith('npm/') ? 'npm' : 'pnpm';
}

/**
 * True when `child` is `parent` or strictly inside it (canonical paths),
 * the same fence as packages/cli/src/lib/paths.ts `isInside`.
 *
 * @param {string} parent
 * @param {string} child
 */
export function isInside(parent, child) {
  const rel = relative(canonical(parent), canonical(child));
  return rel === '' || (!isAbsolute(rel) && rel.split(sep)[0] !== '..');
}

/** @param {string} path */
function canonical(path) {
  let current = resolve(path);
  const rest = [];
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) break;
    rest.unshift(basename(current));
    current = parent;
  }
  let real = current;
  try {
    real = realpathSync.native(current);
  } catch {
    // unreadable ancestor: keep the lexical path
  }
  return rest.length > 0 ? join(real, ...rest) : real;
}

/**
 * Checks the target folder before anything is written. Returns its absolute
 * path and whether an (empty) folder already exists there.
 *
 * @param {string | undefined} dir
 * @param {string} cwd
 * @returns {{ target: string, exists: boolean }}
 */
export function checkTarget(dir, cwd) {
  if (!dir || dir.trim() === '') {
    throw new CreateError('usage', 'Missing <dir>.', 'Run `npm create protoyard my-workspace`.');
  }
  if (dir.includes('\0'))
    throw new CreateError('unsafe_path', 'The folder name contains a NUL byte.');
  const target = resolve(cwd, dir);
  if (dirname(target) === target) {
    throw new CreateError('unsafe_path', 'Refusing to create a workspace at the filesystem root.');
  }
  if (canonical(target) === canonical(homedir())) {
    throw new CreateError(
      'unsafe_path',
      'Refusing to turn your home folder into a workspace.',
      'Name a new folder, e.g. `npm create protoyard my-workspace`.'
    );
  }
  if (!existsSync(target) && !isSymlink(target)) return { target, exists: false };
  if (isSymlink(target)) {
    throw new CreateError('unsafe_path', `${target} is a symlink; refusing to write through it.`);
  }
  if (!lstatSync(target).isDirectory()) {
    throw new CreateError('conflict', `${target} exists and is not a folder.`);
  }
  const entries = readdirSync(target).filter((name) => !IGNORABLE_ENTRIES.includes(name));
  if (entries.length > 0) {
    throw new CreateError(
      'conflict',
      `${target} is not empty (${entries.slice(0, 3).join(', ')}${entries.length > 3 ? ', …' : ''}).`,
      'Pick a new folder name; create-protoyard never writes into a folder with files.'
    );
  }
  return { target, exists: true };
}

/**
 * Entries an "empty" target folder may still hold (Finder metadata). The
 * check and the removal before the rename share this list, so a folder the
 * check accepts is one `removeEmptyTarget` can always remove.
 */
const IGNORABLE_ENTRIES = ['.DS_Store'];

/**
 * Removes an existing target that holds only ignorable entries. `rmdirSync`
 * still refuses if anything else appeared since `checkTarget` ran.
 * @param {string} target
 */
function removeEmptyTarget(target) {
  for (const name of IGNORABLE_ENTRIES) rmSync(join(target, name), { force: true });
  rmdirSync(target);
}

/** @param {string} path */
function isSymlink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/** @param {string} path @param {string | object} content */
function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`
  );
}

/**
 * The workspace files (everything except the starter prototype).
 *
 * @param {{ name: string, pm: 'pnpm' | 'npm', template: string }} input
 * @returns {Record<string, string | object>}
 */
export function workspaceFiles({ name, pm, template }) {
  const run = pm === 'pnpm' ? 'pnpm protoyard' : 'npx protoyard';
  /** @type {Record<string, string | object>} */
  const files = {
    'package.json': {
      name,
      version: '0.1.0',
      private: true,
      type: 'module',
      description: 'A Protoyard workspace: functional prototypes with simulated data.',
      scripts: { protoyard: 'protoyard' },
      devDependencies: { protoyard: VERSION },
      engines: { node: '>=24.20.0' },
      // The marker the protoyard CLI looks for (a consumer workspace).
      protoyard: { workspace: 1 },
      ...(pm === 'npm' ? { workspaces: ['prototypes/*'] } : {}),
    },
    'tsconfig.base.json': readFileSync(join(HERE, 'files', 'tsconfig.base.json'), 'utf8'),
    '.gitignore': [
      '# installs and build output',
      'node_modules/',
      'dist',
      'artifacts',
      '',
      '# generated registry and caches (rebuilt by `protoyard index`)',
      '.protoyard/',
      '',
      '# environment files (examples stay tracked)',
      '.env',
      '.env.*',
      '!.env.example',
      '',
      '# test output',
      'coverage/',
      'test-results/',
      'playwright-report/',
      '',
    ].join('\n'),
    'AGENTS.md': [
      `# AGENTS.md — ${name}`,
      '',
      'A Protoyard workspace: independent, functional prototypes with a persistent',
      'in-browser database, deterministic scenarios, personas, simulated time and',
      'environment, themes and an in-browser DevTools panel. Real behavior, fake',
      'infrastructure: no backend, fictional data only.',
      '',
      '## Layout',
      '',
      '- `prototypes/<slug>/`: one prototype per folder. Each has its own',
      '  `AGENTS.md` and `docs/` spec (refresh with `protoyard spec <slug> --write`).',
      `- \`prototypes/${STARTER_SLUG}/\`: the starter, copied from the \`${template}\` template.`,
      `- \`package.json\`: pins \`protoyard\` ${VERSION}; the \`protoyard\` field marks this workspace.`,
      '',
      '## Commands',
      '',
      '```bash',
      `${pm} install                          # once, after cloning`,
      `${run} dev ${STARTER_SLUG}                  # run the starter with hot reload`,
      `${run} new my-idea --template dashboard   # another prototype from a template`,
      `${run} validate my-idea --build          # contract, scenarios, types, build`,
      `${run} export my-idea                    # a relocatable ZIP of the static build`,
      `${run} --help                            # every command; each one takes --json`,
      '```',
      '',
      '## Rules',
      '',
      '- Mutations go through services (`session.assert` → zod → `environment.run`',
      '  → `db.transaction`); components never write tables directly.',
      '- Scenarios and generators are deterministic: `ctx.rng`, `ctx.faker`,',
      '  `ctx.ids` and `ctx.time` only, never `Math.random()` or `Date.now()`.',
      '- Fictional data only (`.example` / `example.com`); never real personal data,',
      '  secrets or tokens.',
      '- Simulated sign-in, roles and permissions are not security.',
      "- Publishing to a real provider needs the owner's explicit approval; use",
      '  `protoyard publish <slug> --dry-run` first.',
      '',
      'Docs: https://protoyard.app/docs/',
      '',
    ].join('\n'),
    'README.md': [
      `# ${name}`,
      '',
      'Prototypes built with [Protoyard](https://protoyard.app). Everything they',
      'show is simulated.',
      '',
      '```bash',
      `${pm} install`,
      `${run} dev ${STARTER_SLUG}`,
      '```',
      '',
      'See `AGENTS.md` for the layout, commands and rules.',
      '',
    ].join('\n'),
  };
  if (pm === 'pnpm') {
    files['pnpm-workspace.yaml'] = [
      'packages:',
      '  - prototypes/*',
      '',
      '# esbuild (through Vite and tsx) installs its platform binary with a script.',
      'allowBuilds:',
      '  esbuild: true',
      '',
    ].join('\n');
  }
  return files;
}

/**
 * Runs `protoyard new` (the installed CLI, in a child process) inside `root`.
 *
 * @param {string} root
 * @param {string} template
 * @param {string} cliBin
 */
function runNew(root, template, cliBin) {
  const result = spawnSync(
    process.execPath,
    [cliBin, 'new', STARTER_SLUG, '--template', template, '--no-install', '--json', '--root', root],
    { cwd: root, encoding: 'utf8', env: { ...process.env, CI: process.env.CI ?? '' } }
  );
  /** @type {{ ok?: boolean, data?: unknown, error?: { code?: string, message?: string, hint?: string } } | null} */
  let envelope = null;
  try {
    envelope = JSON.parse(result.stdout);
  } catch {
    envelope = null;
  }
  if (result.status !== 0 || !envelope?.ok) {
    const code = envelope?.error?.code === 'not_found' ? 'not_found' : 'failure';
    throw new CreateError(
      code,
      `protoyard new failed: ${envelope?.error?.message ?? (result.stderr || result.stdout).trim().slice(0, 500)}`,
      envelope?.error?.hint ?? 'Run `npx protoyard list --kind template` for the templates.'
    );
  }
  return envelope.data;
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {string} cwd
 * @param {boolean} quiet
 */
function runTool(command, args, cwd, quiet) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: quiet ? 'pipe' : 'inherit',
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (result.error) return { ok: false, error: result.error.message };
  return result.status === 0
    ? { ok: true }
    : { ok: false, error: `${command} ${args.join(' ')} exited ${result.status}` };
}

/**
 * Creates a workspace: checks the target, stages every file next to it,
 * renames the stage into place, then (optionally) installs and runs git init.
 * A failure before the rename leaves nothing behind.
 *
 * @param {CreateOptions} options
 * @returns {CreateResult}
 */
export function createWorkspace(options) {
  const cwd = options.cwd ?? process.cwd();
  const template = options.template ?? DEFAULT_TEMPLATE;
  if (!SLUG.test(template)) {
    throw new CreateError(
      'usage',
      `"${template}" is not a template name.`,
      'Use a lowercase kebab-case name such as `dashboard`.'
    );
  }
  const pm = options.pm ?? detectPackageManager();
  if (pm !== 'pnpm' && pm !== 'npm') {
    throw new CreateError('usage', `--pm must be pnpm or npm, got "${pm}".`);
  }
  const { target, exists } = checkTarget(options.dir, cwd);
  const name = packageNameFor(basename(target));
  if (!name) {
    throw new CreateError(
      'usage',
      `Cannot derive a package name from "${basename(target)}".`,
      'Use a folder name with letters or digits.'
    );
  }
  const parent = dirname(target);
  mkdirSync(parent, { recursive: true });
  const stage = mkdtempSync(join(parent, `.create-protoyard-${name}-`));
  if (!isInside(parent, stage)) {
    rmSync(stage, { recursive: true, force: true });
    throw new CreateError('unsafe_path', 'The staging folder escaped the target folder.');
  }
  const cliBin = options.cliBin ?? defaultCliBin();
  /** @type {string[]} */
  let written = [];
  /** @type {unknown} */
  let created;
  try {
    for (const [path, content] of Object.entries(workspaceFiles({ name, pm, template }))) {
      write(join(stage, path), content);
    }
    created = runNew(stage, template, cliBin);
    // The CLI's registry cache is rebuilt on demand; the new workspace starts clean.
    rmSync(join(stage, '.protoyard'), { recursive: true, force: true });
    written = listFiles(stage);
    if (exists) removeEmptyTarget(target);
    renameSync(stage, target);
  } catch (error) {
    rmSync(stage, { recursive: true, force: true });
    throw error;
  }

  const quiet = options.quiet ?? false;
  const install =
    options.install === false
      ? { skipped: true, ok: true }
      : { skipped: false, ...runTool(pm, ['install'], target, quiet) };
  const git =
    options.git === false
      ? { skipped: true, ok: true }
      : { skipped: false, ...runTool('git', ['init', '-q'], target, true) };
  const run = pm === 'pnpm' ? 'pnpm protoyard' : 'npx protoyard';
  // A short `cd` inside the current folder, the absolute path anywhere else.
  const shown = isInside(cwd, target) ? relative(cwd, target) || '.' : target;
  return {
    dir: target,
    name,
    version: VERSION,
    pm,
    template,
    prototype: { slug: STARTER_SLUG, path: `prototypes/${STARTER_SLUG}`, created },
    files: written,
    install,
    git,
    skill: options.skill
      ? {
          requested: true,
          installed: false,
          next: 'The agent skill installs separately: clone the matching Protoyard tag and run skills/protoyard/setup.sh --host <host> (see docs/SKILL.md).',
        }
      : { requested: false, installed: false },
    next: [
      `cd ${shown}`,
      ...(install.skipped || !install.ok ? [`${pm} install`] : []),
      `${run} dev ${STARTER_SLUG}`,
    ],
  };
}

/** @param {string} root */
function listFiles(root) {
  /** @type {string[]} */
  const out = [];
  /** @param {string} dir */
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else out.push(relative(root, path).split(sep).join('/'));
    }
  };
  walk(root);
  return out.sort();
}

/** The installed CLI's bin, found by the `protoyard` package (same lockstep version). */
function defaultCliBin() {
  try {
    return resolveCliBin();
  } catch (error) {
    throw new CreateError(
      'not_found',
      error instanceof Error ? error.message : String(error),
      'Reinstall: npm create protoyard@latest <dir>.'
    );
  }
}

const HELP = `Usage: create-protoyard <dir> [options]

Creates a Protoyard workspace in <dir> (a new or empty folder): package.json
pinning protoyard ${VERSION}, the workspace marker, tsconfig.base.json,
AGENTS.md, .gitignore and a starter prototype (prototypes/${STARTER_SLUG}).

  npm create protoyard my-workspace
  pnpm create protoyard my-workspace --template dashboard

Options:
  -t, --template <name>  starter template (default: ${DEFAULT_TEMPLATE})
  --pm <pnpm|npm>        package manager (default: the one running create, else pnpm)
  --no-install           skip the install (nothing touches the network)
  --no-git               skip git init
  -y, --yes              do not ask for confirmation
  --json                 print one JSON envelope instead of text
  --skill                show how to install the Protoyard agent skill
  -v, --version          print the version
  -h, --help             show this help

Exit codes: 0 created, 1 failed or not empty, 2 usage or unsafe path, 3 unknown template.`;

/**
 * @param {readonly string[]} argv
 * @returns {import('./index.d.ts').ParsedArgs}
 */
export function parseArgs(argv) {
  /** @type {import('./index.d.ts').ParsedArgs} */
  const args = {
    dir: undefined,
    install: true,
    git: true,
    yes: false,
    json: false,
    skill: false,
    help: false,
    version: false,
  };
  /** @param {number} i @param {string} flag */
  const value = (i, flag) => {
    const next = argv[i + 1];
    if (!next || next.startsWith('-')) throw new CreateError('usage', `${flag} needs a value.`);
    return next;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg === '-t' || arg === '--template') args.template = value(i++, arg);
    else if (arg.startsWith('--template=')) args.template = arg.slice('--template='.length);
    else if (arg === '--pm') args.pm = /** @type {'pnpm' | 'npm'} */ (value(i++, arg));
    else if (arg.startsWith('--pm='))
      args.pm = /** @type {'pnpm' | 'npm'} */ (arg.slice('--pm='.length));
    else if (arg === '--no-install') args.install = false;
    else if (arg === '--no-git') args.git = false;
    else if (arg === '-y' || arg === '--yes') args.yes = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--skill') args.skill = true;
    else if (arg === '-h' || arg === '--help') args.help = true;
    else if (arg === '-v' || arg === '--version') args.version = true;
    else if (arg.startsWith('-'))
      throw new CreateError('usage', `Unknown option ${arg}.`, 'Run `create-protoyard --help`.');
    else if (args.dir === undefined) args.dir = arg;
    else
      throw new CreateError('usage', `Unexpected argument "${arg}".`, 'Pass exactly one folder.');
  }
  return args;
}

/** @param {string} question */
async function confirm(question) {
  const { createInterface } = await import('node:readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${question} [Y/n] `)).trim().toLowerCase();
    return answer === '' || answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}

/**
 * The command: returns the exit code, writes text or one JSON envelope.
 *
 * @param {readonly string[]} [argv]
 * @returns {Promise<number>}
 */
export async function main(argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  const out = (/** @type {string} */ text) => process.stdout.write(`${text}\n`);
  try {
    const args = parseArgs(argv);
    if (args.help) {
      out(HELP);
      return 0;
    }
    if (args.version) {
      out(VERSION);
      return 0;
    }
    const interactive = process.stdin.isTTY && process.stdout.isTTY && !args.yes && !args.json;
    if (interactive && args.dir) {
      const { target } = checkTarget(args.dir, process.cwd());
      if (!(await confirm(`Create a Protoyard workspace in ${target}?`))) {
        out('Nothing created.');
        return 1;
      }
    }
    const result = createWorkspace({
      dir: args.dir,
      template: args.template,
      pm: args.pm,
      install: args.install,
      git: args.git,
      skill: args.skill,
      quiet: args.json,
    });
    const ok = result.install.ok;
    if (json) {
      out(JSON.stringify({ ok, command: 'create-protoyard', data: result }, null, 2));
    } else {
      out(`✓ Created ${result.name} (protoyard ${result.version}, ${result.pm}) in ${result.dir}`);
      out(`  starter: ${result.prototype.path} (template ${result.template})`);
      if (result.install.skipped) out('  install: skipped (--no-install)');
      else if (!result.install.ok)
        out(`  install: FAILED (${result.install.error}); run it again yourself`);
      if (!result.git.skipped && !result.git.ok) out(`  git init: skipped (${result.git.error})`);
      if (result.skill.next) out(`  skill: ${result.skill.next}`);
      out('\nNext:');
      for (const line of result.next) out(`  ${line}`);
    }
    return ok ? 0 : 1;
  } catch (error) {
    const err =
      error instanceof CreateError
        ? error
        : new CreateError('failure', error instanceof Error ? error.message : String(error));
    if (json) {
      out(
        JSON.stringify(
          {
            ok: false,
            command: 'create-protoyard',
            error: {
              code: err.code,
              message: err.message,
              ...(err.hint ? { hint: err.hint } : {}),
            },
          },
          null,
          2
        )
      );
    } else {
      process.stderr.write(
        `create-protoyard: ${err.message}\n${err.hint ? `  ${err.hint}\n` : ''}`
      );
    }
    return err.exitCode;
  }
}
