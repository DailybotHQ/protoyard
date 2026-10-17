import type { PublishProvider } from './types.ts';

/**
 * The "static" provider deploys nothing: it produces the portable ZIP and
 * explains how to upload it. Its `url` is the local file, never a web URL.
 */
export function createStaticProvider(): PublishProvider {
  return {
    id: 'static',
    label: 'Static hosting (manual upload)',
    experimental: false,
    defaultProject: (slug) => slug,
    validateProject: () => null,
    async isAvailable() {
      return { available: true, via: 'built-in' };
    },
    async isAuthenticated() {
      return { authenticated: true, detail: 'no account needed' };
    },
    command(input) {
      return ['protoyard', 'export', input.slug];
    },
    async publish(input) {
      if (!input.zipPath) throw new Error('static publish needs the exported ZIP');
      return { url: `file://${input.zipPath}` };
    },
  };
}

export const STATIC_INSTRUCTIONS = [
  'Upload the ZIP contents (not the ZIP itself) to any static host:',
  '  • Cloudflare Pages / Netlify: drag the unzipped folder into the dashboard "deploy manually" area.',
  '  • GitHub Pages / S3 / any web server: copy the files into the served folder.',
  'Builds with base "./" work from any folder; a custom --base must match the URL path.',
  "Data lives in each visitor's browser (IndexedDB) — nothing is shared between visitors.",
];
