import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CliError } from './output.ts';

/**
 * Loads and renders the versioned workflow templates under
 * `packages/cli/ci-templates/<provider>/`. Placeholders use `{{NAME}}` form;
 * rendered output must contain none.
 */

export const CI_WORKFLOW_IDS = ['check', 'build', 'e2e', 'preview'] as const;
export type CiWorkflowId = (typeof CI_WORKFLOW_IDS)[number];

export const CI_PROVIDERS = ['github'] as const;
export type CiProvider = (typeof CI_PROVIDERS)[number];

export const CI_DEPLOY_TARGETS = ['cloudflare'] as const;
export type CiDeployTarget = (typeof CI_DEPLOY_TARGETS)[number];

/**
 * Exact Wrangler version the preview template installs. A clean runner has no
 * Wrangler, and `publish` never installs one; bump with the template version.
 */
export const CI_WRANGLER_VERSION = '4.146.0';

/** Default Node major used when the workspace engines field is absent. */
export const DEFAULT_CI_NODE_VERSION = '24';

const PLACEHOLDER = /\{\{[A-Z0-9_]+\}\}/g;
const SHA_PIN = /^[0-9a-f]{40}$/i;

export interface CiTemplatePlaceholders {
  NODE_VERSION: string;
  PROTOTYPES: string;
  PROVIDER: string;
}

export interface CiRenderedFile {
  id: CiWorkflowId;
  /** Workspace-relative path, e.g. `.github/workflows/protoyard-check.yml`. */
  relativePath: string;
  /** Absolute destination path under the workspace root. */
  absolutePath: string;
  /** Absolute path of the source template. */
  templatePath: string;
  content: string;
  /** True when the destination already exists. */
  exists: boolean;
  /** Previous content when the destination exists. */
  previous: string | null;
}

export interface CiInitPlan {
  provider: CiProvider;
  workflows: CiWorkflowId[];
  deploy: CiDeployTarget | null;
  placeholders: CiTemplatePlaceholders;
  files: CiRenderedFile[];
  secrets: string[];
  manualSteps: string[];
}

/** Package-local templates root (`packages/cli/ci-templates`). */
export function ciTemplatesRoot(fromUrl: string | URL = import.meta.url): string {
  // src/lib → ../../ci-templates
  return join(fileURLToPath(new URL('../..', fromUrl)), 'ci-templates');
}

export function workflowFileName(id: CiWorkflowId): string {
  return `protoyard-${id}.yml`;
}

export function workflowRelativePath(provider: CiProvider, id: CiWorkflowId): string {
  if (provider === 'github') return `.github/workflows/${workflowFileName(id)}`;
  throw new CliError('usage', `Unsupported CI provider "${provider}".`);
}

export function parseWorkflowList(raw: string | undefined): CiWorkflowId[] {
  const value = (raw ?? 'check,build').trim();
  if (!value) {
    throw new CliError('usage', '--with must list at least one workflow.', {
      hint: `Use a comma-separated list of: ${CI_WORKFLOW_IDS.join(', ')}.`,
    });
  }
  const parts = value
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  const out: CiWorkflowId[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    if (!(CI_WORKFLOW_IDS as readonly string[]).includes(part)) {
      throw new CliError('usage', `Unknown workflow "${part}" in --with.`, {
        hint: `Allowed: ${CI_WORKFLOW_IDS.join(', ')}.`,
      });
    }
    if (seen.has(part)) continue;
    seen.add(part);
    out.push(part as CiWorkflowId);
  }
  return out;
}

export function parseCiProvider(raw: string | undefined): CiProvider {
  const value = (raw ?? 'github').trim().toLowerCase();
  if (!(CI_PROVIDERS as readonly string[]).includes(value)) {
    throw new CliError('usage', `Unsupported --provider "${raw ?? ''}".`, {
      hint: `Supported: ${CI_PROVIDERS.join(', ')}.`,
    });
  }
  return value as CiProvider;
}

export function parseDeployTarget(raw: string | undefined): CiDeployTarget | null {
  if (raw === undefined || raw === '') return null;
  const value = raw.trim().toLowerCase();
  if (!(CI_DEPLOY_TARGETS as readonly string[]).includes(value)) {
    throw new CliError('usage', `Unsupported --deploy "${raw}".`, {
      hint: `Supported: ${CI_DEPLOY_TARGETS.join(', ')}.`,
    });
  }
  return value as CiDeployTarget;
}

