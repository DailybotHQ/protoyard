import type { CommandResult, Handler } from '../lib/command.ts';
import { flag, opt } from '../lib/command.ts';
import { DEFAULT_DEV_PORT, startDevServer } from '../lib/dev-server.ts';
import { untilSignal } from '../lib/network.ts';
import { mark } from '../lib/output.ts';
import { parsePort } from '../lib/ports.ts';
import { resolveTarget } from '../lib/workspace.ts';

export const devCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const { entry, dir } = await resolveTarget(ctx, args[0]);
  const requested = parsePort(opt(options, 'port'), DEFAULT_DEV_PORT);
  ctx.out.info(`Starting ${ctx.out.c.bold(entry.slug)}…`);
  const server = await startDevServer({
    root: ctx.root,
    dir,
    slug: entry.slug,
    port: requested,
    host: flag(options, 'host'),
    // With --json, Vite's banner would corrupt stdout.
    stdio: ctx.out.options.json ? 'pipe' : 'inherit',
  });
  const stopped = Promise.race([
    server.exited.then(() => undefined),
    untilSignal(() => server.stop()),
  ]);
  return {
    data: {
      slug: entry.slug,
      url: server.url,
      port: server.port,
      lan: server.lan,
      pid: server.child.pid ?? null,
    },
    render(out) {
      const { c } = out;
      out.always(`\n${mark(c, 'pass')} ${c.bold(entry.name)} is running at ${c.cyan(server.url)}`);
      if (server.port !== requested)
        out.info(c.dim(`  Port ${requested} was busy; using ${server.port}.`));
      for (const url of server.lan) out.always(`  On your phone (same network): ${c.cyan(url)}`);
      if (server.lan.length > 0) {
        out.always(
          c.yellow(
            '  ! --host exposes this dev server to your network, including workspace files Vite can serve. Use it on trusted networks only.'
          )
        );
      }
      out.info(c.dim('  Only this prototype is served. Ctrl+C to stop.'));
    },
    keepAlive: stopped,
  };
};
