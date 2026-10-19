/**
 * `@protoyard/review/store` — the `ReviewAdapter` contract every comments
 * backend implements (local IndexedDB, the Cloudflare Function, any http
 * endpoint, the artifact database), small helpers for adapters, a
 * subscribe-or-poll watcher and the in-memory reference adapter. The
 * conformance suite is `packages/review/tests/conformance.ts`.
 */
export {
  acceptStoredComments,
  changedSince,
  createStamper,
  parseReviewComment,
  type ReviewAdapter,
  type ReviewAdapterInfo,
  type ReviewAdapterKind,
  type ReviewListOptions,
  sortReviewComments,
  watchReviewComments,
} from './contract.ts';
export { createMemoryReviewAdapter } from './memory.ts';