/** Reads `engines.node` and returns a major version string for setup-node. */
export function nodeVersionFromEngines(enginesNode: string | undefined): string {
  if (!enginesNode) return DEFAULT_CI_NODE_VERSION;
  const match = /(\d+)(?:\.\d+)?/.exec(enginesNode);
  return match?.[1] ?? DEFAULT_CI_NODE_VERSION;
}

export function renderTemplate(
  source: string,
  placeholders: CiTemplatePlaceholders | Readonly<Record<string, string>>
): string {
  const map = placeholders as Readonly<Record<string, string>>;
  const rendered = source.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_full, key: string) => {
    if (!(key in map) || map[key] === undefined) {
      throw new CliError('failure', `Template uses unknown placeholder {{${key}}}.`);
    }
    return map[key] as string;
  });
  const leftover = rendered.match(PLACEHOLDER);
  if (leftover?.length) {
    throw new CliError(
      'failure',
      `Rendered workflow still has unresolved placeholders: ${[...new Set(leftover)].join(', ')}.`
    );
  }
  return rendered;
}

/** Every `uses:` value must be `owner/name@` + 40-char lowercase hex SHA. */
export function assertShaPinnedUses(content: string, label: string): string[] {
  const pins: string[] = [];
  const matches = content.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gm);
  for (const match of matches) {
    const ref = (match[1] ?? '').trim();
    const at = ref.lastIndexOf('@');
    if (at < 0) {
      throw new CliError(
        'validation',
        `${label}: action ref "${ref}" is not SHA-pinned (missing @sha).`
      );
    }
    const sha = ref.slice(at + 1);
    if (!SHA_PIN.test(sha)) {
      throw new CliError(
        'validation',
        `${label}: action ref "${ref}" must use a 40-character commit SHA.`
      );
    }
    pins.push(ref);
  }
  return pins;
}

export async function loadTemplateSource(
  provider: CiProvider,
  id: CiWorkflowId,
  templatesRoot = ciTemplatesRoot()
): Promise<{ path: string; source: string }> {
  const path = join(templatesRoot, provider, workflowFileName(id));
  if (!existsSync(path)) {
    throw new CliError('not_found', `CI template not found: ${path}`, {
      hint: 'Reinstall @protoyard/cli or run from a complete Protoyard checkout.',
    });
  }
  const source = await readFile(path, 'utf8');
  return { path, source };
}

export function secretsForWorkflows(
  workflows: readonly CiWorkflowId[],
  deploy: CiDeployTarget | null
): string[] {
  const secrets: string[] = [];
  if (workflows.includes('preview') || deploy === 'cloudflare') {
    secrets.push('CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID');
  }
  return [...new Set(secrets)];
}

export function manualStepsForInit(options: {
  provider: CiProvider;
  workflows: readonly CiWorkflowId[];
  secrets: readonly string[];
}): string[] {
  const steps = [
    'Settings are not changed by this command.',
    'Review the generated workflow files, then commit them on a branch.',
  ];
  if (options.provider === 'github') {
    steps.push('Ensure GitHub Actions is enabled for the repository (Settings → Actions).');
    if (options.secrets.length > 0) {
      steps.push(
        options.workflows.includes('preview')
          ? `Configure these secrets in the "protoyard-preview" environment (Settings → Environments), not as repository secrets: ${options.secrets.join(', ')}.`
          : `Configure repository secrets (Settings → Secrets and variables → Actions): ${options.secrets.join(', ')}.`
      );
      steps.push('Never commit secret values; only the secret names are printed by this command.');
    }
    if (options.workflows.includes('preview')) {
      steps.push(
        `The preview workflow installs Wrangler ${CI_WRANGLER_VERSION} on the runner (npm install --global wrangler@${CI_WRANGLER_VERSION}); nothing to add to your dependencies.`,
        'The preview workflow passes --ensure-project, so each protoyard-<slug> Pages project is created on its first preview.',
        'Every preview run uploads a public *.pages.dev preview immediately (publish without --dry-run deploys).',
        'Use a Cloudflare API token scoped to "Cloudflare Pages: Edit" on one account, store both secrets in the "protoyard-preview" environment (Settings → Environments) with required reviewers, and rotate the token when collaborators change: the job builds pull request code with the token in its environment.',
        'Preview deploys skip fork pull requests; open PRs from branches on this repository.'
      );
    }
    if (options.workflows.includes('check') || options.workflows.includes('build')) {
      steps.push(
        'Optionally mark the check/build workflows as required status checks after the first green run.'
      );
    }
  }
  return steps;
}

