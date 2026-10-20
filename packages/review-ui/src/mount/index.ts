/** `@protoyard/review-ui/mount` — lazy renderer integration for review mode. */
import type { PrototypeDefinition, PrototypeRuntime } from '@protoyard/core';
import type { ReviewAdapter } from '@protoyard/review/store';
import { mount, unmount } from 'svelte';

export interface MountReviewOptions {
  definition: PrototypeDefinition;
  runtime: PrototypeRuntime;
  root: HTMLElement;
}

export interface MountedReview {
  adapter: ReviewAdapter;
  destroy(): Promise<void>;
}

function reviewClientId(slug: string): string {
  const key = `protoyard.review.client:${slug}`;
  try {
    const existing = localStorage.getItem(key);
    if (existing && /^[A-Za-z0-9_:.-]{8,128}$/.test(existing)) return existing;
    const id = `review_${crypto.randomUUID().replaceAll('-', '')}`;
    localStorage.setItem(key, id);
    return id;
  } catch {
    return `review_${crypto.randomUUID().replaceAll('-', '')}`;
  }
}

/** Create the configured adapter and mount all review UI inside the lazy chunk. */
export async function mountReview(options: MountReviewOptions): Promise<MountedReview> {
  const { definition, runtime, root } = options;
  const config = definition.manifest.build.review ?? { enabled: false, adapter: 'local' as const };
  const clientId = reviewClientId(definition.manifest.slug);
  const { createLocalReviewAdapter } = await import('@protoyard/review/adapters/local');
  const { default: ReviewSession } = await import('./ReviewSession.svelte');
  const local = createLocalReviewAdapter({
    namespace: definition.manifest.storage.namespace,
    slug: definition.manifest.slug,
    clientId,
  });
  let adapter: ReviewAdapter = local;
  let composerOnly = false;
  let openComposer: (element: Element) => Promise<boolean> = async () => false;

  if (config.adapter === 'http' || config.adapter === 'cloudflare') {
    const { createHttpReviewAdapter } = await import('@protoyard/review/adapters/http');
    adapter = createHttpReviewAdapter({
      endpoint: config.endpoint ?? (config.adapter === 'cloudflare' ? '/api/comments' : undefined),
      clientId,
      localAdapter: local,
      kind: config.adapter,
    });
  } else if (config.adapter === 'artifact') {
    const { createArtifactShellReviewAdapter } = await import(
      '@protoyard/review/adapters/artifact-shell'
    );
    const shell = await createArtifactShellReviewAdapter(local);
    adapter = shell.adapter;
    composerOnly = shell.mode === 'composer_only';
    openComposer = shell.openComposer;
  }

  const host = document.createElement('div');
  host.dataset.pyReviewRoot = '';
  root.ownerDocument.body.append(host);
  const component = mount(ReviewSession, {
    target: host,
    props: {
      adapter,
      runtime,
      root,
      slug: definition.manifest.slug,
      clientId,
      composerOnly,
      openComposer,
      // Files move comments between browsers only for the browser-local store;
      // shared adapters sync through their endpoint instead.
      ...(config.adapter === 'local'
        ? {
            exportComments: () => local.exportComments(),
            importComments: (file: Blob) => local.importComments(file),
          }
        : {}),
    },
  });
  return {
    adapter,
    async destroy() {
      await unmount(component);
      host.remove();
      local.close();
    },
  };
}
