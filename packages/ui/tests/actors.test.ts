import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import ActorRow from '../src/components/actors/ActorRow.svelte';

afterEach(() => cleanup());

describe('ActorRow', () => {
  it('renders a person with a role and a supplied fictional portrait', () => {
    const { container } = render(ActorRow, {
      actor: {
        name: 'Ada Lovelace',
        kind: 'person',
        role: 'Product designer',
        avatarUrl: './avatars/64/av-001.webp',
        avatarSrcset: './avatars/64/av-001.webp 1x, ./avatars/128/av-001.webp 2x',
      },
    });

    expect(
      screen.getByRole('article', { name: 'Ada Lovelace, Product designer, person' })
    ).toBeTruthy();
    expect(screen.getByText('Person')).toBeTruthy();
    expect(screen.getByText('Product designer')).toBeTruthy();
    const image = container.querySelector('img');
    expect(image?.getAttribute('src')).toBe('./avatars/64/av-001.webp');
    expect(image?.getAttribute('srcset')).toBe(
      './avatars/64/av-001.webp 1x, ./avatars/128/av-001.webp 2x'
    );
    expect(image?.getAttribute('alt')).toBe('');
  });

  it('identifies a simulated agent by its accessible name and visible label', () => {
    render(ActorRow, {
      actor: { name: 'Research assistant', kind: 'agent', role: 'Research' },
    });

    expect(
      screen.getByRole('article', { name: 'Research assistant, Research, simulated agent' })
    ).toBeTruthy();
    expect(screen.getByText('Agent · simulated')).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Research assistant' })).toBeNull();
  });

  it('shows who handled the item when the handler is an agent', () => {
    const { container } = render(ActorRow, {
      actor: { name: 'Incident report', kind: 'person', role: 'Submitted by Morgan' },
      handledBy: { name: 'Triage agent', kind: 'agent' },
    });

    expect(screen.getByText('Handled by agent Triage agent')).toBeTruthy();
    expect(container.querySelector('[data-handled-by-kind="agent"]')).not.toBeNull();
  });
});