export async function planCiInit(options: {
  root: string;
  provider: CiProvider;
  workflows: readonly CiWorkflowId[];
  deploy: CiDeployTarget | null;
  placeholders: CiTemplatePlaceholders;
  templatesRoot?: string;
}): Promise<CiInitPlan> {
  const templatesRoot = options.templatesRoot ?? ciTemplatesRoot();
  const files: CiRenderedFile[] = [];
  for (const id of options.workflows) {
    const { path: templatePath, source } = await loadTemplateSource(
      options.provider,
      id,
      templatesRoot
    );
    const content = stampContent(renderTemplate(source, options.placeholders));
    assertShaPinnedUses(content, workflowFileName(id));
    const relativePath = workflowRelativePath(options.provider, id);
    const absolutePath = join(options.root, relativePath);
    let previous: string | null = null;
    let exists = false;
    if (existsSync(absolutePath)) {
      exists = true;
      previous = await readFile(absolutePath, 'utf8');
    }
    files.push({
      id,
      relativePath,
      absolutePath,
      templatePath,
      content,
      exists,
      previous,
    });
  }
  const secrets = secretsForWorkflows(options.workflows, options.deploy);
  return {
    provider: options.provider,
    workflows: [...options.workflows],
    deploy: options.deploy,
    placeholders: options.placeholders,
    files,
    secrets,
    manualSteps: manualStepsForInit({
      provider: options.provider,
      workflows: options.workflows,
      secrets,
    }),
  };
}

/** Refuses existing destinations unless `force` is set. */
export function assertWritable(plan: CiInitPlan, force: boolean): void {
  if (force) return;
  const blockers = plan.files.filter((f) => f.exists);
  if (blockers.length === 0) return;
  const names = blockers.map((f) => f.relativePath).join(', ');
  throw new CliError(
    'usage',
    blockers.length === 1
      ? `${blockers[0]?.relativePath ?? 'workflow'} already exists.`
      : `These workflow files already exist: ${names}.`,
    {
      hint: 'Re-run with --force to overwrite, or --dry-run to preview the diff.',
    }
  );
}

export async function writeTextAtomic(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
  await rename(temp, path);
}

export async function applyCiInit(plan: CiInitPlan, options: { force: boolean }): Promise<void> {
  assertWritable(plan, options.force);
  for (const file of plan.files) {
    await writeTextAtomic(file.absolutePath, file.content);
  }
}

/**
 * Minimal unified diff for dry-run output. Enough for agents and humans to
 * see create vs update without a third-party dependency.
 */
export function unifiedDiff(
  relativePath: string,
  previous: string | null,
  next: string,
  context = 3
): string {
  const a = previous === null ? [] : previous.replace(/\n$/, '').split('\n');
  const b = next.replace(/\n$/, '').split('\n');
  const header =
    previous === null
      ? `--- /dev/null\n+++ b/${relativePath}\n`
      : `--- a/${relativePath}\n+++ b/${relativePath}\n`;

  // LCS-free line walk: emit full-file hunks when small, else a single hunk.
  if (previous === next) {
    return `${header}@@ unchanged @@\n`;
  }
  if (previous === null) {
    const lines = b.map((line) => `+${line}`);
    return `${header}@@ -0,0 +1,${b.length} @@\n${lines.join('\n')}\n`;
  }
  // Simple Myers-lite: pair equal prefix/suffix and dump the middle.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }
  const ctxStart = Math.max(0, start - context);
  const ctxEndA = Math.min(a.length - 1, endA + context);
  const ctxEndB = Math.min(b.length - 1, endB + context);
  const oldCount = ctxEndA - ctxStart + 1;
  const newCount = ctxEndB - ctxStart + 1;
  const hunk = [`@@ -${ctxStart + 1},${oldCount} +${ctxStart + 1},${newCount} @@`];
  for (let i = ctxStart; i < start; i++) hunk.push(` ${a[i]}`);
  for (let i = start; i <= endA; i++) hunk.push(`-${a[i]}`);
  for (let i = start; i <= endB; i++) hunk.push(`+${b[i]}`);
  for (let i = endA + 1; i <= ctxEndA; i++) hunk.push(` ${a[i]}`);
  return `${header}${hunk.join('\n')}\n`;
}

export function contentSha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Line 2 of every scaffolded workflow: sha256 of the rendered file without this line. */
export const CI_HASH_PREFIX = '# protoyard-ci-hash: ';
const TEMPLATE_HEADER = /^# protoyard-ci-template: ([a-z0-9-]+) v(\d+)\s*$/;
const HASH_LINE = /^# protoyard-ci-hash: ([0-9a-f]{64})\s*$/;

function withFinalNewline(content: string): string {
  return content.endsWith('\n') ? content : `${content}\n`;
}

