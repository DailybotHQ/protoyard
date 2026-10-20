import { run, stripAnsi } from '../lib/process.ts';
import { lastLines, type ToolInvocation, toolAvailability } from './cli-tool.ts';
import {
  type CommentsSetup,
  type CommentsStoreKind,
  ProviderError,
  type PublishInput,
  type PublishProvider,
  type PublishResult,
} from './types.ts';

const INSTALL_HINT =
  'Install Wrangler (`pnpm add -D wrangler` in your own fork, or `npm i -g wrangler`).';

/** Cloudflare Pages project names: lowercase letters, digits and dashes, 1–58 chars. */
export function validateCloudflareProject(project: string): string | null {
  return /^[a-z0-9](?:[a-z0-9-]{0,56}[a-z0-9])?$/.test(project)
    ? null
    : 'Cloudflare Pages project names use lowercase letters, digits and dashes (max 58).';
}

/** Safe Cloudflare Pages preview branch slugs exclude the production branch. */
export function validateCloudflareBranch(branch: string): string | null {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(branch)) {
    return 'Preview branches must be lowercase letters, digits and dashes (max 63).';
  }
  if (branch === 'main') return 'The main branch is reserved for production deployments.';
  return null;
}

export function cloudflareArgs(input: PublishInput): string[] {
  return [
    'pages',
    'deploy',
    input.distDir,
    '--project-name',
    input.project,
    // Pages treats the production branch (main by default) as production;
    // any other branch name becomes a preview deployment with its own URL.
    '--branch',
    input.target === 'production' ? 'main' : (input.branch ?? 'preview'),
    '--commit-dirty=true',
  ];
}

/** Argv suffix for `wrangler pages project create` (after the wrangler binary). */
export function cloudflareEnsureProjectArgs(project: string): string[] {
  return ['pages', 'project', 'create', project, '--production-branch', 'main'];
}

/**
 * Parses `wrangler pages project list --json`. Returns project names only —
 * never account ids, emails or other fields (those stay out of logs and hints).
 */
export function parseCloudflareProjectList(output: string): string[] {
  const text = stripAnsi(output).trim();
  if (!text) return [];
  // Wrangler sometimes prints a banner before the JSON array/object.
  const start = text.indexOf('[');
  const objStart = text.indexOf('{');
  let jsonText = text;
  if (start >= 0 && (objStart < 0 || start <= objStart)) {
    jsonText = text.slice(start);
  } else if (objStart >= 0) {
    jsonText = text.slice(objStart);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }
  const rows: unknown[] = Array.isArray(parsed)
    ? parsed
    : parsed &&
        typeof parsed === 'object' &&
        Array.isArray((parsed as { projects?: unknown }).projects)
      ? (parsed as { projects: unknown[] }).projects
      : parsed &&
          typeof parsed === 'object' &&
          Array.isArray((parsed as { result?: unknown }).result)
        ? (parsed as { result: unknown[] }).result
        : [];
  const names: string[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const name = (row as { name?: unknown }).name;
    if (typeof name === 'string' && name.trim()) names.push(name.trim());
  }
  return names;
}

/** True when create failed because the project is already there (race / retry). */
export function isCloudflareProjectAlreadyExists(output: string): boolean {
  const text = stripAnsi(output);
  return (
    /already exists/i.test(text) ||
    /project with (that |the )?name .* already/i.test(text) ||
    /code:\s*8000004/i.test(text) ||
    /A project with this name already exists/i.test(text)
  );
}

/**
 * Wrangler prints the deployment URL ("Take a peek over at https://<hash>.<project>.pages.dev").
 * We take the last pages.dev URL in the output; nothing is synthesized.
 */
export function parseCloudflareOutput(output: string): PublishResult | null {
  const urls = [...stripAnsi(output).matchAll(/https:\/\/[a-z0-9.-]+\.pages\.dev\b[^\s]*/gi)].map(
    (m) => m[0].replace(/[).,]+$/, '')
  );
  const url = urls[urls.length - 1];
  if (!url) return null;
  const host = new URL(url).hostname;
  const first = host.split('.')[0] ?? '';
  return /^[0-9a-f]{8}$/.test(first) ? { url, deploymentId: first } : { url };
}

/** D1 database or KV namespace name for a Pages project's comments. */
export function commentsResourceName(project: string): string {
  return `${project}-comments`;
}

/**
 * The exact one-time Wrangler commands for the shared comments store. They
 * are printed for the developer and never run by the CLI. Bindings for a
 * Pages project are attached in its settings, so that step is a note.
 */
export function cloudflareCommentsSetup(
  wrangler: readonly string[],
  project: string,
  store: CommentsStoreKind,
  schemaFile: string
): CommentsSetup {
  const resource = commentsResourceName(project);
  const binding = store === 'd1' ? 'REVIEW_DB' : 'REVIEW_KV';
  const commands =
    store === 'd1'
      ? [
          [...wrangler, 'd1', 'create', resource],
          [...wrangler, 'd1', 'execute', resource, '--remote', '--file', schemaFile],
        ]
      : [[...wrangler, 'kv', 'namespace', 'create', resource]];
  const kind = store === 'd1' ? 'D1 database' : 'KV namespace';
  return {
    store,
    binding,
    resource,
    commands,
    secret: [...wrangler, 'pages', 'secret', 'put', 'REVIEW_KEY', '--project-name', project],
    notes: [
      `Bind the ${kind} "${resource}" to the Pages project "${project}" as ${binding} (Settings > Bindings, for production and preview), then deploy.`,
      ...(store === 'kv'
        ? ['KV reads, writes and rate limits are eventually consistent; D1 is recommended.']
        : []),
      'REVIEW_KEY is optional: reviewers open the link once with ?review=<key> (kept in that browser). It discourages casual writes and is not authentication.',
    ],
  };
}

