import type { FileEntry } from '@protoyard/views/files';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clipPreviewText,
  FilePreview,
  MAX_PREVIEW_TEXT,
  previewKind,
  safePreviewSrc,
} from '../src/files/index.ts';

afterEach(() => cleanup());

const FILES: FileEntry[] = [
  { id: 'd1', parentId: null, name: 'Archive', kind: 'folder' },
  { id: 'f1', parentId: null, name: 'harbor.png', kind: 'file', type: 'image/png', size: 2048 },
  { id: 'f2', parentId: null, name: 'notes.txt', kind: 'file', type: 'text/plain', size: 120 },
  { id: 'f3', parentId: null, name: 'invoice.pdf', kind: 'file', type: 'application/pdf' },
  { id: 'f4', parentId: null, name: 'backup.zip', kind: 'file', type: 'application/zip' },
];

const TEXT: Record<string, string> = {
  f2: 'Pier 4 opens at 6:00.\n<b>not bold</b>',
};

function preview(props: Record<string, unknown> = {}) {
  return render(FilePreview<FileEntry>, {
    entries: FILES,
    getSrc: (entry: FileEntry) =>
      entry.id === 'f1'
        ? '/files/harbor.png'
        : entry.id === 'f3'
          ? '/files/invoice.pdf'
          : undefined,
    getText: (entry: FileEntry) => TEXT[entry.id],
    ...props,
  });
}

const dialog = () => screen.findByRole('dialog');

describe('preview helpers', () => {
  it('maps files to a preview kind by type and extension', () => {
    expect(previewKind({ kind: 'file', name: 'a.PNG' })).toBe('image');
    expect(previewKind({ kind: 'file', name: 'a', type: 'application/pdf' })).toBe('pdf');
    expect(previewKind({ kind: 'file', name: 'readme.md' })).toBe('text');
    expect(previewKind({ kind: 'file', name: 'clip.mp4' })).toBe('video');
    expect(previewKind({ kind: 'file', name: 'memo.mp3' })).toBe('audio');
    expect(previewKind({ kind: 'file', name: 'backup.zip' })).toBe('other');
    expect(previewKind({ kind: 'folder', name: 'Docs' })).toBe('other');
  });

  it('only lets safe URLs reach src', () => {
    expect(safePreviewSrc('/files/a.png', 'image')).toBe('/files/a.png');
    expect(safePreviewSrc('https://cdn.example.com/a.pdf', 'pdf')).toBe(
      'https://cdn.example.com/a.pdf'
    );
    expect(safePreviewSrc('blob:https://app.example.com/1', 'video')).toBe(
      'blob:https://app.example.com/1'
    );
    expect(safePreviewSrc('data:image/png;base64,iVBORw0KGgo=', 'image')).toBe(
      'data:image/png;base64,iVBORw0KGgo='
    );
    expect(safePreviewSrc('data:image/png;base64,iVBORw0KGgo=', 'pdf')).toBeUndefined();
    expect(safePreviewSrc('data:text/html,<script>x</script>', 'image')).toBeUndefined();
    expect(safePreviewSrc('java\nscript:alert(1)', 'pdf')).toBeUndefined();
    expect(safePreviewSrc('//evil.example.com/a.png', 'image')).toBeUndefined();
    expect(safePreviewSrc(undefined, 'image')).toBeUndefined();
  });

  it('clips long text', () => {
    const clipped = clipPreviewText('x'.repeat(MAX_PREVIEW_TEXT + 5));
    expect(clipped.text.length).toBe(MAX_PREVIEW_TEXT);
    expect(clipped.omitted).toBe(5);
  });
});

describe('FilePreview (D-G-043)', () => {
  it('lists files only, as buttons that open a dialog', () => {
    preview();
    const items = document.querySelectorAll('[data-file-preview-item]');
    expect(items.length).toBe(4);
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
    expect(screen.getByRole('button', { name: 'harbor.png' }).getAttribute('aria-haspopup')).toBe(
      'dialog'
    );
  });

  it('opens an image in the lightbox with its alt text and details', async () => {
    const onCurrentChange = vi.fn();
    preview({ onCurrentChange });
    await fireEvent.click(screen.getByRole('button', { name: 'harbor.png' }));
    const box = await dialog();
    expect(onCurrentChange).toHaveBeenCalledWith('f1');
    const image = box.querySelector('img[alt="harbor.png"]') as HTMLImageElement;
    expect(image.getAttribute('src')).toBe('/files/harbor.png');
    expect(box.textContent).toContain('2.0 KB');
    expect(box.textContent).toContain('1 of 4');
  });

  it('renders text files as text, never markup', async () => {
    preview({ current: 'f2' });
    const box = await dialog();
    const pre = await waitFor(() => {
      const found = box.querySelector('pre');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(pre.textContent).toContain('<b>not bold</b>');
    expect(pre.querySelector('b')).toBeNull();
  });

  it('reads text from getBlob when getText is absent', async () => {
    const getBlob = vi.fn(async () => new Blob(['From the blob']));
    preview({ current: 'f2', getText: undefined, getBlob });
    const box = await dialog();
    await waitFor(() => expect(box.querySelector('pre')?.textContent).toBe('From the blob'));
  });

  it('embeds a PDF with a fallback link, and shows details for other files', async () => {
    preview({ current: 'f3' });
    const box = await dialog();
    const pdf = box.querySelector('object[type="application/pdf"]') as HTMLObjectElement;
    expect(pdf.getAttribute('data')).toBe('/files/invoice.pdf');
    expect(box.querySelector('a')?.getAttribute('rel')).toBe('noopener noreferrer');
    await fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    await waitFor(() => expect(box.textContent).toContain('No preview for this file type.'));
  });

  it('steps with Previous / Next and the arrow keys, and stops at the ends', async () => {
    preview({ current: 'f1' });
    const box = await dialog();
    const previous = screen.getByRole('button', { name: /Previous/ }) as HTMLButtonElement;
    expect(previous.disabled).toBe(true);
    await fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    await waitFor(() => expect(box.textContent).toContain('2 of 4'));
    const stage = box.querySelector('[data-file-lightbox]') as HTMLElement;
    await fireEvent.keyDown(stage, { key: 'ArrowRight' });
    await waitFor(() => expect(box.textContent).toContain('3 of 4'));
    await fireEvent.keyDown(stage, { key: 'ArrowRight' });
    await fireEvent.keyDown(stage, { key: 'ArrowRight' });
    await waitFor(() => expect(box.textContent).toContain('4 of 4'));
    expect((screen.getByRole('button', { name: /Next/ }) as HTMLButtonElement).disabled).toBe(true);
    await fireEvent.keyDown(stage, { key: 'ArrowLeft' });
    await waitFor(() => expect(box.textContent).toContain('3 of 4'));
  });

  it('closes on Escape and returns focus to the thumbnail of the file shown', async () => {
    const onCurrentChange = vi.fn();
    preview({ onCurrentChange });
    const thumb = screen.getByRole('button', { name: 'harbor.png' });
    thumb.focus();
    await fireEvent.click(thumb);
    const box = await dialog();
    await fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    await waitFor(() => expect(box.textContent).toContain('2 of 4'));
    await fireEvent.keyDown(document.activeElement ?? box, { key: 'Escape' });
    await waitFor(() => expect(onCurrentChange).toHaveBeenLastCalledWith(null));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'notes.txt' }))
    );
  });

  it('says so when there is nothing to preview', () => {
    render(FilePreview<FileEntry>, { entries: [FILES[0] as FileEntry] });
    expect(screen.getByText('No files to preview.')).toBeTruthy();
  });
});
