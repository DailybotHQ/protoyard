import { run, stripAnsi } from '../lib/process.ts';
import { lastLines, type ToolInvocation, toolAvailability } from './cli-tool.ts';
import {
  ProviderError,
  type PublishInput,
  type PublishProvider,
  type PublishResult,
} from './types.ts';

const INSTALL_HINT = 'Install the Netlify CLI (`npm i -g netlify-cli`).';

export function netlifyArgs(input: PublishInput): string[] {
  return [
    'deploy',
    '--dir',
    input.distDir,
    '--site',
    input.project,
    ...(input.target === 'production' ? ['--prod'] : []),
    '--json',
  ];
}

/** `netlify deploy --json` prints a JSON object with deploy_url / url / deploy_id. */
export function parseNetlifyOutput(output: string): PublishResult | null {
  const text = stripAnsi(output);
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const json = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const url =
      typeof json.deploy_url === 'string'
        ? json.deploy_url
        : typeof json.url === 'string'
          ? json.url
          : null;
    if (!url || !/^https:\/\//.test(url)) return null;
    return {
      url,
      ...(typeof json.deploy_id === 'string' ? { deploymentId: json.deploy_id } : {}),
      ...(typeof json.logs === 'string' ? { details: { logs: json.logs } } : {}),
    };
  } catch {
    return null;
  }
}

export function createNetlifyProvider(root: string): PublishProvider {
  let cached: ToolInvocation | undefined;
  const invocation = async () => {
    if (cached) return cached;
    const availability = await toolAvailability('netlify', root, INSTALL_HINT);
    if (!availability.invocation || !availability.available) {
      throw new ProviderError('The Netlify CLI is not available.', { hint: INSTALL_HINT });
    }
    cached = availability.invocation;
    return cached;
  };
  return {
    id: 'netlify',
    label: 'Netlify',
    experimental: true,
    defaultProject: (slug) => `protoyard-${slug}`,
    validateProject: (project) =>
      /^[A-Za-z0-9][A-Za-z0-9-]{0,62}$/.test(project)
        ? null
        : 'Use a Netlify site name or site id.',
    async isAvailable(options = {}) {
      const { invocation: inv, ...availability } = await toolAvailability(
        'netlify',
        root,
        INSTALL_HINT,
        options
      );
      if (inv && availability.available) cached = inv;
      return availability;
    },
    async isAuthenticated() {
      if (process.env.NETLIFY_AUTH_TOKEN)
        return { authenticated: true, detail: 'NETLIFY_AUTH_TOKEN is set' };
      const [cmd, ...prefix] = (await invocation()).argv as [string, ...string[]];
      const result = await run(cmd, [...prefix, 'status'], { timeoutMs: 30_000 });
      const text = stripAnsi(`${result.stdout}\n${result.stderr}`);
      const loggedIn = result.code === 0 && !/not logged in/i.test(text);
      return loggedIn
        ? { authenticated: true, detail: 'logged in (netlify status)' }
        : {
            authenticated: false,
            detail: 'not logged in',
            hint: 'Run `netlify login` or set NETLIFY_AUTH_TOKEN.',
          };
    },
    command(input) {
      return [...(cached?.argv ?? ['netlify']), ...netlifyArgs(input)];
    },
    async publish(input) {
      const [cmd, ...prefix] = (await invocation()).argv as [string, ...string[]];
      const result = await run(cmd, [...prefix, ...netlifyArgs(input)], { timeoutMs: 600_000 });
      const output = `${result.stdout}\n${result.stderr}`;
      if (result.code !== 0) {
        throw new ProviderError(`netlify deploy failed (exit ${result.code}).`, {
          hint: lastLines(output),
        });
      }
      const parsed = parseNetlifyOutput(result.stdout);
      if (!parsed) {
        throw new ProviderError('Netlify finished but returned no deploy URL; not reporting one.', {
          hint: lastLines(output),
        });
      }
      return parsed;
    },
  };
}
