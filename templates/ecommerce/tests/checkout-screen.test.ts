import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { ShopDatabase } from '../src/database/schema.ts';
import { definition } from '../src/prototype.ts';
import CheckoutHarness from './CheckoutHarness.svelte';

let harness = createHarness<ShopDatabase>(definition);
afterEach(() => {
  cleanup();
  harness.closeAll();
  harness = createHarness<ShopDatabase>(definition);
});

describe('ecommerce checkout screen', () => {
  it('selects delivery options and recalculates the shipping total', async () => {
    const runtime = await harness.boot('returning-customer');
    render(CheckoutHarness, { runtime });
    const standard = await screen.findByRole('radio', { name: /Standard/ });
    const express = screen.getByRole('radio', { name: /Express/ });
    await waitFor(() => expect(standard.getAttribute('aria-checked')).toBe('true'));
    const shippingRow = screen.getByText('Shipping').parentElement;
    const before = shippingRow?.querySelector('dd')?.textContent;
    await fireEvent.click(express);
    await waitFor(() => expect(express.getAttribute('aria-checked')).toBe('true'));
    expect(shippingRow?.querySelector('dd')?.textContent).not.toBe(before);
  });
});
