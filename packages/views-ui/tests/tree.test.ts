import { rankSequence } from '@protoyard/views/board';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OutlineEditor, TreeView } from '../src/tree/index.ts';

afterEach(() => cleanup());

interface Node {
  id: string;
  parentId: string | null;
  rank: string;
  title: string;
}

const [a, b] = rankSequence(2) as [string, string];
const NODES: Node[] = [
  { id: 'docs', parentId: null, rank: a, title: 'Docs' },
  { id: 'intro', parentId: 'docs', rank: a, title: 'Intro' },
  { id: 'changelog', parentId: null, rank: b, title: 'Changelog' },
];

describe('TreeView (Texuli TreeDataView adapter)', () => {
  it('renders nodes from query', async () => {
    render(TreeView<Node>, {
      query: { current: NODES, loading: false, error: undefined },
      getId: (n) => n.id,
      getParentId: (n) => n.parentId,
      getRank: (n) => n.rank,
      getLabel: (n) => n.title,
    });
    await waitFor(() => expect(screen.getByText('Docs')).toBeTruthy());
  });
});

describe('OutlineEditor', () => {
  it('lists every item with its title', async () => {
    render(OutlineEditor<Node>, {
      query: { current: NODES, loading: false, error: undefined },
      getId: (n) => n.id,
      getParentId: (n) => n.parentId,
      getRank: (n) => n.rank,
      getTitle: (n) => n.title,
      onCreate: vi.fn(async () => 'new'),
      onRename: vi.fn(async () => {}),
      onMove: vi.fn(async () => {}),
      onDelete: vi.fn(async () => {}),
    });
    await waitFor(() => expect(screen.getByDisplayValue('Docs')).toBeTruthy());
  });
});
