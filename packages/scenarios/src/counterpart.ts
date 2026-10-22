import { hashString } from '@protoyard/core';

/**
 * A scripted counterpart for simulated conversations: the other person in a
 * chat answers on the simulated clock, from fixed lines, the same way on every
 * replay. Pure functions over the conversation's messages; the prototype's
 * clock pass (`onClockTick` in @protoyard/renderer-svelte) writes the replies
 * through its own service, so this module never touches a database.
 *
 * - The delay before a reply is fixed by the message id (and the seed): 2–45
 *   simulated seconds by default, so advancing the clock one minute always
 *   delivers every pending reply.
 * - A reply answers the conversation's latest message when that message is
 *   the person's; the counterpart's next line is chosen by how many lines it
 *   has already sent, and a finished script stays silent.
 * - `typing` is due for the last few seconds before a reply, for typing
 *   indicators.
 * - Reply ids and times derive from the answered message, so writing the due
 *   replies twice at the same instant is a no-op when the writer skips ids it
 *   already stored (idempotent ticks).
 */

export const COUNTERPART_DELAY = { minSeconds: 2, maxSeconds: 45 } as const;
/** How long the typing indicator shows before a reply, at most (seconds). */
export const COUNTERPART_TYPING_SECONDS = 4;

export interface CounterpartMessage {
  id: string;
  conversationId: string;
  /** Who wrote it: the person using the prototype, or the scripted counterpart. */
  author: 'person' | 'counterpart';
  /** ISO 8601 instant on the simulated clock. */
  sentAt: string;
}

export interface ScriptedCounterpartOptions {
  /** One or more scripts; each conversation follows one, chosen by its id. Fictional copy only. */
  scripts: readonly (readonly string[])[];
  /** Varies script choice and delays between worlds; the same seed replays identically. */
  seed?: number | string;
  minDelaySeconds?: number;
  maxDelaySeconds?: number;
  typingSeconds?: number;
}

export type CounterpartState =
  /** Nothing to answer: no messages, or the counterpart spoke last. */
  | { status: 'idle' }
  /** The script has no line left for this conversation. */
  | { status: 'done' }
  /** A reply is scheduled; the counterpart has not started typing yet. */
  | { status: 'waiting'; replyTo: string; typingAt: string; dueAt: string; text: string }
  /** Typing indicator time: the reply is due at `dueAt`. */
  | { status: 'typing'; replyTo: string; typingAt: string; dueAt: string; text: string }
  /** The reply is due now (or overdue): write it with `reply`. */
  | { status: 'due'; replyTo: string; dueAt: string; text: string; reply: CounterpartReply };

/** A reply ready to store: a stable id and its simulated time. */
export interface CounterpartReply {
  id: string;
  conversationId: string;
  replyTo: string;
  text: string;
  /** ISO instant: the due time, strictly after the answered message. */
  sentAt: string;
}

export interface ScriptedCounterpart {
  /** Simulated seconds before the counterpart answers this message. */
  delaySeconds(messageId: string): number;
  /** The script a conversation follows. */
  scriptFor(conversationId: string): readonly string[];
  /** The line after `alreadySent` counterpart lines, or null when the script is over. */
  nextLine(conversationId: string, alreadySent: number): string | null;
  /** Where one conversation stands at `now` (messages in any order). */
  state(messages: readonly CounterpartMessage[], now: Date | string): CounterpartState;
  /** Every reply due at `now` across conversations, ordered by time then conversation. */
  dueReplies(messages: readonly CounterpartMessage[], now: Date | string): CounterpartReply[];
}

const toMs = (value: Date | string) =>
  value instanceof Date ? value.getTime() : Date.parse(value);

function assertInt(name: string, value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer from ${min} to ${max} (got ${value})`);
  }
}

/**
 * Creates a counterpart. Throws on empty scripts or an invalid delay window,
 * so a broken prototype fails at authoring time.
 */
export function scriptedCounterpart(options: ScriptedCounterpartOptions): ScriptedCounterpart {
  const scripts = options.scripts.filter((lines) => lines.length > 0);
  if (scripts.length === 0) throw new RangeError('A scripted counterpart needs at least one line');
  const min = options.minDelaySeconds ?? COUNTERPART_DELAY.minSeconds;
  const max = options.maxDelaySeconds ?? COUNTERPART_DELAY.maxSeconds;
  assertInt('minDelaySeconds', min, 0, 86_400);
  assertInt('maxDelaySeconds', max, min, 86_400);
  const typing = options.typingSeconds ?? COUNTERPART_TYPING_SECONDS;
  assertInt('typingSeconds', typing, 0, 3_600);
  const seed = String(options.seed ?? 0);

  const delaySeconds = (messageId: string) =>
    min + (hashString(`${seed}|reply|${messageId}`) % (max - min + 1));

  const scriptFor = (conversationId: string) =>
    scripts[hashString(`${seed}|script|${conversationId}`) % scripts.length] as readonly string[];

  const nextLine = (conversationId: string, alreadySent: number) =>
    scriptFor(conversationId)[Math.max(0, Math.floor(alreadySent))] ?? null;

  /** Messages in conversation order; ties keep their input order (stable sort). */
  const ordered = (messages: readonly CounterpartMessage[]) =>
    [...messages].sort((a, b) => toMs(a.sentAt) - toMs(b.sentAt));

  const state = (messages: readonly CounterpartMessage[], now: Date | string): CounterpartState => {
    const thread = ordered(messages);
    const last = thread.at(-1);
    if (last?.author !== 'person') return { status: 'idle' };
    const sent = thread.filter((m) => m.author === 'counterpart').length;
    const text = nextLine(last.conversationId, sent);
    if (text === null) return { status: 'done' };
    const lastMs = toMs(last.sentAt);
    const delayMs = delaySeconds(last.id) * 1000;
    // Strictly after the answered message, so chat order survives equal-clock ties.
    const dueMs = lastMs + Math.max(1, delayMs);
    const typingMs = Math.max(lastMs, dueMs - typing * 1000);
    const nowMs = toMs(now);
    const dueAt = new Date(dueMs).toISOString();
    const typingAt = new Date(typingMs).toISOString();
    if (nowMs >= dueMs) {
      return {
        status: 'due',
        replyTo: last.id,
        dueAt,
        text,
        reply: {
          id: `${last.id}~reply`,
          conversationId: last.conversationId,
          replyTo: last.id,
          text,
          sentAt: dueAt,
        },
      };
    }
    if (nowMs >= typingMs) return { status: 'typing', replyTo: last.id, typingAt, dueAt, text };
    return { status: 'waiting', replyTo: last.id, typingAt, dueAt, text };
  };

  const dueReplies = (messages: readonly CounterpartMessage[], now: Date | string) => {
    const byConversation = new Map<string, CounterpartMessage[]>();
    for (const message of messages) {
      const list = byConversation.get(message.conversationId) ?? [];
      list.push(message);
      byConversation.set(message.conversationId, list);
    }
    const replies: CounterpartReply[] = [];
    for (const thread of byConversation.values()) {
      const current = state(thread, now);
      if (current.status === 'due') replies.push(current.reply);
    }
    return replies.sort(
      (a, b) =>
        toMs(a.sentAt) - toMs(b.sentAt) ||
        (a.conversationId < b.conversationId ? -1 : a.conversationId > b.conversationId ? 1 : 0)
    );
  };

  return { delaySeconds, scriptFor, nextLine, state, dueReplies };
}
