import type { DropzoneReject } from './types.ts';

/** Whether a file matches an HTML `accept` attribute value. */
export function matchesAccept(file: File, accept: string | undefined): boolean {
  if (!accept?.trim() || accept.trim() === '*/*') return true;
  const tokens = accept
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return true;

  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();

  return tokens.some((token) => {
    if (token.startsWith('.')) return name.endsWith(token);
    if (token.endsWith('/*')) {
      const prefix = token.slice(0, -1); // e.g. "image/"
      return type.startsWith(prefix);
    }
    return type === token;
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export interface ValidateFilesOptions {
  accept?: string;
  /** Maximum size per file in bytes. */
  maxSize?: number;
  /** Maximum number of files that may be kept (including already selected). */
  maxFiles?: number;
  /** How many files are already selected. */
  currentCount?: number;
  multiple?: boolean;
}

export interface ValidateFilesResult {
  accepted: File[];
  rejects: DropzoneReject[];
}

/**
 * Filter incoming File objects by accept, size and count limits.
 * Does not read file contents.
 */
export function validateFiles(
  incoming: Iterable<File>,
  options: ValidateFilesOptions = {}
): ValidateFilesResult {
  const {
    accept,
    maxSize,
    maxFiles = Number.POSITIVE_INFINITY,
    currentCount = 0,
    multiple = true,
  } = options;

  const accepted: File[] = [];
  const rejects: DropzoneReject[] = [];
  const room = multiple
    ? Math.max(0, maxFiles - currentCount)
    : currentCount > 0
      ? 0
      : Math.min(1, maxFiles);

  let slots = room;
  for (const file of incoming) {
    if (slots <= 0) {
      rejects.push({
        name: file.name,
        reason: multiple
          ? `Only ${maxFiles} file${maxFiles === 1 ? '' : 's'} allowed`
          : 'Only one file allowed',
      });
      continue;
    }
    if (!matchesAccept(file, accept)) {
      rejects.push({ name: file.name, reason: `Type not allowed (${accept})` });
      continue;
    }
    if (maxSize !== undefined && file.size > maxSize) {
      rejects.push({
        name: file.name,
        reason: `Larger than ${formatBytes(maxSize)}`,
      });
      continue;
    }
    accepted.push(file);
    slots -= 1;
  }

  return { accepted, rejects };
}
