import type { CommandResult, Handler } from '../lib/command.ts';
import { flag, opt } from '../lib/command.ts';
import { DEFAULT_DEV_PORT, startDevServer } from '../lib/dev-server.ts';
import { untilSignal } from '../lib/network.ts';
import { mark } from '../lib/output.ts';
import { parsePort } from '../lib/ports.ts';
import { templateDemoNamespace } from '../lib/registry.ts';
import { resolveTarget } from '../lib/workspace.ts';

export const devCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const { entry, dir } = await resolveTarget(ctx, args[0]);
  const requested = parsePort(opt(options, 'port'), DEFAULT_DEV_PORT);
  const isTemplateDemo = entry.kind === 'template';
  const storageNamespace = isTemplateDemo ? templateDemoNamespace(entry.slug) : undefined;
  ctx.out.info(
    isTemplateDemo
      ? `Starting template demo ${ctx.out.c.bold(entry.slug)}…`
      : `Starting ${ctx.out.c.bold(entry.slug)}…`
  );
  const server = await startDevServer({
    root: ctx.root,
    dir,
    slug: entry.slug,
    port: requested,
    host: flag(options, 'host'),
    // With --json, Vite's banner would corrupt stdout.
    stdio: ctx.out.options.json ? 'pipe' : 'inherit',
    ...(storageNamespace ? { storageNamespace } : {}),
  });
  const stopped = Promise.race([
    server.exited.then(() => undefined),
    untilSignal(() => server.stop()),
  ]);
  return {
    data: {
      slug: entry.slug,
      kind: entry.kind,
      url: server.url,
      port: server.port,
      lan: server.lan,
      pid: server.child.pid ?? null,
      ...(storageNamespace ? { storageNamespace, demo: true as const } : {}),
    },
    render(out) {
      const { c } = out;
      const label = isTemplateDemo ? `${entry.name} (template demo)` : entry.name;
      out.always(`\n${mark(c, 'pass')} ${c.bold(label)} is running at ${c.cyan(server.url)}`);
      if (server.port !== requested)
        out.info(c.dim(`  Port ${requested} was busy; using ${server.port}.`));
      if (storageNamespace) {
        out.info(
          c.dim(`  Demo storage namespace ${storageNamespace} (template files are never written).`)
        );
      }
      for (const url of server.lan) out.always(`  On your phone (same network): ${c.cyan(url)}`);
      if (server.lan.length > 0) {
        out.always(
          c.yellow(
            '  ! --host exposes this dev server to your network, including workspace files Vite can serve. Use it on trusted networks only.'
          )
        );
      }
      out.info(
        c.dim(
          isTemplateDemo
            ? '  Only this template demo is served. Ctrl+C to stop.'
            : '  Only this prototype is served. Ctrl+C to stop.'
        )
      );
    },
    keepAlive: stopped,
  };
};
