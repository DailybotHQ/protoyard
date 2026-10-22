import { getRuntime } from '@protoyard/renderer-svelte';
import type { DesignKitDatabase } from '../database/schema.ts';
import { createReviewServices, type ReviewServices } from '../domain/reviews.ts';

let cached: ReviewServices | undefined;
export function reviewService(): ReviewServices {
  cached ??= createReviewServices(getRuntime<DesignKitDatabase>());
  return cached;
}
