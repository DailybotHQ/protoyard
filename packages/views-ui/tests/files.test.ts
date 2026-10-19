import {
  breadcrumbs,
  categoryOf,
  childrenOf,
  type FileEntry,
  formatSize,
  moveProblem,
  nameProblem,
  thumbnailSvg,
  thumbnailUrl,
  uniqueName,
} from '@protoyard/views/files';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileManager } from '../src/files/index.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const folder = (id: string, name: string, parentId: string | null = null): FileEntry => ({
  id,
  parentId,
  name,
  kind: 'folder',
});
const file = (
  id: string,
  name: string,
  parentId: string | null,
  extra: Partial<FileEntry> = {}
): FileEntry => ({
  id,
  parentId,
  name,
  kind: 'file',
  size: 2048,
  ...extra,
});
const ENTRIES: FileEntry[] = [
  file('readme', 'readme.md', null, { type: 'text/markdown' }),
  folder('f-photos', 'Photos'),
  folder('f-docs', 'Docs'),
  folder('f-2026', '2026', 'f-photos'),
  file('report', 'Report.pdf', 'f-docs', { type: 'application/pdf', size: 1_500_000 }),
  file('n10', 'Notes 10.txt', 'f-docs'),
  file('n2', 'Notes 2.txt', 'f-docs'),
  file('beach', 'beach.png', 'f-photos', { type: 'image/png', hasBlob: true }),
  file('sunset', 'sunset.jpg', 'f-photos', { type: 'image/jpeg' }),
];

