import type { SessionController } from '@protoyard/core';
import { navigate, nextPath, parseHash } from '@protoyard/renderer-svelte';

export interface AccountGateRequest {
  reason: string;
  next: string;
}

export interface AccountGateController {
  readonly current: AccountGateRequest | null;
  readonly openedOn: string | null;
  requireAccount(request: AccountGateRequest): boolean;
  dismiss(): void;
  continueToSignUp(): void;
  dismissWhenScreenChanges(): void;
  onSessionChange(signedIn: boolean): void;
}

/** Creates per-prototype account-gate state; this is a simulated UX check, not security. */
export function createAccountGate(
  session: Pick<SessionController, 'isSignedIn'>
): AccountGateController {
  let current = $state<AccountGateRequest | null>(null);
  let openedOn = $state<string | null>(null);
  let pendingNext: string | null = null;

  return {
    get current() {
      return current;
    },
    get openedOn() {
      return openedOn;
    },
    requireAccount(request) {
      if (session.isSignedIn()) return true;
      if (!request.reason.trim()) {
        throw new TypeError('requireAccount needs a short reason for the action.');
      }
      const next = nextPath(new URLSearchParams({ next: request.next }), '');
      if (!next) {
        throw new TypeError(
          'requireAccount next must be a same-app route beginning with one slash.'
        );
      }
      current = { reason: request.reason.trim(), next };
      openedOn = currentPath();
      pendingNext = next;
      return false;
    },
    dismiss() {
      current = null;
      openedOn = null;
      pendingNext = null;
    },
    continueToSignUp() {
      current = null;
      openedOn = null;
    },
    dismissWhenScreenChanges() {
      if (current && currentPath() !== openedOn) this.dismiss();
    },
    onSessionChange(signedIn) {
      if (signedIn && pendingNext) {
        const next = pendingNext;
        pendingNext = null;
        current = null;
        openedOn = null;
        navigate(next);
      }
    },
  };
}

function currentPath(): string {
  return typeof location === 'undefined' ? '/' : parseHash(location.hash).path;
}
