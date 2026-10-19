import type { Component } from 'svelte';

/** Someone who comments or acts: a persona, usually. */
export interface ActivityPerson {
  id: string;
  name: string;
  /** `persona.avatar`: a URL or path is shown as is; resolve library ids (`av-001`) with `avatarSrc`. */
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
