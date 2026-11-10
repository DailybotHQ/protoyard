import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CliError } from '../output.ts';

/** The global the bundled host entry exposes in the page (`install`). */
export const DS_RENDER_HOST_GLOBAL = '__protoyardDsRender';

let cached: Promise<string> | undefined;

/** The host entry beside this module: `.ts` in the source tree, `.js` in the packed CLI. */
export function hostEntryPath(): string {
  for (const name of ['host-entry.ts', 'host-entry.js']) {
    const file = fileURLToPath(new URL(`./${name}`, import.meta.url));
    if (existsSync(file)) return file;
  }
  throw new CliError('not_found', 'The ds render host entry is missing from @protoyard/cli.', {
    hint: 'Reinstall @protoyard/cli.',
  });
}

/**
 * Bundle `./host-entry.ts` (Texuli's `@texuli/tools/ds-check/host` and the
 * runtime it needs) into one IIFE script with Vite, in memory, once per
 * process. The script is injected into each checked page with
 * `page.addScriptTag`; the built prototype itself is never changed.
 */
export function dsRenderHostScript(): Promise<string> {
  cached ??= (async () => {
    const { build } = await import('vite');
    const output = await build({
      configFile: false,
      logLevel: 'silent',
      root: fileURLToPath(new URL('.', import.meta.url)),
      build: {
        write: false,
        emptyOutDir: false,
        minify: true,
        lib: {
          entry: hostEntryPath(),
          formats: ['iife'],
          name: DS_RENDER_HOST_GLOBAL,
          fileName: () => 'ds-render-host.js',
        },
      },
    });
    const results = Array.isArray(output) ? output : [output];
    for (const result of results) {
      if (!('output' in result)) continue;
      for (const chunk of result.output) {
        if (chunk.type === 'chunk' && chunk.isEntry) return chunk.code;
      }
    }
    throw new CliError('failure', 'Could not bundle the ds render host.');
  })();
  cached.catch(() => {
    cached = undefined;
  });
  return cached;
}
