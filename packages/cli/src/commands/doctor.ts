import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { CommandResult, Handler } from '../lib/command.ts';
import { flag } from '../lib/command.ts';
import { CliError, mark } from '../lib/output.ts';
import { pnpmCommand } from '../lib/pnpm.ts';
import { run, which } from '../lib/process.ts';
import { loadRegistry } from '../lib/registry.ts';
import { type CommandContext, readPackageJson } from '../lib/workspace.ts';
import { createProvider } from '../publish/index.ts';

type Status = 'pass' | 'fail' | 'warn' | 'skip';

export interface DoctorCheck {
  id: string;
  label: string;
  status: Status;
  detail: string;
  hint?: string;
  /** Required checks fail the command; optional ones only warn. */
  required: boolean;
}

export function compareVersions(a: string, b: string): number {
  const pa = a
    .replace(/^v/, '')
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0);
  const pb = b
    .replace(/^v/, '')
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

const item = (
  id: string,
  label: string,
  status: Status,
  detail: string,
  required: boolean,
  hint?: string
): DoctorCheck => ({ id, label, status, detail, required, ...(hint ? { hint } : {}) });

function nodeCheck(minimum: string): DoctorCheck {
  const current = process.versions.node;
  return compareVersions(current, minimum) >= 0
    ? item('node', 'Node.js', 'pass', `v${current} (needs ≥ ${minimum})`, true)
    : item(
        'node',
        'Node.js',
        'fail',
        `v${current} is older than ${minimum}`,
        true,
        'Install the version in .nvmrc (e.g. `nvm install`).'
      );
}

async function pnpmCheck(expected: string | undefined): Promise<DoctorCheck> {
  const cmd = await pnpmCommand();
  if (!cmd)
    return item(
      'pnpm',
      'pnpm',
      'fail',
      'not found',
      true,
      'Run `corepack enable` (pnpm ships with Node via corepack).'
    );
  const [bin, ...prefix] = cmd as [string, ...string[]];
  const result = await run(bin, [...prefix, '--version'], { timeoutMs: 20_000 });
  const version = result.stdout.trim();
  if (result.code !== 0 || !version)
    return item('pnpm', 'pnpm', 'fail', 'could not run `pnpm --version`', true);
  if (expected && compareVersions(version, expected) < 0) {
    return item(
      'pnpm',
      'pnpm',
      'warn',
      `${version} (repository pins ${expected})`,
      true,
      'Run `corepack enable` to use the pinned version.'
    );
  }
  return item('pnpm', 'pnpm', 'pass', version, true);
}

function dependenciesCheck(ctx: CommandContext): DoctorCheck {
  if (!existsSync(join(ctx.root, 'node_modules', '.modules.yaml'))) {
    return item(
      'deps',
      'Dependencies',
      'fail',
      'node_modules is missing',
      true,
      'Run `pnpm install`.'
    );
  }
  // A prototype created by hand (or with --no-install) is not linked yet.
  const unlinked: string[] = [];
  for (const base of [ctx.paths.prototypes, ctx.paths.templates]) {
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base)) {
      const dir = join(base, name);
      if (existsSync(join(dir, 'package.json')) && !existsSync(join(dir, 'node_modules')))
        unlinked.push(name);
    }
  }
  return unlinked.length > 0
    ? item(
        'deps',
        'Dependencies',
        'warn',
        `not linked: ${unlinked.join(', ')}`,
        true,
        'Run `pnpm install`.'
      )
    : item('deps', 'Dependencies', 'pass', 'installed', true);
}

function layoutCheck(ctx: CommandContext): DoctorCheck {
  const expected = ['pnpm-workspace.yaml', 'packages/core/package.json', 'prototypes', 'templates'];
  const missing = expected.filter((p) => !existsSync(join(ctx.root, p)));
  return missing.length > 0
    ? item(
        'layout',
        'Workspace layout',
        'fail',
        `missing ${missing.join(', ')}`,
        true,
        'Run inside a Protoyard checkout, or pass --root.'
      )
    : item('layout', 'Workspace layout', 'pass', ctx.root, true);
}

async function gitCheck(ctx: CommandContext): Promise<DoctorCheck> {
  const git = await which('git');
  if (!git)
    return item(
      'git',
      'git',
      'warn',
      'not found',
      false,
      'Install git to version your prototypes.'
    );
  const inside = await run(git, ['rev-parse', '--is-inside-work-tree'], {
    cwd: ctx.root,
    timeoutMs: 10_000,
  });
  const version = (await run(git, ['--version'], { timeoutMs: 10_000 })).stdout
    .trim()
    .replace(/^git version /, '');
  return inside.code === 0
    ? item('git', 'git', 'pass', `${version}, inside a repository`, false)
    : item('git', 'git', 'warn', `${version}, but ${ctx.root} is not a git repository`, false);
}

