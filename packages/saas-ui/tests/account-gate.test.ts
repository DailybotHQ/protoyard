import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import AccountGateHarness from './fixtures/AccountGateHarness.svelte';

afterEach(() => {
  cleanup();
  location.hash = '';
});

describe('account gate', () => {
  it('lets guests browse, explains the gated action and resumes its destination after sign-in', async () => {
    location.hash = '#/editor?draft=new';
    render(AccountGateHarness);

    await fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(screen.getByTestId('gate-outcome').textContent).toBe('account-required');
    expect(await screen.findByText('Save this draft to your account.')).toBeTruthy();
    expect(screen.getByText('Create an account to continue')).toBeTruthy();
    expect(screen.getByText('Simulated')).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(location.hash).toBe('#/sign-up?next=%2Feditor%3Fdraft%3Dnew'));

    await fireEvent.click(screen.getByRole('button', { name: 'Simulate sign in' }));
    await waitFor(() => expect(location.hash).toBe('#/editor?draft=new'));
    expect(screen.queryByText('Save this draft to your account.')).toBeNull();
  });

  it('dismisses when the visitor leaves the screen', async () => {
    location.hash = '#/browse';
    render(AccountGateHarness);

    await fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('Save this draft to your account.')).toBeTruthy();

    location.hash = '#/another-screen';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await waitFor(() => expect(screen.queryByText('Save this draft to your account.')).toBeNull());
  });

  it('clears the pending destination when the visitor chooses to keep browsing', async () => {
    location.hash = '#/browse';
    render(AccountGateHarness);
    await fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('Save this draft to your account.')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Keep browsing' }));
    expect(screen.queryByText('Save this draft to your account.')).toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: 'Simulate sign in' }));
    expect(location.hash).toBe('#/browse');
  });

  it('allows the action immediately for a signed-in visitor', async () => {
    render(AccountGateHarness);
    await fireEvent.click(screen.getByRole('button', { name: 'Simulate sign in' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(screen.getByTestId('gate-outcome').textContent).toBe('allowed');
    expect(screen.queryByText('Create an account to continue')).toBeNull();
  });
});
