<script lang="ts">
import { FileManager } from '@protoyard/views-ui/files';

type Entry = {
  id: string;
  parentId: string | null;
  name: string;
  kind: 'folder' | 'file';
  type?: string;
  size?: number;
  updatedAt?: string;
};
let entries = $state<Entry[]>([
  { id: 'design', parentId: null, name: 'Design', kind: 'folder' },
  {
    id: 'docs',
    parentId: null,
    name: 'Project brief.md',
    kind: 'file',
    type: 'text/markdown',
    size: 2048,
    updatedAt: '2026-10-19T10:00:00.000Z',
  },
  {
    id: 'logo',
    parentId: 'design',
    name: 'Brand mark.svg',
    kind: 'file',
    type: 'image/svg+xml',
    size: 4096,
    updatedAt: '2026-10-18T10:00:00.000Z',
  },
]);
const query = $derived({ current: entries, loading: false, error: null });
async function createFolder(parentId: string | null, name: string) {
  await Promise.resolve();
  entries = [...entries, { id: `folder-${entries.length}`, parentId, name, kind: 'folder' }];
}
async function rename(entry: Entry, name: string) {
  await Promise.resolve();
  entries = entries.map((file) => (file.id === entry.id ? { ...file, name } : file));
}
async function remove(selected: Entry[]) {
  await Promise.resolve();
  const ids = new Set(selected.map((entry) => entry.id));
  entries = entries.filter((entry) => !ids.has(entry.id));
}
async function move(selected: Entry[], parentId: string | null) {
  await Promise.resolve();
  const ids = new Set(selected.map((entry) => entry.id));
  entries = entries.map((entry) => (ids.has(entry.id) ? { ...entry, parentId } : entry));
}
async function upload(files: File[], parentId: string | null) {
  await Promise.resolve();
  entries = [
    ...entries,
    ...files.map((file, index) => ({
      id: `upload-${entries.length + index}`,
      parentId,
      name: file.name,
      kind: 'file' as const,
      type: file.type,
      size: file.size,
    })),
  ];
}
</script>
<FileManager {query} onCreateFolder={createFolder} onRename={rename} onDelete={remove} onMove={move} onUpload={upload} accept="image/*,.pdf,.md" maxSize={5_000_000} />
