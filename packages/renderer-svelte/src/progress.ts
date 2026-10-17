import type { LoadProgress } from '@protoyard/core';

/** Human label + bar fraction for a scenario load. `null` fraction = indeterminate. */
export function describeLoadProgress(p: LoadProgress): { label: string; fraction: number | null } {
  switch (p.phase) {
    case 'generate':
      return { label: 'Generating the world…', fraction: null };
    case 'validate':
      return { label: 'Checking integrity…', fraction: null };
    case 'write': {
      const fmt = (n: number) => n.toLocaleString('en-US');
      return p.total > 0
        ? { label: `Writing ${fmt(p.done)} of ${fmt(p.total)} rows…`, fraction: p.done / p.total }
        : { label: 'Writing rows…', fraction: null };
    }
    default:
      return { label: 'Scenario loaded.', fraction: 1 };
  }
}
