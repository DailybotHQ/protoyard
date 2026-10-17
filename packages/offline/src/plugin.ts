import { readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { createPrecacheManifest, isHashedAsset, type PrecacheManifest } from './manifest.ts';
import { createRegisterScript } from './register.ts';
import { createServiceWorkerSource, serviceWorkerConfig } from './sw-source.ts';

export interface ProtoyardOfflineOptions {
  /** Off unless explicitly enabled (manifest `build.offline` / `PROTOYARD_OFFLINE=1`). */
  enabled: boolean;
  /** Called after sw.js is written (the CLI records it in build-manifest.json). */
  onManifest?: (manifest: PrecacheManifest) => void;
}

/**
 * Structural subset of a Vite plugin, so this package needs no Vite
 * dependency. Build-only: `vite dev` never registers a service worker.
 */
export interface OfflinePlugin {
  name: string;
  apply: 'build';
  enforce: 'post';
  configResolved(config: { root: string; build: { outDir: string } }): void;
  transformIndexHtml(html: string): string;
  closeBundle(): void;
}

const MARKER = 'data-protoyard-offline';

export function protoyardOffline(options: ProtoyardOfflineOptions): OfflinePlugin[] {
  if (!options.enabled) return [];
  let outDir = '';
  return [
    {
      name: 'protoyard-offline',
      apply: 'build',
      enforce: 'post',
      configResolved(config) {
        const out = config.build.outDir;
        outDir = isAbsolute(out) ? out : resolve(config.root, out);
      },
      transformIndexHtml(html) {
        if (html.includes(MARKER)) return html;
        const tag = `<script ${MARKER}>${createRegisterScript()}</script>`;
        return html.includes('</head>')
          ? html.replace('</head>', () => `${tag}\n</head>`)
          : `${tag}${html}`;
      },
      closeBundle() {
        if (!outDir) return;
        // Scanned AFTER Vite wrote everything (including public/), so the
        // precache list is exactly what ships.
        const manifest = createPrecacheManifest(outDir);
        const source = createServiceWorkerSource(serviceWorkerConfig(manifest, isHashedAsset));
        writeFileSync(join(outDir, 'sw.js'), source);
        const html = readFileSync(join(outDir, 'index.html'), 'utf8');
        if (!html.includes(MARKER)) {
          throw new Error('[protoyard-offline] index.html is missing the register script.');
        }
        options.onManifest?.(manifest);
      },
    },
  ];
}
