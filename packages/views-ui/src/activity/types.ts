import { type AvatarImage, avatarImage } from '@protoyard/renderer-svelte';
import type { Component } from 'svelte';

/** Someone who comments or acts: a persona, usually. */
export interface ActivityPerson {
  id: string;
  name: string;
  /** `persona.avatar`: a library id (`av-001`), an https URL or a root-relative path. Unsafe values show initials. */
  avatar?: string | null;
  /** Typed after `@` in the composer (default: the name, lowercased, dots for spaces). */
  handle?: string;
}

/** A record that `#` can reference. */
export interface ActivityRecord {
  id: string;
  label: string;
  /** Typed after `#` (default: the id). */
  value?: string;
}

/** Props the composer passes to a lazily loaded editor (`MarkdownEditor` from `@protoyard/views-ui/editor` fits). */
export interface ComposerEditorProps {
  value?: string;
  label: string;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  mentions?: readonly { id: string; value: string; label: string }[];
  references?: readonly { id: string; value: string; label: string }[];
}
export type EditorLoader = () => Promise<
  Component<ComposerEditorProps, Record<string, never>, 'value'>
>;

export function handleOf(person: ActivityPerson): string {
  return person.handle ?? person.name.toLowerCase().trim().replace(/\s+/g, '.');
}

/** A URL or root-relative path (what `<img src>` can show without a resolver). */
export function directAvatar(person: ActivityPerson | undefined): string | undefined {
  const avatar = person?.avatar;
  return avatar && /^(https:\/\/|\/)/.test(avatar) ? avatar : undefined;
}

/**
 * Image props for a person's `Avatar`: the `avatarSrc` override when one is
 * given (a custom resolver), else `persona.avatar` resolved and re-checked by
 * the renderer's `avatarImage` (library id → 64/128 px srcset).
 */
export function personImage(
  person: ActivityPerson | undefined,
  override?: (person: ActivityPerson) => string | null | undefined
): AvatarImage {
  if (!person) return {};
  if (override) {
    const src = override(person);
    return src ? { src } : {};
  }
  return avatarImage(person.avatar);
}
