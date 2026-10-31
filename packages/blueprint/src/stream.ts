import type { AnyBlueprint } from './kinds/envelope.ts';
import { isContentKind } from './kinds/kind.ts';
import { DEFAULT_UNTRUSTED_DOCUMENT_LIMITS, type UntrustedDocumentLimits } from './kinds/limits.ts';
import { loadUntrustedDocument } from './untrusted.ts';

/**
 * Progressive painting of a streamed blueprint: while an agent is still
 * writing a deck, page or doc blueprint (its file grows, or a tool streams
 * it), the text on hand is usually truncated JSON. This module finds the
 * largest part of it that is already a valid blueprint, so a player can paint
 * the slides, sections or doc blocks that have arrived instead of waiting for
 * the last byte.
 *
 * It never guesses content. A candidate is the text up to the end of a value
 * that already closed, with the containers still open closed after it; the
 * deepest candidate is tried first, then each shallower one (dropping the
 * member that is still arriving), and the first one the ordinary untrusted
 * loader accepts wins. The loader applies every limit and schema check, so a
 * partial blueprint is held to exactly the rules of a complete one.
 *
 * Only content kinds paint partially. An app's entities shape its database,
 * so half an app would open (and migrate) worlds that the finished blueprint
 * then drops: an app paints only once its JSON is complete and valid.
 *
 * Linear in the text, no recursion; the depth and the number of candidates
 * validated are capped.
 */

/** Containers deeper than this stop the scan (the loader's own depth cap is lower). */
const MAX_STREAM_DEPTH = 128;
/** Candidates validated per text, deepest first. */
export const MAX_STREAM_CANDIDATES = 12;

export interface StreamedBlueprint {
  blueprint: AnyBlueprint;
  /** `true` when the text was the whole blueprint; `false` for the part that has arrived. */
  complete: boolean;
  /** The JSON text that validated: the whole text, or the candidate cut from it. */
  json: string;
}

interface Open {
  kind: 'object' | 'array';
  /** Offset just after the last complete member (or the opening bracket). */
  cut: number;
  /** Object only: a `:` was read, so the next value is a member's value (not a key). */
  awaitingValue: boolean;
}

/**
 * Candidate JSON texts for a truncated JSON document, deepest first: each is
 * the prefix up to the last complete member of one open container, with the
 * open containers closed. Empty when the text is not truncated JSON (a
 * mismatched bracket, or nothing open). A complete document yields nothing:
 * parse it directly.
 */
export function truncatedJsonCandidates(text: string): string[] {
  const stack: Open[] = [];
  let inString = false;
  let escaped = false;
  let stringIsKey = false;
  let scalar = false;

  const completeValue = (end: number) => {
    const top = stack[stack.length - 1];
    if (!top) return;
    if (top.kind === 'array') top.cut = end;
    else if (top.awaitingValue) {
      top.cut = end;
      top.awaitingValue = false;
    }
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') {
        inString = false;
        if (!stringIsKey) completeValue(i + 1);
      }
      continue;
    }
    if (scalar) {
      if (
        ch === ',' ||
        ch === '}' ||
        ch === ']' ||
        ch === ' ' ||
        ch === '\n' ||
        ch === '\r' ||
        ch === '\t'
      ) {
        scalar = false;
        completeValue(i);
      } else continue;
    }
    switch (ch) {
      case '"': {
        const top = stack[stack.length - 1];
        inString = true;
        stringIsKey = top?.kind === 'object' && !top.awaitingValue;
        break;
      }
      case '{':
      case '[':
        if (stack.length >= MAX_STREAM_DEPTH) return [];
        stack.push({ kind: ch === '{' ? 'object' : 'array', cut: i + 1, awaitingValue: false });
        break;
      case '}':
      case ']': {
        const closed = stack.pop();
        if (!closed || closed.kind !== (ch === '}' ? 'object' : 'array')) return [];
        completeValue(i + 1);
        break;
      }
      case ':': {
        const top = stack[stack.length - 1];
        if (top?.kind !== 'object') return [];
        top.awaitingValue = true;
        break;
      }
      case ',':
      case ' ':
      case '\n':
      case '\r':
      case '\t':
        break;
      default:
        // A number or a literal (true, false, null): it ends at the next delimiter.
        scalar = true;
    }
  }

  const candidates: string[] = [];
  for (let depth = stack.length - 1; depth >= 0; depth--) {
    const open = stack[depth] as Open;
    let closers = '';
    for (let i = depth; i >= 0; i--) closers += (stack[i] as Open).kind === 'object' ? '}' : ']';
    candidates.push(text.slice(0, open.cut) + closers);
  }
  return candidates;
}

function contentKindOf(json: string): boolean {
  try {
    const value = JSON.parse(json) as unknown;
    return (
      value !== null &&
      typeof value === 'object' &&
      isContentKind((value as { kind?: unknown }).kind)
    );
  } catch {
    return false;
  }
}

/**
 * The blueprint a streamed text paints: the whole blueprint when the text is
 * complete and valid, else (content kinds only) the largest valid part that
 * has arrived, else `null`. Every candidate goes through
 * `loadUntrustedDocument`, with its limits.
 */
export async function paintStreamedBlueprint(
  text: string,
  limits: Partial<UntrustedDocumentLimits> = {}
): Promise<StreamedBlueprint | null> {
  const maxBytes = limits.maxBytes ?? DEFAULT_UNTRUSTED_DOCUMENT_LIMITS.maxBytes;
  // A UTF-16 length over the byte cap is always over it in UTF-8 too.
  if (text.length > maxBytes) return null;
  let complete = true;
  try {
    JSON.parse(text);
  } catch {
    complete = false;
  }
  if (complete) {
    const loaded = await loadUntrustedDocument(text, limits);
    return loaded.success ? { blueprint: loaded.blueprint, complete: true, json: text } : null;
  }
  const candidates = truncatedJsonCandidates(text).slice(0, MAX_STREAM_CANDIDATES);
  for (const candidate of candidates) {
    if (!contentKindOf(candidate)) continue;
    const loaded = await loadUntrustedDocument(candidate, limits);
    if (loaded.success) return { blueprint: loaded.blueprint, complete: false, json: candidate };
  }
  return null;
}