function wranglerBase(cached: ToolInvocation | undefined): string[] {
  return [...(cached?.argv ?? ['npx', '--no-install', 'wrangler'])];
}

/**
 * Lists Pages projects and creates `project` when missing. Names only are
 * read from the list output; account details never enter logs or errors.
 */
export async function ensureCloudflareProject(
  argvPrefix: readonly string[],
  project: string,
  options: { runFn?: typeof run; timeoutMs?: number } = {}
): Promise<{ created: boolean; existed: boolean }> {
  const runFn = options.runFn ?? run;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const [cmd, ...prefix] = argvPrefix as [string, ...string[]];

  const list = await runFn(cmd, [...prefix, 'pages', 'project', 'list', '--json'], {
    timeoutMs,
  });
  const listOut = `${list.stdout}\n${list.stderr}`;
  if (list.code !== 0) {
    throw new ProviderError(`wrangler pages project list failed (exit ${list.code}).`, {
      hint: lastLines(listOut) || 'Check wrangler auth (`npx wrangler login`).',
    });
  }
  const names = parseCloudflareProjectList(list.stdout || list.stderr);
  if (names.includes(project)) {
    return { created: false, existed: true };
  }

  const create = await runFn(cmd, [...prefix, ...cloudflareEnsureProjectArgs(project)], {
    timeoutMs,
  });
  const createOut = `${create.stdout}\n${create.stderr}`;
  if (create.code !== 0) {
    if (isCloudflareProjectAlreadyExists(createOut)) {
      return { created: false, existed: true };
    }
    throw new ProviderError(`wrangler pages project create failed (exit ${create.code}).`, {
      hint: lastLines(createOut),
    });
  }
  return { created: true, existed: false };
}

export function createCloudflareProvider(root: string): PublishProvider {
  let cached: ToolInvocation | undefined;
  const invocation = async () => {
    if (cached) return cached;
    const availability = await toolAvailability('wrangler', root, INSTALL_HINT);
    if (!availability.invocation || !availability.available) {
      throw new ProviderError('Wrangler is not available.', { hint: INSTALL_HINT });
    }
    cached = availability.invocation;
    return cached;
  };
  return {
    id: 'cloudflare',
    label: 'Cloudflare Pages',
    experimental: false,
    defaultProject: (slug) => `protoyard-${slug}`.slice(0, 58),
    validateProject: validateCloudflareProject,
    async isAvailable(options = {}) {
      const { invocation: inv, ...availability } = await toolAvailability(
        'wrangler',
        root,
        INSTALL_HINT,
        options
      );
      if (inv && availability.available) cached = inv;
      return availability;
    },
    async isAuthenticated() {
      if (process.env.CLOUDFLARE_API_TOKEN) {
        return { authenticated: true, detail: 'CLOUDFLARE_API_TOKEN is set' };
      }
      const [cmd, ...prefix] = (await invocation()).argv as [string, ...string[]];
      const result = await run(cmd, [...prefix, 'whoami'], { timeoutMs: 30_000 });
      const text = stripAnsi(`${result.stdout}\n${result.stderr}`);
      // Wrangler says "You are not authenticated" when logged out; we never echo the account details.
      const loggedIn = result.code === 0 && !/not authenticated|not logged in/i.test(text);
      return loggedIn
        ? { authenticated: true, detail: 'logged in (wrangler whoami)' }
        : {
            authenticated: false,
            detail: 'not logged in',
            hint: 'Run `npx wrangler login`, or set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.',
          };
    },
    command(input) {
      return [...wranglerBase(cached), ...cloudflareArgs(input)];
    },
    setupCommands(input) {
      if (!input.ensureProject) return [];
      return [[...wranglerBase(cached), ...cloudflareEnsureProjectArgs(input.project)]];
    },
    commentsSetup(input, comments) {
      return cloudflareCommentsSetup(
        wranglerBase(cached),
        input.project,
        comments.store,
        comments.schemaFile
      );
    },
    async publish(input) {
      const [cmd, ...prefix] = (await invocation()).argv as [string, ...string[]];
      if (input.ensureProject) {
        await ensureCloudflareProject([cmd, ...prefix], input.project);
      }
      const result = await run(cmd, [...prefix, ...cloudflareArgs(input)], { timeoutMs: 600_000 });
      const output = `${result.stdout}\n${result.stderr}`;
      if (result.code !== 0) {
        const missingProject = /project not found|8000007|could not find project/i.test(output);
        throw new ProviderError(`wrangler pages deploy failed (exit ${result.code}).`, {
          hint: missingProject
            ? `Create the project once: npx wrangler pages project create ${input.project} --production-branch main (or re-run with --ensure-project)`
            : lastLines(output),
        });
      }
      const parsed = parseCloudflareOutput(output);
      if (!parsed) {
        throw new ProviderError(
          'Wrangler finished but printed no pages.dev URL; not reporting one.',
          {
            hint: lastLines(output),
          }
        );
      }
      return parsed;
    },
  };
}
