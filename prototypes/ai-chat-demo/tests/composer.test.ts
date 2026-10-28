import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import ChatComposer from '../src/components/ChatComposer.svelte';
import { AGENTS } from '../src/domain/agents.ts';

afterEach(cleanup);

describe('ChatComposer textarea ref', () => {
  it('focuses the textarea and places the caret after a chosen mention', async () => {
    render(ChatComposer, {
      props: {
        agents: AGENTS,
        onSend: async () => true,
      },
    });

    const textarea = screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement;
    textarea.focus();
    await fireEvent.input(textarea, { target: { value: '@at' } });
    expect(screen.getByRole('listbox', { name: 'Mention an agent' })).toBeTruthy();

    await fireEvent.keyDown(textarea, { key: 'Enter' });
    await waitFor(() => expect(textarea.value).toBe('@atlas '));

    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe('@atlas '.length);
    expect(textarea.selectionEnd).toBe('@atlas '.length);
  });
});
