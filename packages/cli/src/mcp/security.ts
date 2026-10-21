import { isAbsolute, relative, resolve, sep } from 'node:path';
import { runWithAbortSignal } from '../lib/abort.ts';
import { CliError, type Envelope } from '../lib/output.ts';
import { canonicalPath, isInside, resolveWorkspaceRoot } from '../lib/paths.ts';

/** Maximum encoded MCP tool arguments accepted by the local adapter. */
export const MCP_MAX_REQUEST_BYTES = 256 * 1024;
/**
 * Maximum raw stdio request line: the argument cap plus room for the JSON-RPC
 * envelope. Longer lines are refused before they are buffered or parsed.
 */
export const MCP_MAX_LINE_BYTES = MCP_MAX_REQUEST_BYTES + 64 * 1024;
/** Maximum time a tool may hold the MCP request open. */
export const MCP_TOOL_TIMEOUT_MS = 30_000;
/** Maximum encoded envelope returned to an MCP client. */
export const MCP_MAX_OUTPUT_BYTES = 512 * 1024;

const SHELL_METACHARACTERS = /[;&|$`<>()[\]{}!*?'"\\]/u;
// biome-ignore lint/suspicious/noControlCharactersInRegex: this allow-list rejects control input.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
/**
 * Control characters removed from envelope strings: every C0 control and DEL
 * except tab and newline. Those two are kept on purpose: multi-line messages,
 * hints and reports stay readable, and JSON encodes them as `\t` and `\n`, so
 * they can never break the one-message-per-line stdio framing. (Global: every
 * occurrence goes, not only the first.)
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: this strips control characters from output.
const STRIPPED_CONTROL_CHARACTERS = /[\u0000-\u0008\u000b-\u001f\u007f]/gu;
const SENSITIVE_KEY = /(?:secret|token|password|api[-_]?key|authorization|credential)/iu;
const REDACTED_VALUE = '[redacted]';

export interface McpPathPolicy {
  /** Canonical workspace root. */
  workspaceRoot: string;
  /** Additional, explicitly approved output roots outside the workspace (none by default). */
  approvedRoots?: readonly string[];
}

function unsafe(message: string): never {
  throw new CliError('unsafe_path', message, {
    hint: 'Use a path inside the current workspace.',
  });
}

/** Resolve a path without allowing traversal, shell syntax, or symlink escapes. */
export function resolveMcpPath(input: string, policy: McpPathPolicy): string {
  if (!input || CONTROL_CHARACTERS.test(input) || SHELL_METACHARACTERS.test(input))
    unsafe('MCP paths cannot contain control characters or shell metacharacters.');

  const workspaceRoot = canonicalPath(policy.workspaceRoot);
  const lexical = resolve(workspaceRoot, input);
  const lexicalRelative = relative(workspaceRoot, lexical);
  if (!isAbsolute(input) && lexicalRelative.split(sep).includes('..'))
    unsafe('MCP paths may not traverse a parent folder.');

  const target = canonicalPath(lexical);
  const approvedRoots = [workspaceRoot, ...(policy.approvedRoots ?? [])].map(canonicalPath);
  if (!approvedRoots.some((root) => isInside(root, target)))
    unsafe('MCP paths must remain inside the workspace or an approved output root.');
  return target;
}

/** Resolve the standard MCP roots for the current CLI workspace. */
export function mcpPathPolicy(workspaceRoot?: string): McpPathPolicy {
  const root = canonicalPath(workspaceRoot ?? resolveWorkspaceRoot());
  return { workspaceRoot: root };
}

/** Reject an oversized JSON value before it reaches a command or child process. */
export function assertMcpRequestSize(value: unknown): void {
  let bytes: number;
  try {
    bytes = Buffer.byteLength(JSON.stringify(value) ?? 'null', 'utf8');
  } catch {
    throw new CliError('validation', 'MCP request arguments must be JSON serializable.');
  }
  if (bytes > MCP_MAX_REQUEST_BYTES)
    throw new CliError('validation', `MCP request exceeds ${MCP_MAX_REQUEST_BYTES} bytes.`);
}

/** Keep credentials and control characters out of the machine-facing envelope. */
export function sanitizeMcpValue(value: unknown, key?: string): unknown {
  if (key && SENSITIVE_KEY.test(key)) return REDACTED_VALUE;
  if (typeof value === 'string') return value.replace(STRIPPED_CONTROL_CHARACTERS, '');
  if (Array.isArray(value)) return value.map((entry) => sanitizeMcpValue(entry));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeMcpValue(entryValue, entryKey),
      ])
    );
  }
  return value;
}

export function sanitizeMcpEnvelope(envelope: Envelope): Envelope {
  return sanitizeMcpValue(envelope) as Envelope;
}

/** Refuse an envelope which could exhaust the connected client's parser. */
export function assertMcpOutputSize(value: unknown): void {
  const bytes = Buffer.byteLength(JSON.stringify(value) ?? 'null', 'utf8');
  if (bytes > MCP_MAX_OUTPUT_BYTES)
    throw new CliError('failure', `MCP tool output exceeds ${MCP_MAX_OUTPUT_BYTES} bytes.`);
}

/**
 * Bound an in-process CLI operation, and cancel it when the time is up: the
 * operation runs inside an abort scope (lib/abort.ts), so the timeout kills
 * its child processes (`pnpm install`, a browser) and stops it before any
 * later long or irreversible step. The CLI itself still uses argv, never a
 * shell.
 */
export async function withMcpTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = MCP_TOOL_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(
        new CliError('failure', `MCP tool timed out after ${timeoutMs} ms and was cancelled.`, {
          hint: 'Child processes were stopped and no further step runs; check the target folder before retrying.',
        })
      );
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      runWithAbortSignal(controller.signal, () => operation(controller.signal)),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
