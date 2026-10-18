import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatBytes,
  matchesAccept,
  validateFiles,
} from '../src/components/file-dropzone/accept.ts';
import FileDropzone from '../src/components/file-dropzone/FileDropzone.svelte';
import type { DropzoneFile } from '../src/components/file-dropzone/types.ts';

afterEach(() => cleanup());

function makeFile(
  name: string,
  options: { type?: string; size?: number; content?: string } = {}
): File {
  const { type = 'application/octet-stream', size, content = 'x' } = options;
  if (size !== undefined) {
    const buffer = new Uint8Array(size);
    return new File([buffer], name, { type });
  }
  return new File([content], name, { type });
}

function getInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('[data-file-dropzone-input]');
  if (!input) throw new Error('file input missing');
  return input;
}

async function pickFiles(files: File[]): Promise<void> {
  const input = getInput();
  await fireEvent.change(input, { target: { files } });
}

describe('matchesAccept / validateFiles', () => {
  it('matches extensions, exact types and wildcards', () => {
    expect(matchesAccept(makeFile('a.png', { type: 'image/png' }), 'image/*')).toBe(true);
    expect(matchesAccept(makeFile('a.png', { type: 'image/png' }), '.png,.jpg')).toBe(true);
    expect(matchesAccept(makeFile('a.txt', { type: 'text/plain' }), 'image/*')).toBe(false);
    expect(matchesAccept(makeFile('a.pdf', { type: 'application/pdf' }), 'application/pdf')).toBe(
      true
    );
    expect(matchesAccept(makeFile('a.bin'), undefined)).toBe(true);
  });

  it('rejects oversize files and enforces maxFiles', () => {
    const big = makeFile('big.bin', { size: 2048 });
    const small = makeFile('small.bin', { size: 100 });
    const result = validateFiles([big, small], { maxSize: 1024, maxFiles: 1 });
    expect(result.accepted.map((f) => f.name)).toEqual(['small.bin']);
    expect(result.rejects).toEqual([
      { name: 'big.bin', reason: `Larger than ${formatBytes(1024)}` },
    ]);

    const capped = validateFiles([small, makeFile('two.bin', { size: 10 })], {
      maxFiles: 1,
      currentCount: 0,
    });
    expect(capped.accepted).toHaveLength(1);
    expect(capped.rejects[0]?.reason).toMatch(/Only 1 file/);
  });

  it('formats byte sizes for messages', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');
  });
});

describe('FileDropzone', () => {
  it('adds files through the keyboard-reachable file input fallback', async () => {
    const onAdd = vi.fn();
    render(FileDropzone, {
      label: 'Attach documents',
      browseLabel: 'Browse files',
      onAdd,
    });

    const input = getInput();
    expect(input.type).toBe('file');
    expect(input.className).toContain('sr-only');
    // Label is associated for pointer and assistive tech.
    expect(document.querySelector(`label[for="${input.id}"]`)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Browse files' })).toBeTruthy();

    const file = makeFile('notes.txt', { type: 'text/plain', content: 'hello' });
    await pickFiles([file]);

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0]?.[0]?.[0]).toBe(file);
    expect(screen.getByText('notes.txt')).toBeTruthy();
    expect(screen.getByText('5 B')).toBeTruthy();
  });

  it('shows inline errors for accept and size limit violations', async () => {
    render(FileDropzone, {
      accept: 'image/*',
      maxSize: 100,
      label: 'Photos',
    });

    await pickFiles([
      makeFile('readme.txt', { type: 'text/plain', content: 'nope' }),
      makeFile('huge.png', { type: 'image/png', size: 500 }),
    ]);

    const errors = screen.getByRole('alert');
    expect(errors.textContent).toMatch(/readme\.txt/);
    expect(errors.textContent).toMatch(/Type not allowed/);
    expect(errors.textContent).toMatch(/huge\.png/);
    expect(errors.textContent).toMatch(/Larger than/);
    expect(
      screen.queryByText('readme.txt', { selector: '[data-file-dropzone-list] *' })
    ).toBeNull();
    expect(getInput().getAttribute('aria-invalid')).toBe('true');
  });

  it('enforces maxFiles and keeps earlier selections', async () => {
    render(FileDropzone, {
      maxFiles: 1,
      multiple: true,
      label: 'One file',
    });

    await pickFiles([makeFile('first.txt', { content: 'a' })]);
    expect(screen.getByText('first.txt')).toBeTruthy();

    await pickFiles([makeFile('second.txt', { content: 'b' })]);
    expect(screen.getByRole('alert').textContent).toMatch(/second\.txt/);
    expect(screen.getByRole('alert').textContent).toMatch(/Only 1 file/);
    const list = document.querySelector('[data-file-dropzone-list]') as HTMLElement;
    expect(within(list).getByText('first.txt')).toBeTruthy();
    expect(within(list).queryByText('second.txt')).toBeNull();
    expect(list.querySelectorAll('[data-file-id]')).toHaveLength(1);
  });

  it('creates image previews via object URLs and revokes them on remove', async () => {
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementation(() => 'blob:mock-preview');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    render(FileDropzone, {
      accept: 'image/*',
      label: 'Images',
    });

    await pickFiles([makeFile('shot.png', { type: 'image/png', content: 'img' })]);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const preview = document.querySelector<HTMLImageElement>('[data-file-preview]');
    expect(preview?.getAttribute('src')).toBe('blob:mock-preview');
    // Empty alt: the file name is already exposed as text.
    expect(preview?.getAttribute('alt')).toBe('');

    await fireEvent.click(screen.getByRole('button', { name: 'Remove shot.png' }));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-preview');
    expect(document.querySelector('[data-file-preview]')).toBeNull();
    expect(screen.queryByText('shot.png')).toBeNull();

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it('does not create object URLs for non-image files', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL');
    render(FileDropzone, { label: 'Docs' });
    await pickFiles([makeFile('doc.pdf', { type: 'application/pdf', content: '%PDF' })]);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(document.querySelector('[data-file-preview]')).toBeNull();
    createObjectURL.mockRestore();
  });

  it('shows per-file progress when progress is set on a DropzoneFile', async () => {
    const initial: DropzoneFile[] = [
      {
        id: 'existing',
        file: makeFile('upload.bin', { content: 'data' }),
        progress: 40,
        status: 'uploading',
      },
    ];
    render(FileDropzone, {
      files: initial,
      label: 'Uploads',
    });

    const row = document.querySelector('[data-file-id="existing"]') as HTMLElement;
    expect(row.getAttribute('data-file-status')).toBe('uploading');
    expect(
      within(row).getByRole('progressbar', { name: 'Upload progress for upload.bin' })
    ).toBeTruthy();
  });

  it('disables picking when disabled', async () => {
    const onAdd = vi.fn();
    render(FileDropzone, {
      disabled: true,
      onAdd,
      label: 'Locked',
    });
    expect(getInput().disabled).toBe(true);
    expect(document.querySelector('[data-file-dropzone]')?.getAttribute('data-disabled')).toBe(
      'true'
    );
    await pickFiles([makeFile('nope.txt', { content: 'x' })]);
    // Input is disabled for real users; ingest also no-ops when disabled.
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.queryByText('nope.txt')).toBeNull();
  });
});
