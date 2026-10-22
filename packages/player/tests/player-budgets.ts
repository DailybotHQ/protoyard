/**
 * Player budgets that protoyard.budgets.json does not hold yet, in one place.
 * budget.test.ts (against dist/app) and worker-bundle.test.ts (against its own
 * fresh build) both read this, so they can never disagree again (they used to
 * cap the same worker graph at 220 and 250 KB).
 *
 * The world-generation worker's whole graph (entry + generator + scenarios +
 * English Faker), gzip -9. Measured 195.7 KB on 2026-10-22 (4 files); 200 KB
 * when first budgeted. The cap leaves about 12 %. Proposed for
 * protoyard.budgets.json (`overrides.player.workerGraphGzipKb`) once the
 * budget schema has a key for it.
 */
export const WORKER_GRAPH_GZIP_KB = 220;
