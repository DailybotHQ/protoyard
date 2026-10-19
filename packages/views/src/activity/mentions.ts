/**
 * Mentions and references are stored as ids (`@{persona-id}`, `#{record-id}`)
 * and turned into names only when shown, so renaming a persona or a record
 * updates every old comment.
 */

export type ActivitySegment =
  | { type: 'text'; text: string }
  | { type: 'mention'; id: string; label: string; missing: boolean }
  | { type: 'reference'; id: string; label: string; missing: boolean };

/** Display names for ids; return `undefined` for an id that no longer exists. */
export interface MentionLookups {
  person?: (id: string) => string | undefined;
  record?: (id: string) => string | undefined;
}

/** What the composer offers (the editor's `@`/`#` suggestions): its id and the text typed after the trigger. */
export interface MentionCandidate {
  id: string;
  value: string;
}

const TOKEN = /([@#])\{([^{}\s]{1,120})\}/g;

/** Splits a stored body into text, mention and reference segments. */
export function tokenize(body: string, lookups: MentionLookups = {}): ActivitySegment[] {
  const segments: ActivitySegment[] = [];
  let last = 0;
  for (const match of body.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ type: 'text', text: body.slice(last, index) });
    const id = match[2] as string;
    if (match[1] === '@') {
      const name = lookups.person?.(id);
      segments.push({
        type: 'mention',
        id,
        label: name ?? 'unknown person',
        missing: name === undefined,
      });
    } else {
      const label = lookups.record?.(id);
      segments.push({ type: 'reference', id, label: label ?? id, missing: label === undefined });
    }
    last = index + match[0].length;
  }
  if (last < body.length) segments.push({ type: 'text', text: body.slice(last) });
  return segments;
}

/** The body as plain text, with names: "Thanks @Marta Ruiz, see #Renewal". */
export function plainText(segments: readonly ActivitySegment[]): string {
  return segments
    .map((s) => (s.type === 'text' ? s.text : s.type === 'mention' ? `@${s.label}` : `#${s.label}`))
    .join('');
}

/** Persona ids mentioned in a stored body, once each, in order (for notifications). */
export function mentionedIds(body: string): string[] {
  const ids: string[] = [];
  for (const match of body.matchAll(TOKEN)) {
    if (match[1] === '@' && !ids.includes(match[2] as string)) ids.push(match[2] as string);
  }
  return ids;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceTyped(
  text: string,
  trigger: '@' | '#',
  candidates: readonly MentionCandidate[]
): string {
  const usable = candidates
    .filter((c) => c.value.length > 0)
    .sort((a, b) => b.value.length - a.value.length);
  if (usable.length === 0) return text;
  const byValue = new Map(usable.map((c) => [c.value.toLowerCase(), c.id]));
  const pattern = new RegExp(
    `(^|[^\\w@#])${escapeRegExp(trigger)}(${usable.map((c) => escapeRegExp(c.value)).join('|')})(?![\\w.-]*\\w)`,
    'gi'
  );
  return text.replace(pattern, (whole, before: string, value: string) => {
    const id = byValue.get(value.toLowerCase());
    return id ? `${before}${trigger}{${id}}` : whole;
  });
}

/**
 * Turns what the composer produced (`@marta.ruiz`, `#DEAL-42`) into stored
 * tokens. Text that matches no candidate stays as typed.
 */
export function encodeMentions(
  text: string,
  candidates: { mentions?: readonly MentionCandidate[]; references?: readonly MentionCandidate[] }
): string {
  return replaceTyped(
    replaceTyped(text, '@', candidates.mentions ?? []),
    '#',
    candidates.references ?? []
  );
}

/** The reverse, for editing a saved comment: tokens become `@value` again (unknown ids stay tokens). */
export function decodeMentions(
  body: string,
  candidates: { mentions?: readonly MentionCandidate[]; references?: readonly MentionCandidate[] }
): string {
  const people = new Map((candidates.mentions ?? []).map((c) => [c.id, c.value]));
  const records = new Map((candidates.references ?? []).map((c) => [c.id, c.value]));
  return body.replace(TOKEN, (whole, trigger: string, id: string) => {
    const value = (trigger === '@' ? people : records).get(id);
    return value ? `${trigger}${value}` : whole;
  });
}
