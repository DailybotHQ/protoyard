import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AlertDialogHarness from './fixtures/AlertDialogHarness.svelte';

afterEach(() => cleanup());

async function openDialog(): Promise<HTMLElement> {
  await fireEvent.click(screen.getByRole('button', { name: 'Delete project' }));
  return screen.findByRole('alertdialog');
}

describe('AlertDialog', () => {
  it('opens with title and description', async () => {
    render(AlertDialogHarness, {});
    expect(screen.queryByRole('alertdialog')).toBeNull();
    const dialog = await openDialog();
    expect(dialog.textContent).toContain('Delete project?');
    expect(dialog.textContent).toContain('This permanently removes the project.');
    expect(screen.getByTestId('state').textContent).toBe('open');
  });

  it('focuses Cancel, the safe default, when it opens', async () => {
    render(AlertDialogHarness, {});
    await openDialog();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))
    );
  });

  it('cancel closes without calling onConfirm', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(AlertDialogHarness, { onConfirm, onCancel });
    await openDialog();
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('closed'));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('confirm awaits async onConfirm, shows loading, then closes', async () => {
    let resolve: () => void = () => {};
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        })
    );
    render(AlertDialogHarness, { onConfirm });
    await openDialog();

    const confirm = screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement;
    await fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(confirm.getAttribute('aria-busy')).toBe('true'));
    expect(confirm.disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(screen.getByTestId('state').textContent).toBe('open');

    resolve();
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('closed'));
  });

  it('stays open and shows the error when onConfirm rejects', async () => {
    const onConfirm = vi.fn(async () => {
      throw new Error('Network is offline');
    });
    render(AlertDialogHarness, { onConfirm });
    await openDialog();
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Network is offline')).toBeTruthy();
    expect(screen.getByTestId('state').textContent).toBe('open');
  });
});
