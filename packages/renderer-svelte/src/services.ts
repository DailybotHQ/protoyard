import { PermissionDeniedError, SimulatedServiceError } from '@protoyard/core';
import { toast } from '@protoyard/ui';
import { mountedRuntime } from './context.ts';

/**
 * Consistent feedback for domain services. Wrap UI-triggered mutations:
 *
 *   const result = await runService(() => createDeal(runtime, input), { success: 'Deal created' });
 *   if (result.ok) navigate(`/deals/${result.value.id}`);
 *
 * Permission and simulated-environment failures become toasts; validation
 * errors (anything with an `issues` object) are returned untouched so forms
 * can show them inline.
 *
 * Pending feedback comes for free: the call counts in the mounted runtime's
 * `pending` signal (the global progress bar), and because `runService`
 * returns a promise, a `@protoyard/ui` Button wired as
 * `onclick={() => runService(...)}` shows its spinner until it settles.
 */

export type ServiceResult<T> = { ok: true; value: T } | { ok: false; error: unknown };

export interface RunServiceOptions {
  /** Toast shown on success. */
  success?: string | { title: string; description?: string };
  /** Title for unexpected errors (default "Something went wrong"). */
  errorTitle?: string;
  /** Skip toasts for validation errors (default true). */
  silentValidation?: boolean;
  /** Count the call in the runtime's pending signal (default true). */
  trackPending?: boolean;
}

export function isValidationError(
  error: unknown
): error is Error & { issues: Record<string, string> } {
  return (
    error instanceof Error &&
    typeof (error as { issues?: unknown }).issues === 'object' &&
    (error as { issues?: unknown }).issues !== null
  );
}

const SIMULATED_TITLES: Record<SimulatedServiceError['code'], string> = {
  offline: 'You are offline',
  timeout: 'Request timed out',
  'server-error': 'Server error',
  'permission-denied': 'Request rejected',
  'rate-limited': 'Slow down',
};

/** Maps an error to a toast. Returns false for errors meant for inline display. */
export function reportServiceError(error: unknown, options: RunServiceOptions = {}): boolean {
  // Name check too: a duplicated core copy would break `instanceof`.
  if (
    error instanceof PermissionDeniedError ||
    (error instanceof Error && error.name === 'PermissionDeniedError')
  ) {
    toast.error('Not allowed', {
      description: `Your role can't do this (${(error as PermissionDeniedError).capability}). Switch persona in DevTools to try another role.`,
    });
    return true;
  }
  if (
    error instanceof SimulatedServiceError ||
    (error instanceof Error && error.name === 'SimulatedServiceError')
  ) {
    const code = (error as SimulatedServiceError).code;
    toast.error(SIMULATED_TITLES[code] ?? 'Request failed', { description: error.message });
    return true;
  }
  if (isValidationError(error) && options.silentValidation !== false) return false;
  toast.error(options.errorTitle ?? 'Something went wrong', {
    description: error instanceof Error ? error.message : String(error),
  });
  return true;
}

export async function runService<T>(
  fn: () => T | Promise<T>,
  options: RunServiceOptions = {}
): Promise<ServiceResult<T>> {
  try {
    const pending = options.trackPending === false ? undefined : mountedRuntime()?.pending;
    const value = pending
      ? await pending.track({ kind: 'service', label: 'runService' }, fn)
      : await fn();
    if (options.success) {
      const s = typeof options.success === 'string' ? { title: options.success } : options.success;
      toast.success(s.title, s.description ? { description: s.description } : undefined);
    }
    return { ok: true, value };
  } catch (error) {
    reportServiceError(error, options);
    return { ok: false, error };
  }
}
