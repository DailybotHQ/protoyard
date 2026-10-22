import { NamespaceSchema } from '@protoyard/core';
import { loadUntrustedBlueprint, type UntrustedBlueprintResult } from '../../untrusted.ts';
import { containsEmbeddedApp } from '../limits.ts';

/** Same-origin protocol used by generated level-two hosts and their app frame. */
export const EMBEDDED_APP_PROTOCOL = 'protoyard-embedded-app/1';

export interface EmbeddedAppReady {
  protocol: typeof EMBEDDED_APP_PROTOCOL;
  type: 'ready';
}

export interface EmbeddedAppStart {
  protocol: typeof EMBEDDED_APP_PROTOCOL;
  type: 'start';
  requestId: string;
  hostNamespace: string;
  blockId: string;
  app: unknown;
}

export interface EmbeddedAppLoaded {
  protocol: typeof EMBEDDED_APP_PROTOCOL;
  type: 'loaded';
  requestId: string;
  namespace: string;
  name: string;
}

export interface EmbeddedAppFailure {
  protocol: typeof EMBEDDED_APP_PROTOCOL;
  type: 'error';
  requestId: string;
  message: string;
}

export type EmbeddedAppMessage =
  | EmbeddedAppReady
  | EmbeddedAppStart
  | EmbeddedAppLoaded
  | EmbeddedAppFailure;

/** The app-only untrusted loader; nested content kinds and malformed apps fail closed. */
export function loadEmbeddedApp(input: unknown): UntrustedBlueprintResult {
  const loaded = loadUntrustedBlueprint(input);
  if (!loaded.success) return loaded;
  if (containsEmbeddedApp(loaded.blueprint)) {
    return {
      success: false,
      blueprint: null,
      issues: [
        {
          code: 'too-deep',
          path: [],
          message: 'An embedded app cannot embed another app (one level only).',
          fix: 'Remove the nested embed-app block.',
        },
      ],
    };
  }
  return loaded;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

const REQUEST_ID = /^embed-[1-9][0-9]{0,7}$/;

/** Checks the exact data shapes exchanged between the same-origin host and app frame. */
export function isEmbeddedAppMessage(value: unknown): value is EmbeddedAppMessage {
  if (!isPlainRecord(value) || value.protocol !== EMBEDDED_APP_PROTOCOL) return false;
  if (value.type === 'ready') {
    return hasOnlyKeys(value, ['protocol', 'type']);
  }
  if (value.type === 'start') {
    return (
      hasOnlyKeys(value, ['protocol', 'type', 'requestId', 'hostNamespace', 'blockId', 'app']) &&
      typeof value.requestId === 'string' &&
      REQUEST_ID.test(value.requestId) &&
      typeof value.hostNamespace === 'string' &&
      NamespaceSchema.safeParse(value.hostNamespace).success &&
      typeof value.blockId === 'string' &&
      value.blockId.length > 0 &&
      value.blockId.length <= 120 &&
      isPlainRecord(value.app)
    );
  }
  if (value.type === 'loaded') {
    return (
      hasOnlyKeys(value, ['protocol', 'type', 'requestId', 'namespace', 'name']) &&
      typeof value.requestId === 'string' &&
      REQUEST_ID.test(value.requestId) &&
      typeof value.namespace === 'string' &&
      NamespaceSchema.safeParse(value.namespace).success &&
      typeof value.name === 'string'
    );
  }
  if (value.type === 'error') {
    return (
      hasOnlyKeys(value, ['protocol', 'type', 'requestId', 'message']) &&
      typeof value.requestId === 'string' &&
      REQUEST_ID.test(value.requestId) &&
      typeof value.message === 'string' &&
      value.message.length <= 500
    );
  }
  return false;
}

/**
 * Stable isolated storage namespace for one embedded block in one host.
 * SHA-256 avoids collisions between block ids while keeping the manifest's
 * lowercase kebab-case namespace contract (48 characters total).
 */
export async function embeddedAppNamespace(
  hostNamespace: string,
  blockId: string
): Promise<string> {
  const host = NamespaceSchema.parse(hostNamespace);
  if (blockId.length === 0 || blockId.length > 120) {
    throw new Error('An embedded app needs a stable block id of at most 120 characters.');
  }
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('This browser cannot create an isolated embedded-app namespace.');
  const input = new TextEncoder().encode(`protoyard.embed.v1\0${host}\0${blockId}`);
  const digest = new Uint8Array(await subtle.digest('SHA-256', input));
  const suffix = [...digest.slice(0, 21)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `embed-${suffix}`;
}
