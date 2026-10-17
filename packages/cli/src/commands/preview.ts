import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { artifactDir, BUILD_MANIFEST_FILENAME } from '../lib/build.ts';
import type { CommandResult, Handler } from '../lib/command.ts';
import { flag, opt } from '../lib/command.ts';
import { lanAddresses, untilSignal } from '../lib/network.ts';
import { CliError, mark } from '../lib/output.ts';
import { parsePort } from '../lib/ports.ts';
import { serveStatic } from '../lib/static-server.ts';
import { resolveTarget } from '../lib/workspace.ts';

export const previewCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const { entry } = await resolveTarget(ctx, args[0]);
  const artifacts = artifactDir(ctx, entry.slug);
  const dir = join(artifacts, 'dist');
  if (!existsSync(join(dir, 'index.html'))) {
    throw new CliError('not_found', `${entry.slug} has not been built yet.`, {
      hint: `Run \`pnpm protoyard build ${entry.slug}\` first.`,
    });
  }
  let base = './';
  try {
    const manifest = JSON.parse(
      await readFile(join(artifacts, BUILD_MANIFEST_FILENAME), 'utf8')
    ) as {
      base?: string;
    };
    base = manifest.base ?? './';
  } catch {
    // A dist without a manifest is served at the root.
  }
  const host = flag(options, 'host') ? '0.0.0.0' : '127.0.0.1';
  const requested = parsePort(opt(options, 'port'), 4173);
  const server = await serveStatic({
    dir,
    base,
    port: requested,
    host,
    strictPort: flag(options, 'strictPort'),
  });
  const lan =
    host === '0.0.0.0'
      ? lanAddresses().map((ip) => `http://${ip}:${server.port}${base === './' ? '/' : base}`)
      : [];
  return {
    data: { slug: entry.slug, url: server.url, port: server.port, lan, base },
    render(out) {
      const { c } = out;
      out.always(
        `${mark(c, 'pass')} Serving ${c.bold(entry.slug)} (static build) at ${c.cyan(server.url)}`
      );
      if (server.port !== requested)
        out.info(c.dim(`  Port ${requested} was busy; using ${server.port}.`));
      for (const url of lan) out.always(`  LAN: ${c.cyan(url)}`);
      out.info(c.dim('  Ctrl+C to stop.'));
    },
    keepAlive: untilSignal(() => server.close()),
  };
};
