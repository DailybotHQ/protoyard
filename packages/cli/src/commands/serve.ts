import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_CONTROL_PORT,
  DEFAULT_GALLERY_PORT,
  defaultAllowedOrigins,
  startControlServer,
} from '../control-server.ts';
import type { CommandResult, Handler } from '../lib/command.ts';
import { opt } from '../lib/command.ts';
import { untilSignal } from '../lib/network.ts';
import { CliError, mark } from '../lib/output.ts';
import { parsePort } from '../lib/ports.ts';
import { resolvePackageBin } from '../lib/process.ts';
import { buildIndex } from '../lib/registry.ts';

function origins(options: Record<string, unknown>, galleryPort: number): string[] {
  const extra = (opt(options, 'allowOrigin') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  for (const origin of extra) {
    if (!/^https?:\/\/[^/\s]+$/.test(origin)) {
      throw new CliError(
        'usage',
        `Invalid --allow-origin "${origin}" (expected scheme://host:port).`
      );
    }
  }
  return [...defaultAllowedOrigins(galleryPort), ...extra];
}

/** `protoyard control-server`: only the local API (for a gallery started separately). */
export const controlServerCommand: Handler = async (
  ctx,
  _args,
  options
): Promise<CommandResult> => {
  const galleryPort = parsePort(opt(options, 'galleryPort'), DEFAULT_GALLERY_PORT);
  const control = await startControlServer({
    root: ctx.root,
    port: parsePort(opt(options, 'port'), DEFAULT_CONTROL_PORT),
    allowedOrigins: origins(options, galleryPort),
    log: (line) => ctx.out.info(ctx.out.c.dim(`[control] ${line}`)),
  });
  return {
    data: { url: control.url, port: control.port },
    render(out) {
      out.always(
        `${mark(out.c, 'pass')} Control server on ${out.c.cyan(control.url)} (localhost only)`
      );
    },
    keepAlive: untilSignal(() => control.close()),
  };
};

/** `protoyard gallery`: index, control server and the Astro gallery in one process tree (`pnpm dev`). */
export const galleryCommand: Handler = async (ctx, _args, options): Promise<CommandResult> => {
  const galleryDir = join(ctx.root, 'apps', 'gallery');
  if (!existsSync(join(galleryDir, 'package.json'))) {
    throw new CliError('not_found', 'apps/gallery is missing.');
  }
  const astro = resolvePackageBin('astro', 'astro', [galleryDir, ctx.root]);
  if (!astro)
    throw new CliError('not_found', 'Astro is not installed.', { hint: 'Run `pnpm install`.' });
  const galleryPort = parsePort(opt(options, 'port'), DEFAULT_GALLERY_PORT);
  const index = await buildIndex(ctx.paths);
  const control = await startControlServer({
    root: ctx.root,
    port: parsePort(opt(options, 'controlPort'), DEFAULT_CONTROL_PORT),
    allowedOrigins: origins(options, galleryPort),
    log: (line) => ctx.out.info(ctx.out.c.dim(`[control] ${line}`)),
  });
  const child = spawn(
    process.execPath,
    [astro, 'dev', '--port', String(galleryPort), '--host', '127.0.0.1'],
    {
      cwd: galleryDir,
      env: { ...process.env, PUBLIC_PROTOYARD_CONTROL_URL: control.url },
      shell: false,
      stdio: ctx.out.options.json ? 'ignore' : 'inherit',
    }
  );
  const exited = new Promise<void>((r) => child.once('exit', () => r()));
  const stop = async () => {
    child.kill('SIGTERM');
    await control.close();
  };
  return {
    data: {
      gallery: `http://localhost:${galleryPort}/`,
      control: control.url,
      indexed: index.registry.stats,
    },
    render(out) {
      const { c } = out;
      out.always(
        `${mark(c, 'pass')} Indexed ${index.registry.stats.total} projects · control server ${c.cyan(control.url)}`
      );
      out.always(
        `  Gallery: ${c.cyan(`http://localhost:${galleryPort}/`)} ${c.dim('(starting…)')}`
      );
    },
    keepAlive: Promise.race([exited.then(() => control.close()), untilSignal(stop)]),
  };
};
