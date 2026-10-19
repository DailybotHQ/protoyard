import { rankSequence } from '../board/rank.ts';
import {
  countFor,
  type ViewsCtx,
  type ViewsLevel,
  type ViewsPerson,
  viewsLevel,
  viewsRng,
} from './shared.ts';

export interface FileEntry {
  id: string;
  parentId: string | null;
  kind: 'folder' | 'file';
  name: string;
  /** Bytes (0 for folders). */
  sizeBytes: number;
  mimeType: string | null;
  ownerId: string | null;
  updatedAt: string;
  rank: string;
}

export interface FileTreeOptions {
  people?: readonly ViewsPerson[];
  level?: ViewsLevel;
}

const FOLDERS = [
  'Contracts',
  'Design',
  'Finance',
  'Marketing',
  'Research',
  'Templates',
  'Archive',
  'Photos',
];
const FILES: readonly [string, string, string, number, number][] = [
  ['Proposal', 'pdf', 'application/pdf', 80_000, 2_400_000],
  ['Budget', 'csv', 'text/csv', 2_000, 90_000],
  ['Kickoff notes', 'md', 'text/markdown', 800, 20_000],
  ['Storefront', 'png', 'image/png', 40_000, 3_000_000],
  ['Team photo', 'jpg', 'image/jpeg', 120_000, 5_000_000],
  ['Roadmap', 'pdf', 'application/pdf', 60_000, 1_200_000],
  ['Logo', 'svg', 'image/svg+xml', 1_500, 30_000],
];

/** Folders and files (fictional names, integer sizes, MIME types) with sibling ranks; every parent is listed first. */
export function generateFileTree(ctx: ViewsCtx, options: FileTreeOptions = {}): FileEntry[] {
  const level = viewsLevel(ctx, 'files', options.level);
  const count = countFor(level, [0, 40, 600, 20]);
  if (count === 0) return [];
  const rng = viewsRng(ctx, 'files');
  const people = options.people ?? [];
  const entries: FileEntry[] = [];
  const folders: FileEntry[] = [];
  const updated = (maxDays: number) =>
    ctx.time.iso(ctx.time.daysAgo(rng.int(0, maxDays), rng.int(0, 23)));
  const owner = () => (people.length ? (rng.pick(people) as ViewsPerson).id : null);

  const folderCount = Math.max(2, Math.round(count / 6));
  for (let i = 0; i < folderCount; i++) {
    const parent =
      i < 3 || folders.length === 0 || rng.chance(0.5) ? null : (rng.pick(folders) as FileEntry);
    const folder: FileEntry = {
      id: ctx.ids.next('folder'),
      parentId: parent?.id ?? null,
      kind: 'folder',
      name: `${FOLDERS[i % FOLDERS.length]}${i >= FOLDERS.length ? ` ${Math.floor(i / FOLDERS.length) + 1}` : ''}`,
      sizeBytes: 0,
      mimeType: null,
      ownerId: owner(),
      updatedAt: updated(90),
      rank: '',
    };
    folders.push(folder);
    entries.push(folder);
  }
  for (let i = folderCount; i < count; i++) {
    const [base, ext, mime, min, max] = rng.pick(FILES);
    entries.push({
      id: ctx.ids.next('file'),
      parentId: rng.chance(0.15) ? null : (rng.pick(folders) as FileEntry).id,
      kind: 'file',
      name: `${base} ${rng.int(1, 99)}.${ext}`,
      sizeBytes: rng.int(min, max),
      mimeType: mime,
      ownerId: owner(),
      updatedAt: updated(60),
      rank: '',
    });
  }
  if (level === 'edge') {
    const empty: FileEntry = {
      ...(folders[0] as FileEntry),
      id: ctx.ids.next('folder'),
      parentId: null,
      name: 'Empty folder',
      updatedAt: updated(5),
    };
    entries.push(empty);
    entries.push({
      id: ctx.ids.next('file'),
      parentId: null,
      kind: 'file',
      name: 'empty.txt',
      sizeBytes: 0,
      mimeType: 'text/plain',
      ownerId: null,
      updatedAt: updated(1),
      rank: '',
    });
    entries.push({
      id: ctx.ids.next('file'),
      parentId: null,
      kind: 'file',
      name: 'Résumé — café menu (final, v2) 📄.pdf',
      sizeBytes: 123_456,
      mimeType: 'application/pdf',
      ownerId: owner(),
      updatedAt: updated(3),
      rank: '',
    });
    entries.push({
      id: ctx.ids.next('file'),
      parentId: null,
      kind: 'file',
      name: `${'very-long-file-name-'.repeat(10)}end.md`,
      sizeBytes: 4_096,
      mimeType: 'text/markdown',
      ownerId: owner(),
      updatedAt: updated(2),
      rank: '',
    });
  }
  // Ranks per parent, folders first, then files by name.
  const byParent = new Map<string | null, FileEntry[]>();
  for (const entry of entries) {
    const list = byParent.get(entry.parentId) ?? [];
    list.push(entry);
    byParent.set(entry.parentId, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) =>
      a.kind === b.kind
        ? a.name < b.name
          ? -1
          : a.name > b.name
            ? 1
            : 0
        : a.kind === 'folder'
          ? -1
          : 1
    );
    const ranks = rankSequence(list.length);
    list.forEach((entry, i) => {
      entry.rank = ranks[i] as string;
    });
  }
  return entries;
}
