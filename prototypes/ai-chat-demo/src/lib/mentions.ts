/** @mention helpers for the composer (pure, so they are unit-tested). */

export interface MentionQuery {
  /** Index of the `@`. */
  start: number;
  /** Text typed after the `@` (may be empty). */
  query: string;
}

/** The mention being typed right before the caret, if any. */
export function activeMention(text: string, caret: number): MentionQuery | null {
  const before = text.slice(0, caret);
  const match = /(^|\s)@([a-z0-9_-]*)$/i.exec(before);
  if (!match) return null;
  const query = match[2] ?? '';
  return { start: caret - query.length - 1, query };
}

/** Replaces the active mention with `@handle ` and returns the new caret. */
export function applyMention(
  text: string,
  mention: MentionQuery,
  handle: string
): { text: string; caret: number } {
  const end = mention.start + 1 + mention.query.length;
  const insert = `@${handle} `;
  const rest = text.slice(end).replace(/^\s+/, '');
  return {
    text: text.slice(0, mention.start) + insert + rest,
    caret: mention.start + insert.length,
  };
}

/** Adds `@handle ` to a draft (helper chips), avoiding duplicates. */
export function addMention(text: string, handle: string): string {
  if (new RegExp(`(^|\\s)@${handle}\\b`, 'i').test(text)) return text;
  const trimmed = text.replace(/\s+$/, '');
  return trimmed ? `${trimmed} @${handle} ` : `@${handle} `;
}
