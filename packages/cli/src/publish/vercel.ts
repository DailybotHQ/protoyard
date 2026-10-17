import { run, stripAnsi } from '../lib/process.ts';
import { lastLines, type ToolInvocation, toolAvailability } from './cli-tool.ts';
import {
  ProviderError,
  type PublishInput,
  type PublishProvider,
  type PublishResult,
} from './types.ts';

const INSTALL_HINT = 'Install the Vercel CLI (`npm i -g vercel`).';

/**
 * `vercel deploy` has no project-name flag: the target project comes from
 * the folder's link. We link the dist folder to `--project` first (non-
 * interactive, creating the project if needed), then deploy from it.
 */
export function vercelLinkArgs(input: PublishInput): string[] {
  return ['link', '--yes', '--project', input.project, '--cwd', input.distDir];
}

export function vercelArgs(input: PublishInput): string[] {
  return [
    'deploy',
    '--cwd',
    input.distDir,
    '--yes',
    ...(input.target === 'production' ? ['--prod'] : []),
  ];
}

/** `vercel deploy` prints the deployment URL as the last line of stdout. */
export function parseVercelOutput(stdout: string): PublishResult | null {
  const urls = [...stripAnsi(stdout).matchAll(/https:\/\/[a-z0-9.-]+\.vercel\.app\b/gi)].map(
    (m) => m[0]
  );
  const url = urls[urls.length - 1];
  return url ? { url } : null;
}

export function createVercelProvider(root: string): PublishProvider {
  let cached: ToolInvocation | undefined;
  const invocation = async () => {
    if (cached) return cached;
    const availability = await toolAvailability('vercel', root, INSTALL_HINT);
    if (!availability.invocation || !availability.available) {
      throw new ProviderError('The Vercel CLI is not available.', { hint: INSTALL_HINT });
    }
    cached = availability.invocation;
    return cached;
  };
  return {
    id: 'vercel',
    label: 'Vercel',
    experimental: true,
    defaultProject: (slug) => `protoyard-${slug}`,
    // Vercel links the folder to a project interactively or via VERCEL_PROJECT_ID.
    validateProject: (project) =>
      /^[a-z0-9][a-z0-9._-]{0,99}$/.test(project) ? null : 'Use a lowercase Vercel project name.',
    async isAvailable() {
      const { invocation: inv, ...availability } = await toolAvailability(
        'vercel',
        root,
        INSTALL_HINT
      );
      if (inv && availability.available) cached = inv;
      return availability;
    },
    async isAuthenticated() {
      if (process.env.VERCEL_TOKEN) return { authenticated: true, detail: 'VERCEL_TOKEN is set' };
      const [cmd, ...prefix] = (await invocation()).argv as [string, ...string[]];
      const result = await run(cmd, [...prefix, 'whoami'], { timeoutMs: 30_000 });
      return result.code === 0
        ? { authenticated: true, detail: 'logged in (vercel whoami)' }
        : {
            authenticated: false,
            detail: 'not logged in',
            hint: 'Run `vercel login` or set VERCEL_TOKEN.',
          };
    },
    command(input) {
      return [...(cached?.argv ?? ['vercel']), ...vercelArgs(input)];
    },
    setupCommands(input) {
      return [[...(cached?.argv ?? ['vercel']), ...vercelLinkArgs(input)]];
    },
    async publish(input) {
      const [cmd, ...prefix] = (await invocation()).argv as [string, ...string[]];
      const link = await run(cmd, [...prefix, ...vercelLinkArgs(input)], { timeoutMs: 120_000 });
      if (link.code !== 0) {
        throw new ProviderError(`vercel link failed (exit ${link.code}).`, {
          hint: lastLines(`${link.stdout}\n${link.stderr}`),
        });
      }
      const result = await run(cmd, [...prefix, ...vercelArgs(input)], { timeoutMs: 600_000 });
      if (result.code !== 0) {
        throw new ProviderError(`vercel deploy failed (exit ${result.code}).`, {
          hint: lastLines(`${result.stdout}\n${result.stderr}`),
        });
      }
      const parsed = parseVercelOutput(result.stdout);
      if (!parsed) {
        throw new ProviderError(
          'Vercel finished but printed no vercel.app URL; not reporting one.',
          {
            hint: lastLines(`${result.stdout}\n${result.stderr}`),
          }
        );
      }
      return parsed;
    },
  };
}
