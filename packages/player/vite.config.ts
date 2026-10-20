import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defineProtoyardConfig } from '@protoyard/renderer-svelte/vite';
import type { Plugin } from 'vite';

/**
 * The player builds like a prototype (Tailwind, avatars, DevTools, base `./`,
 * offline service worker) from its own protoyard.json, which only carries
 * build settings: every blueprint gets its manifest and storage namespace at
 * runtime (ADR-029). The `build.offline` flag is consumed by this shared
 * config factory, so the worker is build-only and never runs in `vite dev`.
 *
 * The build adds a strict Content-Security-Policy (see docs/SECURITY.md):
 * scripts only from the player's origin plus the sha256 of each inline
 * script (the no-flash appearance scripts), no `unsafe-eval`, and network,
 * workers and frames limited to the same origin. A meta tag carries it at
 * the top of <head>, so it governs every script after it; `_headers` repeats
 * it as an HTTP header with `frame-ancestors`, which a meta tag cannot set.
 */

/** Origins that may frame the player (embedding pages, ADR-030); never `*`. */
export const PLAYER_FRAME_ANCESTORS = [
  "'self'",
  'https://protoyard.app',
  'http://localhost:*',
  'http://127.0.0.1:*',
];

export function playerCsp(scriptHashes: readonly string[]): string {
  return [
    "default-src 'self'",
    `script-src 'self' ${scriptHashes.map((hash) => `'sha256-${hash}'`).join(' ')}`.trim(),
    // Svelte and the theme engine set style attributes and elements at runtime.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

/** Executable inline scripts (no `src`, no data type) in document order. */
export function inlineScripts(html: string): string[] {
  return [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .filter(
      ([, attrs = '']) =>
        !/\ssrc\s*=/i.test(attrs) && !/\stype\s*=\s*["']?application\/(?:ld\+)?json/i.test(attrs)
    )
    .map(([, , body = '']) => body);
}

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('base64');

function cspPlugin(): Plugin {
  let outDir = 'dist';
  let csp = '';
  return {
    name: 'protoyard-player-csp',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        csp = playerCsp(inlineScripts(html).map(sha256));
        const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;
        return html.replace(/<head(\s[^>]*)?>/i, (head) => `${head}\n    ${meta}`);
      },
    },
    closeBundle() {
      // Cloudflare Pages and Netlify read `_headers`; other hosts: see docs/SECURITY.md.
      const header = `${csp}; frame-ancestors ${PLAYER_FRAME_ANCESTORS.join(' ')}`;
      const html = readFileSync(join(outDir, 'index.html'), 'utf8');
      if (!html.includes(csp)) throw new Error('The built player has no CSP meta tag.');
      writeFileSync(
        join(outDir, '_headers'),
        `/*\n  Content-Security-Policy: ${header}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n`
      );
    },
  };
}

export default defineProtoyardConfig({ root: import.meta.dirname, plugins: [cspPlugin()] });
