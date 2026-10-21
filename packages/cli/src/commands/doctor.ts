import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { checkCiDrift } from '../lib/ci-templates.ts';
import type { CommandResult, Handler } from '../lib/command.ts';
import { flag } from '../lib/command.ts';
import { CliError, mark } from '../lib/output.ts';
import { workspaceLayout } from '../lib/paths.ts';
import { pnpmCommand } from '../lib/pnpm.ts';
import { run, which } from '../lib/process.ts';
import { loadRegistry } from '../lib/registry.ts';
import { type CommandContext, INTERFACE_MAJOR, readPackageJson } from '../lib/workspace.ts';
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

function dependenciesCheck(ctx: CommandContext, layout: 'monorepo' | 'consumer'): DoctorCheck {
  const installed =
    layout === 'monorepo'
      ? existsSync(join(ctx.root, 'node_modules', '.modules.yaml'))
      : existsSync(join(ctx.root, 'node_modules'));
  if (!installed) {
    return item(
      'deps',
      'Dependencies',
      'fail',
      'node_modules is missing',
      true,
      'Run `pnpm install`.'
    );
  }
  if (layout === 'consumer') return item('deps', 'Dependencies', 'pass', 'installed', true);
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
  const layout = workspaceLayout(ctx.root);
  if (layout === 'consumer') {
    return item('layout', 'Workspace layout', 'pass', `${ctx.root} (consumer)`, true);
  }
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
    : item('layout', 'Workspace layout', 'pass', `${ctx.root} (monorepo)`, true);
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

/** Informational: scaffolded CI workflows that a newer template (or a local edit) left behind. */
async function ciTemplatesCheck(ctx: CommandContext): Promise<DoctorCheck[]> {
  let files: Awaited<ReturnType<typeof checkCiDrift>>;
  try {
    files = (await checkCiDrift({ root: ctx.root, provider: 'github' })).filter(
      (f) => f.status !== 'unmanaged'
    );
  } catch {
    return [];
  }
  if (files.length === 0) return [];
  const outdated = files.filter((f) => f.outdated || f.status === 'unhashed');
  const modified = files.filter((f) => f.modified).length;
  const edits = modified > 0 ? ` (${modified} locally modified)` : '';
  return outdated.length > 0
    ? [
        item(
          'ci-templates',
          'CI workflow templates',
          'warn',
          `${outdated.length} of ${files.length} outdated: ${outdated.map((f) => f.path).join(', ')}${edits}`,
          false,
          'Run `pnpm protoyard ci check` for details.'
        ),
      ]
    : [
        item(
          'ci-templates',
          'CI workflow templates',
          'pass',
          `${files.length} up to date${edits}`,
          false
        ),
      ];
}

async function providerChecks(ctx: CommandContext, offline: boolean): Promise<DoctorCheck[]> {
  const checkAuth = !offline;
  const out: DoctorCheck[] = [];
  for (const id of ['cloudflare', 'netlify', 'vercel'] as const) {
    const provider = createProvider(id, ctx.root);
    const availability = await provider.isAvailable({ localOnly: offline });
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

/**
 * The machine interface major (docs/INTERFACE.md). It is versioned apart from
 * the package version and bumps only on a breaking change to the JSON a tool
 * relies on: this field, `capabilities`, the envelope shape and the
 * documented command contracts.
 */
export const DOCTOR_INTERFACE = INTERFACE_MAJOR;

/** Every stable capability id the interface defines (docs/INTERFACE.md). */
export const CAPABILITY_IDS = [
  'blueprint-schema',
  'generate',
  'import',
  'mcp',
  'player',
  'quick',
] as const;
export type CapabilityId = (typeof CAPABILITY_IDS)[number];

/**
 * What THIS CLI implements, sorted. Static: it never depends on the machine,
 * the workspace or a check result, so a detector sees the same answer
 * everywhere. An id is listed only when its command or contract ships:
 * `import` (data-shape import) is defined but not implemented yet.
 */
export const CAPABILITIES: readonly CapabilityId[] = Object.freeze([
  'blueprint-schema',
  'generate',
  'mcp',
  'player',
  'quick',
]);

/** One finding from {@link readInterfaceProbe}. Errors make the probe incompatible. */
export interface InterfaceIssue {
  code:
    | 'unreadable'
    | 'interface-missing'
    | 'interface-malformed'
    | 'interface-mismatch'
    | 'capabilities-malformed'
    | 'capability-unknown'
    | 'capability-missing'
    | 'probe-not-ok';
  severity: 'error' | 'warning';
  message: string;
}

export interface InterfaceProbe {
  /** True only when there is no error: never assumed from a partial answer. */
  compatible: boolean;
  /** `degraded` is compatible with warnings (unknown ids, a failed doctor run). */
  status: 'compatible' | 'degraded' | 'incompatible';
  /** The interface major as read, or null when it is missing or malformed. */
  interface: number | null;
  /** The known capability ids the probe listed, sorted and deduplicated. */
  capabilities: CapabilityId[];
  /** Listed ids this reader does not define: discovery metadata, never a guarantee. */
  unknownCapabilities: string[];
  /** Required ids the probe did not list. */
  missingCapabilities: string[];
  issues: InterfaceIssue[];
}

export interface InterfaceRequirement {
  /** The major a tool speaks; defaults to this CLI's. */
  interface?: number;
  /** Capability ids the tool needs; each must be a defined id. */
  capabilities?: readonly string[];
}

const isCapabilityId = (id: string): id is CapabilityId =>
  (CAPABILITY_IDS as readonly string[]).includes(id);

/**
 * Reads the stdout of `protoyard --version --json` or `protoyard doctor
 * --json` the way docs/INTERFACE.md tells a tool to: strictly. Missing,
 * malformed or mismatched `interface` data and missing required capabilities
 * are errors (incompatible); unknown capability ids and a doctor run that
 * reported `ok: false` are warnings (degraded). Nothing is coerced: `"1"`
 * is not interface 1.
 */
export function readInterfaceProbe(
  stdout: string,
  requirement: InterfaceRequirement = {}
): InterfaceProbe {
  const issues: InterfaceIssue[] = [];
  const error = (code: InterfaceIssue['code'], message: string) =>
    issues.push({ code, severity: 'error', message });
  const warning = (code: InterfaceIssue['code'], message: string) =>
    issues.push({ code, severity: 'warning', message });
  const wanted = requirement.interface ?? INTERFACE_MAJOR;
  const required = [...new Set(requirement.capabilities ?? [])].sort();

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    parsed = undefined;
  }
  let major: number | null = null;
  const capabilities = new Set<CapabilityId>();
  const unknown = new Set<string>();
  let listed = false;

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    error('unreadable', 'The probe output is not one JSON object.');
  } else {
    const probe = parsed as Record<string, unknown>;
    const value = probe.interface;
    if (value === undefined) {
      error('interface-missing', 'The probe output has no top-level `interface` field.');
    } else if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
      error(
        'interface-malformed',
        `\`interface\` must be a positive integer, got ${JSON.stringify(value)}.`
      );
    } else {
      major = value;
      if (value !== wanted)
        error(
          'interface-mismatch',
          `The probe speaks interface ${value}; this tool needs ${wanted}.`
        );
    }

    const list = probe.capabilities;
    if (list !== undefined) {
      if (!Array.isArray(list)) {
        error('capabilities-malformed', '`capabilities` must be an array of capability ids.');
      } else {
        listed = true;
        const invalid = list.filter((id) => typeof id !== 'string');
        if (invalid.length > 0)
          warning(
            'capabilities-malformed',
            `Ignored ${invalid.length} capability entr${invalid.length === 1 ? 'y' : 'ies'} that ${invalid.length === 1 ? 'is' : 'are'} not a string.`
          );
        for (const id of list) {
          if (typeof id !== 'string') continue;
          if (isCapabilityId(id)) capabilities.add(id);
          else unknown.add(id);
        }
        if (unknown.size > 0)
          warning(
            'capability-unknown',
            `Unknown capability id(s) ignored: ${[...unknown].sort().join(', ')}.`
          );
      }
    }

    if (probe.ok === false) {
      const code = (probe.error as { code?: unknown } | undefined)?.code;
      warning(
        'probe-not-ok',
        `The probe command reported ok: false${typeof code === 'string' ? ` (${code})` : ''}; Protoyard is installed but not healthy here.`
      );
    }
  }

  const missing: string[] = [];
  for (const id of required) {
    if (!isCapabilityId(id)) {
      error(
        'capability-unknown',
        `\`${id}\` is not a defined capability id, so no probe can satisfy it.`
      );
      missing.push(id);
    } else if (!capabilities.has(id)) {
      missing.push(id);
    }
  }
  const unmet = missing.filter(isCapabilityId);
  if (unmet.length > 0)
    error(
      'capability-missing',
      listed
        ? `Missing required capability id(s): ${unmet.join(', ')}.`
        : `The probe lists no capabilities (use \`doctor --json\`); required: ${unmet.join(', ')}.`
    );

  const compatible = !issues.some((i) => i.severity === 'error');
  return {
    compatible,
    status: !compatible ? 'incompatible' : issues.length > 0 ? 'degraded' : 'compatible',
    interface: major,
    capabilities: [...capabilities].sort(),
    unknownCapabilities: [...unknown].sort(),
    missingCapabilities: missing,
    issues,
  };
}

