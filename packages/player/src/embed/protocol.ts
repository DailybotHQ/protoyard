import { DEFAULT_UNTRUSTED_BLUEPRINT_LIMITS } from '@protoyard/blueprint';

/**
 * `protoyard-player/1`: how an embedding page (protoyard.app/play, `protoyard
 * quick`, a local tool) hands the player a blueprint over `postMessage`.
 *
 *   player → parent   ready   { accepts, maxBytes }      once, when listening
 *   parent → player   load    { id, blueprint }          run a blueprint
 *   parent → player   replace { id, blueprint }          live iterate: swap it
 *   player → parent   loaded  { id, namespace, name }    it is running
 *   player → parent   error   { id, issues }             it is not (with fixes)
 *
 * Every message carries `protocol: 'protoyard-player/1'`. Messages from any
 * other window or origin, or that are not this protocol, are ignored without
 * a reply. A blueprint is data: it goes through `loadUntrustedDocument`
 * before anything derives or renders it, and nothing in a message executes.
 */
export const PLAYER_PROTOCOL = 'protoyard-player/1';

/** Largest blueprint a message may carry (UTF-8 bytes of its JSON), the loader's cap. */
export const MAX_MESSAGE_BLUEPRINT_BYTES = DEFAULT_UNTRUSTED_BLUEPRINT_LIMITS.maxBytes;

const ID = /^[A-Za-z0-9._:-]{1,64}$/;
const REQUEST_KEYS = new Set(['protocol', 'type', 'id', 'blueprint']);

export type PlayerIssueCode =
  | 'invalid-message'
  | 'too-large'
  | 'superseded'
  | 'boot-failed'
  | 'invalid-input'
  | 'too-deep'
  | 'too-many'
  | 'unsafe-key'
  | 'invalid-json'
  | 'invalid-blueprint';

export interface PlayerIssue {
  code: PlayerIssueCode;
  path: (string | number)[];
  message: string;
  fix: string;
}

export type PlayerRequestType = 'load' | 'replace';

/** A request after shape checks; `blueprint` is still untrusted. */
export interface PlayerRequest {
  protocol: typeof PLAYER_PROTOCOL;
  type: PlayerRequestType;
  id: string;
  blueprint: unknown;
}

export type PlayerMessage =
  | {
      protocol: typeof PLAYER_PROTOCOL;
      type: 'ready';
      accepts: PlayerRequestType[];
      maxBytes: number;
    }
  | {
      protocol: typeof PLAYER_PROTOCOL;
      type: 'loaded';
      id: string;
      namespace: string;
      name: string;
    }
  | { protocol: typeof PLAYER_PROTOCOL; type: 'error'; id: string; issues: PlayerIssue[] };

/** What a message turned out to be: not ours (ignore), a bad request (reply), or a request. */
export type RequestCheck =
  | { kind: 'ignore' }
  | { kind: 'reject'; id: string; issues: PlayerIssue[] }
  | { kind: 'request'; request: PlayerRequest };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

/** UTF-8 size of a blueprint payload as JSON, or null when it cannot be serialized. */
export function payloadBytes(blueprint: unknown): number | null {
  if (typeof blueprint === 'string') return utf8Length(blueprint);
  try {
    const json = JSON.stringify(blueprint);
    return json === undefined ? null : utf8Length(json);
  } catch {
    return null;
  }
}

const issue = (code: PlayerIssueCode, message: string, fix: string): PlayerIssue => ({
  code,
  path: [],
  message,
  fix,
});

/**
 * Classifies a received `data` value. Anything that is not a well-formed
 * `protoyard-player/1` request with a usable id is ignored (there is no id to
 * answer); a request with a bad payload is rejected with issues.
 */
export function checkRequest(
  data: unknown,
  maxBytes: number = MAX_MESSAGE_BLUEPRINT_BYTES
): RequestCheck {
  if (!isPlainObject(data) || data.protocol !== PLAYER_PROTOCOL) return { kind: 'ignore' };
  if (data.type !== 'load' && data.type !== 'replace') return { kind: 'ignore' };
  if (typeof data.id !== 'string' || !ID.test(data.id)) return { kind: 'ignore' };
  const id = data.id;
  const extra = Object.keys(data).filter((key) => !REQUEST_KEYS.has(key));
  if (extra.length > 0) {
    return {
      kind: 'reject',
      id,
      issues: [
        issue(
          'invalid-message',
          `Unknown message field${extra.length > 1 ? 's' : ''}: ${extra.slice(0, 5).join(', ')}.`,
          'Send only protocol, type, id and blueprint.'
        ),
      ],
    };
  }
  const blueprint = data.blueprint;
  if (typeof blueprint !== 'string' && !isPlainObject(blueprint)) {
    return {
      kind: 'reject',
      id,
      issues: [
        issue(
          'invalid-message',
          'The message has no blueprint (a JSON object or its JSON text).',
          'Put the blueprint object, or its JSON string, in the blueprint field.'
        ),
      ],
    };
  }
  const bytes = payloadBytes(blueprint);
  if (bytes === null) {
    return {
      kind: 'reject',
      id,
      issues: [
        issue(
          'invalid-message',
          'The blueprint cannot be serialized as JSON.',
          'Send plain JSON data: no cycles, functions or class instances.'
        ),
      ],
    };
  }
  if (bytes > maxBytes) {
    return {
      kind: 'reject',
      id,
      issues: [
        issue(
          'too-large',
          `The blueprint is ${bytes} bytes; the player accepts at most ${maxBytes}.`,
          'Trim the blueprint (fewer entities, screens or seed rows).'
        ),
      ],
    };
  }
  return {
    kind: 'request',
    request: { protocol: PLAYER_PROTOCOL, type: data.type, id, blueprint },
  };
}

/** Validates a message the player sent (used by the embedding client). */
export function isPlayerMessage(data: unknown): data is PlayerMessage {
  if (!isPlainObject(data) || data.protocol !== PLAYER_PROTOCOL) return false;
  switch (data.type) {
    case 'ready':
      return Array.isArray(data.accepts) && typeof data.maxBytes === 'number';
    case 'loaded':
      return (
        typeof data.id === 'string' &&
        typeof data.namespace === 'string' &&
        typeof data.name === 'string'
      );
    case 'error':
      return typeof data.id === 'string' && Array.isArray(data.issues);
    default:
      return false;
  }
}

export { issue as playerIssue };
