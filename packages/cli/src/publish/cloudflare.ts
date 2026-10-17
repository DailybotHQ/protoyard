import { run, stripAnsi } from '../lib/process.ts';
import { lastLines, type ToolInvocation, toolAvailability } from './cli-tool.ts';
import {
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
    input.target === 'production' ? 'main' : 'preview',
    '--commit-dirty=true',
  ];
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
    async isAvailable() {
      const { invocation: inv, ...availability } = await toolAvailability(
        'wrangler',
        root,
        INSTALL_HINT
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
      return [...(cached?.argv ?? ['npx', '--no-install', 'wrangler']), ...cloudflareArgs(input)];
    },
    async publish(input) {
      const [cmd, ...prefix] = (await invocation()).argv as [string, ...string[]];
      const result = await run(cmd, [...prefix, ...cloudflareArgs(input)], { timeoutMs: 600_000 });
      const output = `${result.stdout}\n${result.stderr}`;
      if (result.code !== 0) {
        const missingProject = /project not found|8000007|could not find project/i.test(output);
        throw new ProviderError(`wrangler pages deploy failed (exit ${result.code}).`, {
          hint: missingProject
            ? `Create the project once: npx wrangler pages project create ${input.project} --production-branch main`
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
