import { CliError } from '../lib/output.ts';
import { createCloudflareProvider } from './cloudflare.ts';
import { createNetlifyProvider } from './netlify.ts';
import { createStaticProvider } from './static.ts';
import type { PublishProvider } from './types.ts';
import { createVercelProvider } from './vercel.ts';

export const PROVIDER_IDS = ['cloudflare', 'netlify', 'vercel', 'static'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export function createProvider(id: string | undefined, root: string): PublishProvider {
  switch (id) {
    case 'cloudflare':
      return createCloudflareProvider(root);
    case 'netlify':
      return createNetlifyProvider(root);
    case 'vercel':
      return createVercelProvider(root);
    case 'static':
      return createStaticProvider();
    default:
      throw new CliError('usage', `Unknown --provider "${id ?? ''}".`, {
        hint: `Use one of: ${PROVIDER_IDS.join(', ')}.`,
      });
  }
}
