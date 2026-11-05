import { cleanup, render, waitFor } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { SaasContext } from '../src/context.ts';
import type { SaasPorts } from '../src/ports.ts';
import AccountGateHarness from './fixtures/AccountGateHarness.svelte';

afterEach(() => {
  cleanup();
  location.hash = '';
});

/** A signed-out product session: the gate opens on requireAccount. */
const ports: SaasPorts = {
  session: {
    isSignedIn: () => false,
    principal: () => null,
    can: () => false,
    subscribe: () => () => {},
  },
  now: () => Date.parse('2026-03-02T09:00:00Z'),
};

function openGate(props: Record<string, unknown>) {
  let ctx!: SaasContext;
  const view = render(AccountGateHarness, {
    props: { ports, onContext: (next: SaasContext) => (ctx = next), ...props },
  });
  flushSync(() => {
    ctx.requireAccount({ reason: 'Saving needs an account.', next: '/saved' });
  });
  return view;
}

describe('AccountGate copy (UG-04)', () => {
  it('reads the dictionary ids', async () => {
    const view = openGate({
      labels: {
        'protoyard.saas.account-gate.title': 'Crea una cuenta para continuar',
        'protoyard.saas.account-gate.create': 'Crear cuenta',
        'protoyard.saas.account-gate.dismiss': 'Seguir navegando',
      },
    });
    await waitFor(() =>
      expect(view.getByRole('dialog', { name: 'Crea una cuenta para continuar' })).toBeTruthy()
    );
    expect(view.getByRole('button', { name: 'Crear cuenta' })).toBeTruthy();
    expect(view.getByRole('button', { name: 'Seguir navegando' })).toBeTruthy();
    expect(view.getByText('Saving needs an account.')).toBeTruthy();
  });

  it('lets props win and keeps English defaults otherwise', async () => {
    const view = openGate({ gate: { title: 'Join to save', createLabel: 'Sign up' } });
    await waitFor(() => expect(view.getByRole('dialog', { name: 'Join to save' })).toBeTruthy());
    expect(view.getByRole('button', { name: 'Sign up' })).toBeTruthy();
    expect(view.getByRole('button', { name: 'Keep browsing' })).toBeTruthy();
    expect(
      view.getByText('Your current screen stays available if you choose to keep browsing.')
    ).toBeTruthy();
  });

  it('renders a custom content snippet with the request', async () => {
    const view = openGate({ customBody: true });
    await waitFor(() => expect(view.getByText('Custom: Saving needs an account.')).toBeTruthy());
    expect(
      view.queryByText('Your current screen stays available if you choose to keep browsing.')
    ).toBeNull();
    expect(view.getByRole('button', { name: 'Create account' })).toBeTruthy();
  });
});
