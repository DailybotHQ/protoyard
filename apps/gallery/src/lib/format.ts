import type { Platform, RegistryEntry } from './types';

export const PLATFORM_LABEL: Record<Platform, string> = {
  desktop: 'Desktop',
  mobile: 'Mobile',
  responsive: 'Responsive',
};

export const STATUS_LABEL: Record<RegistryEntry['status'], string> = {
  draft: 'Draft',
  active: 'Active',
  ready: 'Ready',
  archived: 'Archived',
};

/** Initials fallback when a manifest declares no icon. */
export function monogram(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/);
  return ((words[0]?.[0] ?? '?') + (words[1]?.[0] ?? '')).toUpperCase();
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
