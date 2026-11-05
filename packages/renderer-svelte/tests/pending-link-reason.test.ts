import type { PrototypeRuntime } from '@protoyard/core';
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { setChromeMessages } from '../src/messages.ts';
import PendingLinkPrompt from '../src/shell/PendingLinkPrompt.svelte';

afterEach(() => {
  cleanup();
  setChromeMessages();
});

function runtimeWith(pending: { scenario: string; reason: string; code?: string }) {
  return {
    scenarios: { pendingLink: () => pending, get: () => undefined },
  } as unknown as PrototypeRuntime;
}

describe('linked scenario reason (Corag UG-47)', () => {
  it('says the reason in the chrome language from its code', () => {
    setChromeMessages({
      linkedScenario: {
        reasonUnknown: 'El enlace apunta a un escenario desconocido: "{scenario}".',
      },
    });
    render(PendingLinkPrompt, {
      props: {
        runtime: runtimeWith({
          scenario: 'nope',
          code: 'unknown-scenario',
          reason: 'The link points to unknown scenario "nope".',
        }),
      },
    });
    expect(screen.getByText('El enlace apunta a un escenario desconocido: "nope".')).toBeTruthy();
    expect(screen.queryByText(/The link points/)).toBeNull();
  });

  it('falls back to the runtime text without a code', () => {
    render(PendingLinkPrompt, {
      props: { runtime: runtimeWith({ scenario: 'busy', reason: 'Some older runtime reason.' }) },
    });
    expect(screen.getByText('Some older runtime reason.')).toBeTruthy();
  });
});