/** `# protoyard-ci-template: <id> v<N>` on the first line, or null. */
export function parseTemplateHeader(content: string): { id: string; version: number } | null {
  const match = TEMPLATE_HEADER.exec(content.split('\n', 1)[0] ?? '');
  return match ? { id: match[1] as string, version: Number(match[2]) } : null;
}

/**
 * Inserts the hash line under the template header. The hash covers the
 * rendered content exactly as written (final newline included), so any later
 * edit — or a re-render with other placeholders — changes it.
 */
export function stampContent(rendered: string): string {
  const body = withFinalNewline(rendered);
  if (!parseTemplateHeader(body)) {
    throw new CliError('failure', 'CI template is missing its "# protoyard-ci-template:" header.');
  }
  const newline = body.indexOf('\n');
  return `${body.slice(0, newline + 1)}${CI_HASH_PREFIX}${contentSha256(body)}\n${body.slice(newline + 1)}`;
}

/** Splits a scaffolded file into the stored hash and the body it was computed over. */
export function splitHashLine(content: string): { hash: string | null; body: string } {
  const lines = withFinalNewline(content).split('\n');
  const index = lines.findIndex((line) => HASH_LINE.test(line));
  if (index === -1) return { hash: null, body: withFinalNewline(content) };
  const hash = HASH_LINE.exec(lines[index] as string)?.[1] ?? null;
  lines.splice(index, 1);
  return { hash, body: lines.join('\n') };
}

/**
 * - `up-to-date`: unchanged since `ci init`, and the packaged template has the same version.
 * - `outdated`: unchanged, but Protoyard ships a newer template version.
 * - `modified`: edited after `ci init` (the stored hash no longer matches).
 * - `unhashed`: has our header but no hash line, so edits cannot be detected.
 * - `unmanaged`: named protoyard-*.yml but not one of our templates; left alone.
 */
export type CiDriftStatus = 'up-to-date' | 'outdated' | 'modified' | 'unhashed' | 'unmanaged';

export interface CiDriftReport {
  path: string;
  id: string | null;
  version: number | null;
  latestVersion: number | null;
  status: CiDriftStatus;
  /** True when the file was edited after `ci init`. */
  modified: boolean;
  /** True when a newer template version is packaged (independent of `modified`). */
  outdated: boolean;
}

/** Statuses that `ci check --strict` fails on. */
export const CI_DRIFT_STATUSES: ReadonlySet<CiDriftStatus> = new Set([
  'outdated',
  'modified',
  'unhashed',
]);

export function driftStatus(
  content: string,
  latestVersion: (id: string) => number | null
): Omit<CiDriftReport, 'path'> {
  const header = parseTemplateHeader(content);
  const latest = header ? latestVersion(header.id) : null;
  if (!header || latest === null) {
    return {
      id: header?.id ?? null,
      version: header?.version ?? null,
      latestVersion: null,
      status: 'unmanaged',
      modified: false,
      outdated: false,
    };
  }
  const { hash, body } = splitHashLine(content);
  const modified = hash !== null && contentSha256(body) !== hash;
  const outdated = latest > header.version;
  const status: CiDriftStatus =
    hash === null ? 'unhashed' : modified ? 'modified' : outdated ? 'outdated' : 'up-to-date';
  return {
    id: header.id,
    version: header.version,
    latestVersion: latest,
    status,
    modified,
    outdated,
  };
}

/** Reads `.github/workflows/protoyard-*.yml` and reports drift against the packaged templates. */
export async function checkCiDrift(options: {
  root: string;
  provider: CiProvider;
  templatesRoot?: string;
}): Promise<CiDriftReport[]> {
  const templatesRoot = options.templatesRoot ?? ciTemplatesRoot();
  const dir = join(options.root, '.github', 'workflows');
  if (options.provider !== 'github' || !existsSync(dir)) return [];
  const latest = new Map<string, number | null>();
  for (const id of CI_WORKFLOW_IDS) {
    const path = join(templatesRoot, options.provider, workflowFileName(id));
    latest.set(
      id,
      existsSync(path) ? (parseTemplateHeader(await readFile(path, 'utf8'))?.version ?? null) : null
    );
  }
  const names = (await readdir(dir)).filter((n) => /^protoyard-[a-z0-9-]+\.ya?ml$/.test(n)).sort();
  const reports: CiDriftReport[] = [];
  for (const name of names) {
    const content = await readFile(join(dir, name), 'utf8');
    reports.push({
      path: `.github/workflows/${name}`,
      ...driftStatus(content, (id) => latest.get(id) ?? null),
    });
  }
  return reports;
}
