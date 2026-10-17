import { toast } from '@protoyard/ui';
import { describeError, type FriendlyError } from './errors.ts';

/** Shows a failure as a toast and returns the description for inline use too. */
export function notifyError(error: unknown): FriendlyError {
  const friendly = describeError(error);
  toast.error(friendly.title, {
    description: friendly.hint ? `${friendly.message} ${friendly.hint}` : friendly.message,
  });
  return friendly;
}
