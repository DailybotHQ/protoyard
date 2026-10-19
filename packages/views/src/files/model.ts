/** One file or folder. `parentId: null` is the root. */
export interface FileEntry {
  id: string;
  parentId: string | null;
  name: string;
  kind: 'folder' | 'file';
  /** MIME type of a file (`image/png`). */
  type?: string;
  size?: number;
  updatedAt?: string;
  /** A stored blob exists (otherwise previews use the generated thumbnail). */
  hasBlob?: boolean;
}

export type FileCategory =
  | 'folder'
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'text'
  | 'archive'
  | 'other';

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** A folder's children: folders first, then by name (natural order: "File 2" before "File 10"). */
export function childrenOf<E extends FileEntry>(
  entries: readonly E[],
  folderId: string | null
): E[] {
  return entries
    .filter((e) => (e.parentId ?? null) === folderId)
    .sort((a, b) =>
      a.kind === b.kind ? collator.compare(a.name, b.name) : a.kind === 'folder' ? -1 : 1
    );
}

/** The folders from the root down to `folderId` (empty at the root). A broken chain stops early. */
export function breadcrumbs<E extends FileEntry>(
  entries: readonly E[],
  folderId: string | null
): E[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const path: E[] = [];
  const seen = new Set<string>();
  let current = folderId ? byId.get(folderId) : undefined;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

/** Every id inside `folderId` (not including it). */
export function descendantIds(entries: readonly FileEntry[], folderId: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const e of entries) {
    if (!e.parentId) continue;
    const list = children.get(e.parentId) ?? [];
    list.push(e.id);
    children.set(e.parentId, list);
  }
  const out = new Set<string>();
  const stack = [...(children.get(folderId) ?? [])];
  while (stack.length) {
    const id = stack.pop() as string;
    if (out.has(id)) continue;
    out.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return out;
}

/**
 * Why `ids` cannot move into `targetId` (null: they can). A folder cannot go
 * into itself or its own subfolders, and names must stay unique in the target.
 */
export function moveProblem(
  entries: readonly FileEntry[],
  ids: readonly string[],
  targetId: string | null
): string | null {
  const byId = new Map(entries.map((e) => [e.id, e]));
  if (targetId !== null && byId.get(targetId)?.kind !== 'folder') return 'Choose a folder';
  const moving = ids.map((id) => byId.get(id)).filter((e): e is FileEntry => e !== undefined);
  if (moving.length === 0) return 'Nothing to move';
  for (const e of moving) {
    if (
      e.kind === 'folder' &&
      targetId !== null &&
      (e.id === targetId || descendantIds(entries, e.id).has(targetId))
    ) {
      return `"${e.name}" cannot go inside itself`;
    }
  }
  if (moving.every((e) => (e.parentId ?? null) === targetId)) return 'Already in this folder';
  const staying = childrenOf(entries, targetId).filter((e) => !ids.includes(e.id));
  for (const e of moving) {
    if (staying.some((s) => s.name.toLowerCase() === e.name.toLowerCase())) {
      return `A "${e.name}" already exists there`;
    }
  }
  return null;
}

/** Why a name is not usable among `siblings` (null when it is). */
export function nameProblem(
  name: string,
  siblings: readonly FileEntry[],
  selfId?: string
): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Enter a name';
  if (trimmed.length > 255) return 'Keep names under 256 characters';
  if (/[/\\]/.test(trimmed)) return 'Names cannot contain / or \\';
  if (trimmed === '.' || trimmed === '..') return 'Choose another name';
  const lower = trimmed.toLowerCase();
  if (siblings.some((s) => s.id !== selfId && s.name.toLowerCase() === lower)) {
    return `"${trimmed}" already exists here`;
  }
  return null;
}

/** "Untitled folder", then "Untitled folder 2", 3… */
export function uniqueName(base: string, siblings: readonly FileEntry[]): string {
  const taken = new Set(siblings.map((s) => s.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/** The extension, uppercase, letters and digits only (`PDF`), or ''. */
export function extensionOf(name: string): string {
  const match = /\.([a-z0-9]{1,5})$/i.exec(name);
  return match ? (match[1] as string).toUpperCase() : '';
}

export function categoryOf(entry: Pick<FileEntry, 'kind' | 'type' | 'name'>): FileCategory {
  if (entry.kind === 'folder') return 'folder';
  const type = (entry.type ?? '').toLowerCase();
  const ext = extensionOf(entry.name);
  if (type.startsWith('image/') || /^(PNG|JPE?G|GIF|WEBP|SVG|AVIF)$/.test(ext)) return 'image';
  if (type.startsWith('video/') || /^(MP4|MOV|WEBM)$/.test(ext)) return 'video';
  if (type.startsWith('audio/') || /^(MP3|WAV|OGG|M4A)$/.test(ext)) return 'audio';
  if (type === 'application/pdf' || ext === 'PDF') return 'pdf';
  if (type.startsWith('text/') || /^(TXT|MD|CSV|JSON)$/.test(ext)) return 'text';
  if (/zip|tar|gzip|compressed/.test(type) || /^(ZIP|TAR|GZ|7Z|RAR)$/.test(ext)) return 'archive';
  return 'other';
}

/** "1.4 MB" (base 1024, one decimal above KB). */
export function formatSize(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}
