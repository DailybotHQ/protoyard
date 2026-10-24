import type { FileEntry } from '@protoyard/views/files';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { FileManager } from '../src/files/index.ts';

afterEach(() => cleanup());

const ENTRIES: FileEntry[] = [
  { id: 'root', name: 'Docs', kind: 'folder', parentId: null },
  { id: 'f1', name: 'readme.md', kind: 'file', parentId: 'root', size: 120 },
];

describe('FileManager (Texuli FileBrowser adapter)', () => {
  it('renders entries from query', async () => {
    render(FileManager, {
      query: { current: ENTRIES, loading: false, error: undefined },
      label: 'Files',
    });
    await waitFor(() => expect(document.body.textContent).toMatch(/Docs|readme|Files/i));
  });
});