const doctorHandler: Handler = async (ctx, _args, options): Promise<CommandResult> => {
  const layout = workspaceLayout(ctx.root) ?? 'monorepo';
  const rootPkg = readPackageJson(join(ctx.root, 'package.json')) as
    | ({ engines?: { node?: string }; packageManager?: string } & Record<string, unknown>)
    | null;
  const minimumNode = rootPkg?.engines?.node?.replace(/^[>=^~\s]+/, '') ?? '24.20.0';
  const pinnedPnpm = rootPkg?.packageManager?.match(/^pnpm@([\d.]+)/)?.[1];

  const checks: DoctorCheck[] = [
    nodeCheck(minimumNode),
    await pnpmCheck(pinnedPnpm),
    layoutCheck(ctx),
    dependenciesCheck(ctx, layout),
  ];
  if (layout === 'monorepo') {
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
  } else {
    checks.push(
      item('registry', 'Registry', 'skip', 'not applicable to a consumer workspace', false)
    );
  }
  checks.push(await gitCheck(ctx));
  checks.push(playwrightCheck());
  checks.push(...(await ciTemplatesCheck(ctx)));
  checks.push(...(await providerChecks(ctx, flag(options, 'offline'))));

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

/**
 * `protoyard doctor`, whose `--json` envelope carries `interface` and
 * `capabilities` at the top level (beside `ok`, `command`, `data`) on every
 * outcome, so DWP's `json:interface` detection reads one field.
 */
export const doctorCommand: Handler = Object.assign(doctorHandler, {
  envelope: Object.freeze({ interface: DOCTOR_INTERFACE, capabilities: CAPABILITIES }),
});
