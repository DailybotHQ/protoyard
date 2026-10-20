/**
 * Source of the Cloudflare Pages advanced-mode worker (`dist/_worker.js`)
 * that `publish --comments` bundles with Vite. It answers `/api/comments/*`
 * with the review handler and hands every other request to the static
 * assets. `_routes.json` already limits invocations to `/api/comments/*`;
 * the asset fallback covers a missing or edited `_routes.json`.
 *
 * Web APIs only: this file and everything it imports end up in the worker.
 * `__PROTOYARD_REVIEW_STORE__` is replaced at bundle time, so only the chosen
 * store ships.
 */
import {
  createD1CommentsStore,
  createKvCommentsStore,
  handleCommentsRequest,
  type ReviewD1Database,
  type ReviewKvNamespace,
} from '@protoyard/review/server';

declare const __PROTOYARD_REVIEW_STORE__: 'd1' | 'kv';

interface ReviewWorkerEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
  REVIEW_DB?: ReviewD1Database;
  REVIEW_KV?: ReviewKvNamespace;
  /** Optional shared key (`wrangler pages secret put REVIEW_KEY`); not authentication. */
  REVIEW_KEY?: string;
}

function unconfigured(binding: string): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      error: {
        code: 'store_unconfigured',
        message: `The comments store binding ${binding} is not configured for this Pages project.`,
      },
    }),
    {
      status: 503,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    }
  );
}

export default {
  async fetch(request: Request, env: ReviewWorkerEnv): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname !== '/api/comments' && !pathname.startsWith('/api/comments/')) {
      return env.ASSETS.fetch(request);
    }
    const handlerEnv = env.REVIEW_KEY ? { REVIEW_KEY: env.REVIEW_KEY } : {};
    if (__PROTOYARD_REVIEW_STORE__ === 'd1') {
      if (!env.REVIEW_DB) return unconfigured('REVIEW_DB');
      return handleCommentsRequest(request, handlerEnv, createD1CommentsStore(env.REVIEW_DB));
    }
    if (!env.REVIEW_KV) return unconfigured('REVIEW_KV');
    return handleCommentsRequest(request, handlerEnv, createKvCommentsStore(env.REVIEW_KV));
  },
};
