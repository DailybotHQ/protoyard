import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { PrototypeNote } from '../src/index.ts';
import { setChromeMessages } from '../src/messages.ts';

afterEach(() => {
  cleanup();
  setChromeMessages();
});

describe('PrototypeNote (Corag UG-50)', () => {
  it('shows the badge text in the page flow, translated by chrome messages', () => {
    setChromeMessages({ badge: { text: 'Prototipo · datos simulados' } });
    const view = render(PrototypeNote, { props: { name: 'Example Clinic' } });
    const note = view.container.querySelector('[data-py-prototype-note]');
    expect(note?.textContent?.trim()).toBe('Prototipo · datos simulados');
    expect(note?.className).not.toMatch(/\bfixed\b/);
    expect(note?.getAttribute('title')).toContain('Example Clinic');
  });
});
