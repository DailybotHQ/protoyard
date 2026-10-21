import type { PrototypeDefinition } from '@protoyard/core';

/**
 * Review comments for an exploration served by `protoyard quick serve`. That
 * server hosts a comments API on its own origin (`/api/comments/<namespace>`)
 * and adds `comments=1&review=http` to the launcher it serves; the player then
 * mounts the review UI (lazily, through the renderer's `?comments=1` path)
 * with the HTTP adapter. The endpoint is fixed here and never read from the
 * URL, so a link cannot send comments to another server. Without the
 * parameter (file://, other hosts) review stays as the build has it.
 */

export const SERVED_REVIEW_ENDPOINT = '/api/comments';

export function withServedReview<T extends Pick<PrototypeDefinition, 'manifest'>>(
  definition: T,
  search: string
): T {
  if (new URLSearchParams(search).get('review') !== 'http') return definition;
  return {
    ...definition,
    manifest: {
      ...definition.manifest,
      build: {
        ...definition.manifest.build,
        review: { enabled: true, adapter: 'http', endpoint: SERVED_REVIEW_ENDPOINT },
      },
    },
  };
}
