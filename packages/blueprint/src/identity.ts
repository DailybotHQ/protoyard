import type { Blueprint } from './schema.ts';

/**
 * Content identity for blueprints (ADR-030). A blueprint's identity is the
 * SHA-256 of its canonical JSON, and its default storage namespace is derived
 * from that digest, so every edit opens a fresh world and two different
 * blueprints on one origin never share IndexedDB data.
 *
 * Uses Web Crypto (`crypto.subtle`), available in browsers and Node 20+.
 * Never the 32-bit `hashString`: generator versions tolerate collisions,
 * storage identity does not.
 */

export interface BlueprintIdentity {
  /** Lowercase hex SHA-256 of `canonicalJson(blueprint)` (64 chars). */
  readonly sha256: string;
  /** `bp-` plus 26 base32 chars (130 bits of the digest): a valid manifest namespace. */
  readonly namespace: string;
}

/** Prefix of every content-derived namespace. */
export const BLUEPRINT_NAMESPACE_PREFIX = 'bp-';

/** Base32 characters in a content-derived namespace (130 bits). */
const NAMESPACE_CHARS = 26;

/** RFC 4648 base32, lowercased so the namespace stays lowercase kebab-case. */
const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

/**
 * JSON with object keys sorted (by UTF-16 code unit) at every depth and no
 * whitespace. Array order is kept, `undefined` properties are dropped (as
 * `JSON.stringify` does), and values JSON cannot represent (non-finite
 * numbers, functions, symbols, bigints) throw instead of being silently changed.
 */
export function canonicalJson(value: unknown): string {
  return render(value, new Set());
}

function render(value: unknown, seen: Set<object>): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError(`canonicalJson: ${value} is not JSON`);
      return JSON.stringify(value);
    case 'object':
      break;
    default:
      throw new TypeError(`canonicalJson: a ${typeof value} is not JSON`);
  }
  const node = value as object;
  if (seen.has(node)) throw new TypeError('canonicalJson: circular structure');
  seen.add(node);
  let out: string;
  if (Array.isArray(node)) {
    out = `[${node.map((item) => (item === undefined ? 'null' : render(item, seen))).join(',')}]`;
  } else {
    const record = node as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort();
    out = `{${keys.map((key) => `${JSON.stringify(key)}:${render(record[key], seen)}`).join(',')}}`;
  }
  seen.delete(node);
  return out;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The first `length` base32 characters of `bytes`, most significant bits first. */
function toBase32(bytes: Uint8Array, length: number): string {
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = ((buffer << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5 && out.length < length) {
      out += BASE32[(buffer >> (bits - 5)) & 31];
      bits -= 5;
    }
    if (out.length === length) break;
  }
  return out;
}

async function sha256(text: string): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('blueprintIdentity needs Web Crypto (crypto.subtle)');
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return new Uint8Array(digest);
}

/**
 * The content identity of a parsed blueprint. Parse first (`parseBlueprint`)
 * so defaults are applied: a blueprint that omits `tags` and one that sets
 * `tags: []` are the same product and share an identity. Key order and
 * whitespace never matter. `$schema` is an editor hint, not content, and is
 * left out.
 */
export async function blueprintIdentity(blueprint: Blueprint): Promise<BlueprintIdentity> {
  const { $schema: _schema, ...content } = blueprint;
  const bytes = await sha256(canonicalJson(content));
  return {
    sha256: toHex(bytes),
    namespace: `${BLUEPRINT_NAMESPACE_PREFIX}${toBase32(bytes, NAMESPACE_CHARS)}`,
  };
}
