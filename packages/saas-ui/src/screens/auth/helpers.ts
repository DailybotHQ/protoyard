import { isValidationError } from '@protoyard/renderer-svelte';
import type { createAuthServices } from '@protoyard/saas';
import { getSaas } from '../../context.ts';

export function authServices() {
  const runtime = getSaas().runtime as Parameters<typeof createAuthServices>[0];
  return { runtime, config: getSaas().config };
}

export function hashParam(name: string): string {
  const query = location.hash.split('?')[1] ?? '';
  return new URLSearchParams(query).get(name) ?? '';
}

export function applyServiceError(
  error: unknown,
  setIssues: (issues: Record<string, string>) => void,
  setMessage: (message: string) => void
): void {
  if (isValidationError(error)) {
    const issues = error.issues;
    setIssues(issues);
    setMessage(issues.form ?? 'Review the highlighted fields and try again.');
    return;
  }
  setMessage(error instanceof Error ? error.message : 'The simulated request failed. Try again.');
}