/** Looks for downloaded Playwright browsers without launching anything. */
export function playwrightBrowserDirs(env: NodeJS.ProcessEnv = process.env): string[] {
  const candidates = env.PLAYWRIGHT_BROWSERS_PATH
    ? [env.PLAYWRIGHT_BROWSERS_PATH]
    : process.platform === 'darwin'
      ? [join(homedir(), 'Library', 'Caches', 'ms-playwright')]
      : process.platform === 'win32'
        ? [join(env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'ms-playwright')]
        : [join(homedir(), '.cache', 'ms-playwright')];
  const found: string[] = [];
  for (const dir of candidates) {
    try {
      found.push(...readdirSync(dir).filter((n) => /^chromium/.test(n)));
    } catch {
      // not downloaded
    }
  }
  return found;
}

function playwrightCheck(): DoctorCheck {
  const browsers = playwrightBrowserDirs();
  return browsers.length > 0
    ? item('playwright', 'Playwright browsers', 'pass', browsers.join(', '), false)
    : item(
        'playwright',
        'Playwright browsers',
        'warn',
        'chromium not downloaded',
        false,
        'Run `pnpm test:e2e:install` before `pnpm test:e2e`.'
      );
}

async function providerChecks(ctx: CommandContext, checkAuth: boolean): Promise<DoctorCheck[]> {
  const out: DoctorCheck[] = [];
  for (const id of ['cloudflare', 'netlify', 'vercel'] as const) {
    const provider = createProvider(id, ctx.root);
    const availability = await provider.isAvailable();
    const label = `${provider.label}${provider.experimental ? ' (experimental)' : ''}`;
    if (!availability.available) {
      out.push(
        item(
          `provider-${id}`,
          label,
          'skip',
          'CLI not installed (only needed to publish there)',
          false,
          availability.hint
        )
      );
      continue;
    }
    let detail = `${availability.via}${availability.version ? ` ${availability.version}` : ''}`;
    let status: Status = 'pass';
    let hint: string | undefined;
    if (checkAuth) {
      const auth = await provider
        .isAuthenticated()
        .catch(() => ({ authenticated: false, detail: 'auth check failed', hint: undefined }));
      detail += ` · ${auth.detail}`;
      if (!auth.authenticated) {
        status = 'warn';
        hint = auth.hint;
      }
    }
    out.push(item(`provider-${id}`, label, status, detail, false, hint));
  }
  return out;
}

export const doctorCommand: Handler = async (ctx, _args, options): Promise<CommandResult> => {
  const rootPkg = readPackageJson(join(ctx.root, 'package.json')) as
    | ({ engines?: { node?: string }; packageManager?: string } & Record<string, unknown>)
    | null;
  const minimumNode = rootPkg?.engines?.node?.replace(/^[>=^~\s]+/, '') ?? '24.20.0';
  const pinnedPnpm = rootPkg?.packageManager?.match(/^pnpm@([\d.]+)/)?.[1];

  const checks: DoctorCheck[] = [
    nodeCheck(minimumNode),
    await pnpmCheck(pinnedPnpm),
    layoutCheck(ctx),
    dependenciesCheck(ctx),
  ];
  try {
    const registry = await loadRegistry(ctx.paths);
    const templates = registry.entries.filter((e) => e.kind === 'template').map((e) => e.slug);
    const prototypes = registry.stats.prototypes;
    checks.push(
      templates.length > 0
        ? item('templates', 'Templates', 'pass', templates.join(', '), true)
        : item(
            'templates',
            'Templates',
            'warn',
            'none found',
            true,
            '`protoyard new` needs at least one template under templates/.'
          )
    );
    checks.push(
      registry.invalid.length > 0
        ? item(
            'registry',
            'Registry',
            'warn',
            `${prototypes} prototypes, ${registry.invalid.length} invalid manifest(s)`,
            false,
            'Run `pnpm protoyard index` for details.'
          )
        : item('registry', 'Registry', 'pass', `${prototypes} prototypes indexed`, false)
    );
  } catch (error) {
    checks.push(item('registry', 'Registry', 'fail', (error as Error).message, true));
  }
  checks.push(await gitCheck(ctx));
  checks.push(playwrightCheck());
  if (!flag(options, 'offline')) checks.push(...(await providerChecks(ctx, true)));
  else checks.push(...(await providerChecks(ctx, false)));

  const failed = checks.filter((c) => c.required && c.status === 'fail');
  return {
    data: { ok: failed.length === 0, checks },
    ...(failed.length > 0
      ? {
          failure: new CliError('failure', `${failed.length} required check(s) failed.`, {
            hint: failed.map((f) => f.hint ?? f.label).join(' '),
          }),
        }
      : {}),
    render(out) {
      const { c } = out;
      out.always(c.bold('Protoyard doctor'));
      for (const check of checks) {
        out.always(`${mark(c, check.status)} ${check.label.padEnd(30)} ${c.dim(check.detail)}`);
        if (check.hint && check.status !== 'pass') out.always(`    ${c.yellow(check.hint)}`);
      }
      if (failed.length === 0) out.always(c.green('\nReady to build prototypes.'));
    },
  };
};