describe('files engine', () => {
  it('lists folders first in natural order and builds breadcrumbs', () => {
    expect(childrenOf(ENTRIES, null).map((e) => e.name)).toEqual(['Docs', 'Photos', 'readme.md']);
    expect(childrenOf(ENTRIES, 'f-docs').map((e) => e.name)).toEqual([
      'Notes 2.txt',
      'Notes 10.txt',
      'Report.pdf',
    ]);
    expect(breadcrumbs(ENTRIES, 'f-2026').map((e) => e.name)).toEqual(['Photos', '2026']);
    expect(breadcrumbs(ENTRIES, null)).toEqual([]);
    // A cycle in bad data stops instead of looping.
    const loop = [folder('a', 'A', 'b'), folder('b', 'B', 'a')];
    expect(breadcrumbs(loop, 'a').map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('checks names and moves', () => {
    const root = childrenOf(ENTRIES, null);
    expect(nameProblem('  ', root)).toBe('Enter a name');
    expect(nameProblem('docs', root)).toBe('"docs" already exists here');
    expect(nameProblem('Docs', root, 'f-docs')).toBeNull(); // itself
    expect(nameProblem('a/b', root)).toBe('Names cannot contain / or \\');
    expect(nameProblem('x'.repeat(256), root)).toBe('Keep names under 256 characters');
    expect(uniqueName('Docs', root)).toBe('Docs 2');
    expect(uniqueName('Untitled folder', root)).toBe('Untitled folder');
    expect(moveProblem(ENTRIES, ['f-photos'], 'f-2026')).toBe('"Photos" cannot go inside itself');
    expect(moveProblem(ENTRIES, ['f-photos'], 'f-photos')).toBe('"Photos" cannot go inside itself');
    expect(moveProblem(ENTRIES, ['readme'], null)).toBe('Already in this folder');
    expect(moveProblem(ENTRIES, ['readme'], 'report')).toBe('Choose a folder');
    expect(moveProblem([...ENTRIES, file('r2', 'README.md', 'f-docs')], ['readme'], 'f-docs')).toBe(
      'A "readme.md" already exists there'
    );
    expect(moveProblem(ENTRIES, ['readme', 'f-docs'], 'f-photos')).toBeNull();
  });

  it('classifies files and formats sizes', () => {
    expect(categoryOf({ kind: 'file', name: 'a.PNG' })).toBe('image');
    expect(categoryOf({ kind: 'file', name: 'x', type: 'application/pdf' })).toBe('pdf');
    expect(categoryOf({ kind: 'file', name: 'b.zip' })).toBe('archive');
    expect(categoryOf({ kind: 'folder', name: 'a.png' })).toBe('folder');
    expect(categoryOf({ kind: 'file', name: 'blob' })).toBe('other');
    expect([
      formatSize(512),
      formatSize(2048),
      formatSize(1_500_000),
      formatSize(undefined),
    ]).toEqual(['512 B', '2.0 KB', '1.4 MB', '']);
  });

  it('draws the same thumbnail for the same id, offline and safely', () => {
    const a = thumbnailSvg({ id: 'beach', kind: 'file', name: 'beach.png' });
    expect(thumbnailSvg({ id: 'beach', kind: 'file', name: 'beach.png' })).toBe(a);
    expect(thumbnailSvg({ id: 'beach-2', kind: 'file', name: 'beach.png' })).not.toBe(a);
    expect(thumbnailSvg({ id: 'beach', kind: 'file', name: 'beach.png' }, { hue: 200 })).toContain(
      'hsl(200 '
    );
    expect(a).not.toMatch(/https?:\/\/(?!www\.w3\.org)/); // no network
    // Only the sanitized extension is ever written as text.
    const hostile = thumbnailSvg({ id: 'x', kind: 'file', name: '<script>alert(1)</script>.pdf' });
    expect(hostile).toContain('>PDF</text>');
    expect(hostile).not.toContain('<script');
    expect(thumbnailUrl({ id: 'x', kind: 'folder', name: 'A' })).toMatch(/^data:image\/svg\+xml/);
  });
});

function manager(props: Record<string, unknown> = {}, entries = ENTRIES) {
  const handlers = {
    onCreateFolder: vi.fn(async (_parentId: string | null, _name: string) => {}),
    onRename: vi.fn(async (_entry: FileEntry, _name: string) => {}),
    onMove: vi.fn(async (_entries: FileEntry[], _target: string | null) => {}),
    onDelete: vi.fn(async (_entries: FileEntry[]) => {}),
    onUpload: vi.fn(async (_files: File[], _folder: string | null) => {}),
  };
  const result = render(FileManager<FileEntry>, {
    query: { current: entries, loading: false, error: undefined },
    ...handlers,
    ...props,
  });
  return { ...handlers, ...result };
}
const box = () => screen.getByRole('listbox');
const names = () =>
  within(box())
    .getAllByRole('option')
    .map((o) => o.getAttribute('aria-label')?.split(',')[0]);
const option = (name: string) =>
  within(box()).getByRole('option', { name: new RegExp(`^${name.replace('.', '\\.')},`) });
const press = (key: string, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(document.activeElement as Element, { key, ...init });
const live = () => document.querySelector('[data-files-live]')?.textContent ?? '';

describe('FileManager', () => {
  it('navigates folders with double-click, Enter, breadcrumbs and the tree', async () => {
    manager();
    expect(names()).toEqual(['Docs', 'Photos', 'readme.md']);
    await fireEvent.dblClick(option('Docs'));
    await waitFor(() => expect(names()).toEqual(['Notes 2.txt', 'Notes 10.txt', 'Report.pdf']));
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByText('Docs').getAttribute('aria-current')).toBe('page');
    await fireEvent.click(within(crumbs).getByRole('button', { name: 'Home' }));
    await waitFor(() => expect(names()).toEqual(['Docs', 'Photos', 'readme.md']));
    option('Photos').focus();
    await press('Enter');
    await waitFor(() => expect(names()).toEqual(['2026', 'beach.png', 'sunset.jpg']));
    expect(box().getAttribute('aria-label')).toBe('Photos, 3 items');
    // The folder tree opens down to the current folder and navigates too.
    const tree = screen.getByRole('tree', { name: 'Folders' });
    expect(within(tree).getByRole('treeitem', { name: /^2026/ })).toBeTruthy();
    await fireEvent.click(within(tree).getByRole('treeitem', { name: /^Docs/ }));
    await waitFor(() => expect(names()[0]).toBe('Notes 2.txt'));
  });

  it('moves focus and selection with the keyboard (roving tabindex)', async () => {
    manager({ view: 'list' });
    option('Docs').focus();
    await press('ArrowDown');
    await waitFor(() => expect(document.activeElement).toBe(option('Photos')));
    expect(option('Photos').getAttribute('tabindex')).toBe('0');
    expect(option('Docs').getAttribute('tabindex')).toBe('-1');
    expect(option('Photos').getAttribute('aria-selected')).toBe('true');
    await press('ArrowDown', { shiftKey: true });
    await waitFor(() => expect(document.activeElement).toBe(option('readme.md')));
    expect(screen.getByText('2 selected')).toBeTruthy();
    await press('Home');
    await waitFor(() => expect(document.activeElement).toBe(option('Docs')));
    await press('a', { ctrlKey: true });
    await waitFor(() => expect(screen.getByText('3 selected')).toBeTruthy());
    await press('Escape');
    await waitFor(() => expect(screen.queryByText(/selected$/)).toBeNull());
    // Space toggles; "Select multiple" makes clicks toggle (touch).
    await press(' ');
    await waitFor(() => expect(option('Docs').getAttribute('aria-selected')).toBe('true'));
    await fireEvent.click(screen.getByRole('button', { name: 'Select multiple' }));
    await fireEvent.click(option('readme.md'));
    await waitFor(() => expect(screen.getByText('2 selected')).toBeTruthy());
  });

  it('renames with F2, shows pending, and rolls back with the reason', async () => {
    let fail: (error: unknown) => void = () => {};
    const onRename = vi.fn(
      (_entry: FileEntry, _name: string) =>
        new Promise<void>((_, reject) => {
          fail = reject;
        })
    );
    manager({ onRename });
    option('readme.md').focus();
    await press('F2');
    const input = (await screen.findByLabelText('Rename readme.md')) as HTMLInputElement;
    expect(input.value).toBe('readme.md');
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 6]); // name without .md
    // A duplicate is caught before any service call.
    await fireEvent.input(input, { target: { value: 'docs' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('alert').textContent).toBe('"docs" already exists here');
    expect(onRename).not.toHaveBeenCalled();
    await fireEvent.input(input, { target: { value: 'guide.md' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRename).toHaveBeenCalledWith(ENTRIES[0], 'guide.md');
    await waitFor(() => expect(option('guide.md').getAttribute('aria-busy')).toBe('true'));
    expect(within(option('guide.md')).getByText('Saving')).toBeTruthy();
    fail(Object.assign(new Error('Invalid'), { issues: { name: 'Name is reserved' } }));
    await waitFor(() => expect(names()).toContain('readme.md'));
    expect(option('readme.md').getAttribute('aria-busy')).toBeNull();
    expect(live()).toBe('Not renamed: Name is reserved');
  });

  it('cancels a rename with Escape', async () => {
    const { onRename } = manager();
    option('readme.md').focus();
    await press('F2');
    const input = await screen.findByLabelText('Rename readme.md');
    await fireEvent.input(input, { target: { value: 'other.md' } });
    await fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByLabelText('Rename readme.md')).toBeNull());
    expect(onRename).not.toHaveBeenCalled();
    expect(names()).toContain('readme.md');
  });

  it('moves the selection, hiding it at once and restoring it when the move fails', async () => {
    let fail: (error: unknown) => void = () => {};
    const onMove = vi.fn(
      (_entries: FileEntry[], _target: string | null) =>
        new Promise<void>((_, reject) => {
          fail = reject;
        })
    );
    manager({ onMove });
    await fireEvent.click(option('readme.md'));
    await fireEvent.click(screen.getByRole('button', { name: 'Move to…' }));
    const target = await screen.findByLabelText('Destination');
    // A folder cannot go into itself: Photos and 2026 are disabled when moving Photos (checked below).
    await fireEvent.change(target, { target: { value: 'f-docs' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    expect(onMove).toHaveBeenCalledWith([ENTRIES[0]], 'f-docs');
    await waitFor(() => expect(names()).toEqual(['Docs', 'Photos']));
    fail(new Error('Storage is full'));
    await waitFor(() => expect(names()).toEqual(['Docs', 'Photos', 'readme.md']));
    expect(live()).toBe('Not moved: Storage is full');

    await fireEvent.click(option('Photos'));
    await fireEvent.click(screen.getByRole('button', { name: 'Move to…' }));
    const again = await screen.findByLabelText('Destination');
    const disabled = [...(again as HTMLSelectElement).options]
      .filter((o) => o.disabled)
      .map((o) => o.text);
    expect(disabled).toEqual(['Photos', 'Photos / 2026']);
    // Moving to where it already is says so instead of calling the service.
    await fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    expect(screen.getByRole('alert').textContent).toBe('Already in this folder');
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it('deletes with the Delete key after confirming', async () => {
    const { onDelete } = manager();
    option('readme.md').focus();
    await fireEvent.click(option('readme.md'));
    await press('Delete');
    expect(await screen.findByText('Delete "readme.md"?')).toBeTruthy();
    await fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' })
    );
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith([ENTRIES[0]]));
  });

  it('creates a folder with a unique default name, and uploads into the open folder', async () => {
    const { onCreateFolder, onUpload } = manager({}, [...ENTRIES, folder('u1', 'Untitled folder')]);
    await fireEvent.click(screen.getByRole('button', { name: 'New folder' }));
    const field = screen.getByLabelText('Folder name') as HTMLInputElement;
    expect(field.value).toBe('Untitled folder 2');
    await fireEvent.click(screen.getByRole('button', { name: 'Create folder' }));
    await waitFor(() => expect(onCreateFolder).toHaveBeenCalledWith(null, 'Untitled folder 2'));
    await waitFor(() => expect(screen.queryByLabelText('Folder name')).toBeNull());

    await fireEvent.dblClick(option('Docs'));
    await fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    const upload = new File(['hello'], 'hello.txt', { type: 'text/plain' });
    const input = document.querySelector<HTMLInputElement>(
      '[data-file-dropzone-input]'
    ) as HTMLInputElement;
    await fireEvent.change(input, { target: { files: [upload] } });
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith([upload], 'f-docs'));
  });

  it('previews files in a keyboard lightbox, with blob URLs revoked on destroy', async () => {
    const create = vi.fn((_blob: Blob) => 'blob:test/beach');
    const revoke = vi.fn((_url: string) => {});
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    const getBlob = vi.fn(async (_entry: FileEntry) => new Blob(['png'], { type: 'image/png' }));
    const { unmount } = manager({ getBlob, folder: 'f-photos' });
    await waitFor(() =>
      expect(option('beach.png').querySelector('img')?.getAttribute('src')).toBe('blob:test/beach')
    );
    expect(getBlob).toHaveBeenCalledTimes(1); // only the image with a stored blob
    expect(option('sunset.jpg').querySelector('img')?.getAttribute('src')).toMatch(
      /^data:image\/svg/
    );

    option('beach.png').focus();
    await press('Enter');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('1 of 2')).toBeTruthy();
    expect(within(dialog).getByRole('img', { name: 'beach.png' }).getAttribute('src')).toBe(
      'blob:test/beach'
    );
    await fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    await waitFor(() => expect(within(dialog).getByText('2 of 2')).toBeTruthy());
    expect(within(dialog).getByRole('img', { name: 'sunset.jpg' }).getAttribute('src')).toMatch(
      /^data:image\/svg/
    );
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Next file' }));
    await waitFor(() => expect(within(dialog).getByText('1 of 2')).toBeTruthy());
    unmount();
    expect(revoke).toHaveBeenCalledWith('blob:test/beach');
    vi.unstubAllGlobals();
  });

  it('shows an empty folder and the list layout', async () => {
    manager({ folder: 'f-2026' });
    expect(screen.getByText('This folder is empty.')).toBeTruthy();
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    await fireEvent.click(within(crumbs).getByRole('button', { name: 'Home' }));
    await fireEvent.click(screen.getByRole('button', { name: 'List' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'List' }).getAttribute('aria-pressed')).toBe('true')
    );
    expect(option('readme.md').textContent).toContain('2.0 KB');
  });
});
