import type { Readable, Writable } from 'node:stream';
import { CliError, type Envelope, errorEnvelope } from '../lib/output.ts';
import { CLI_VERSION } from '../lib/workspace.ts';
import { MCP_MAX_LINE_BYTES } from './security.ts';

/**
 * Newline-delimited lines from a stream, never buffering more than
 * `maxBytes` of one line: a longer line is dropped as it streams in and
 * yields `null` once its newline arrives (or at the end). A trailing `\r` is
 * removed, as readline's `crlfDelay` did.
 */
export async function* boundedLines(
  input: AsyncIterable<Buffer | string>,
  maxBytes: number
): AsyncGenerator<string | null> {
  let parts: Buffer[] = [];
  let size = 0;
  let dropping = false;
  const finish = (): string | null => {
    if (dropping) return null;
    const text = Buffer.concat(parts).toString('utf8');
    return text.endsWith('\r') ? text.slice(0, -1) : text;
  };
  for await (const chunk of input) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
    let start = 0;
    while (start <= buffer.length) {
      const newline = buffer.indexOf(10, start);
      const end = newline === -1 ? buffer.length : newline;
      if (!dropping) {
        size += end - start;
        if (size > maxBytes) {
          dropping = true;
          parts = [];
        } else if (end > start) {
          parts.push(buffer.subarray(start, end));
        }
      }
      if (newline === -1) break;
      yield finish();
      parts = [];
      size = 0;
      dropping = false;
      start = newline + 1;
    }
  }
  if (dropping || size > 0) yield finish();
}

/** Primary stateless MCP revision. */
export const MCP_PROTOCOL_VERSION = '2026-07-28';
/** Legacy handshake revision retained for existing MCP clients. */
export const MCP_LEGACY_PROTOCOL_VERSION = '2025-11-25';
export const MCP_SUPPORTED_PROTOCOL_VERSIONS = [
  MCP_PROTOCOL_VERSION,
  MCP_LEGACY_PROTOCOL_VERSION,
] as const;
const PROTOCOL_VERSION_KEY = 'io.modelcontextprotocol/protocolVersion';
const SERVER_INFO_KEY = 'io.modelcontextprotocol/serverInfo';

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpStdioOptions {
  input?: Readable;
  output?: Writable;
  diagnostics?: Writable;
  tools?: readonly McpTool[];
  callTool?: (name: string, args: Record<string, unknown>) => Promise<Envelope>;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: unknown;
}

type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function response(id: JsonRpcRequest['id'], result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function rpcError(
  id: JsonRpcRequest['id'],
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  };
}

function unsupportedVersion(id: JsonRpcRequest['id'], requested: unknown): JsonRpcResponse {
  return rpcError(id, -32022, 'Unsupported protocol version', {
    supported: MCP_SUPPORTED_PROTOCOL_VERSIONS,
    requested: typeof requested === 'string' ? requested : null,
  });
}

function protocolVersion(request: JsonRpcRequest): unknown {
  if (!isRecord(request.params) || !isRecord(request.params._meta)) return undefined;
  return request.params._meta[PROTOCOL_VERSION_KEY];
}

function carriesRequestMeta(request: JsonRpcRequest): boolean {
  return isRecord(request.params) && Object.hasOwn(request.params, '_meta');
}

function envelopeText(envelope: Envelope): { type: 'text'; text: string }[] {
  return [{ type: 'text', text: JSON.stringify(envelope) }];
}

function serverInfoMeta(): Record<string, unknown> {
  return { [SERVER_INFO_KEY]: { name: 'protoyard', version: CLI_VERSION } };
}

function modernResponse(
  id: JsonRpcRequest['id'],
  result: Record<string, unknown>
): JsonRpcResponse {
  return response(id, { ...result, _meta: serverInfoMeta() });
}

async function dispatchTool(
  request: JsonRpcRequest,
  options: McpStdioOptions,
  modern: boolean
): Promise<JsonRpcResponse> {
  const params = request.params;
  if (
    !isRecord(params) ||
    typeof params.name !== 'string' ||
    (params.arguments !== undefined && !isRecord(params.arguments))
  )
    return rpcError(request.id, -32602, 'Invalid params for tools/call');

  let result: Envelope;
  try {
    result = options.callTool
      ? await options.callTool(params.name, (params.arguments as Record<string, unknown>) ?? {})
      : errorEnvelope('mcp', new CliError('not_found', `Unknown MCP tool: ${params.name}`));
  } catch (error) {
    result = errorEnvelope('mcp', error);
  }
  const body = {
    content: envelopeText(result),
    ...(result.ok ? {} : { isError: true }),
  };
  return modern ? modernResponse(request.id, body) : response(request.id, body);
}

async function dispatchModern(
  request: JsonRpcRequest,
  options: McpStdioOptions
): Promise<JsonRpcResponse | null> {
  if (request.id === undefined) return null;
  if (request.method === 'server/discover') {
    return modernResponse(request.id, {
      resultType: 'complete',
      supportedVersions: [...MCP_SUPPORTED_PROTOCOL_VERSIONS],
      capabilities: { tools: {} },
    });
  }
  if (request.method === 'tools/list') {
    return modernResponse(request.id, { tools: options.tools ?? [] });
  }
  if (request.method === 'tools/call') return dispatchTool(request, options, true);
  if (request.method === 'ping') return modernResponse(request.id, {});
  return rpcError(request.id, -32601, `Method not found: ${request.method}`);
}

async function dispatchLegacy(
  request: JsonRpcRequest,
  options: McpStdioOptions,
  initialized: boolean
): Promise<JsonRpcResponse | null> {
  if (
    request.method === 'notifications/initialized' ||
    request.method === 'notifications/cancelled'
  )
    return null;
  if (request.id === undefined) return null;

  if (request.method === 'initialize') {
    const params = request.params;
    const requested = isRecord(params) ? params.protocolVersion : undefined;
    if (requested !== MCP_LEGACY_PROTOCOL_VERSION) return unsupportedVersion(request.id, requested);
    return response(request.id, {
      protocolVersion: MCP_LEGACY_PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'protoyard', version: CLI_VERSION },
    });
  }

  if (!initialized) return rpcError(request.id, -32002, 'Server not initialized');
  if (request.method === 'ping') return response(request.id, {});
  if (request.method === 'tools/list') return response(request.id, { tools: options.tools ?? [] });
  if (request.method === 'tools/call') return dispatchTool(request, options, false);
  return rpcError(request.id, -32601, `Method not found: ${request.method}`);
}

/** Serve modern stateless requests and the legacy initialize-based session on stdio. */
export async function serveMcpStdio(options: McpStdioOptions = {}): Promise<void> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const diagnostics = options.diagnostics ?? process.stderr;
  let legacyInitialized = false;

  for await (const line of boundedLines(
    input as AsyncIterable<Buffer | string>,
    MCP_MAX_LINE_BYTES
  )) {
    if (line === null) {
      // Refused before it was buffered or parsed: its id is unknown.
      diagnostics.write(`protoyard mcp: refused a request line over ${MCP_MAX_LINE_BYTES} bytes\n`);
      output.write(
        `${JSON.stringify(rpcError(null, -32600, `Invalid Request: a request line may not exceed ${MCP_MAX_LINE_BYTES} bytes`))}\n`
      );
      continue;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(line);
    } catch {
      diagnostics.write('protoyard mcp: received invalid JSON on stdin\n');
      output.write(`${JSON.stringify(rpcError(null, -32700, 'Parse error'))}\n`);
      continue;
    }

    if (!isRecord(payload) || payload.jsonrpc !== '2.0' || typeof payload.method !== 'string') {
      const id =
        isRecord(payload) && (typeof payload.id === 'string' || typeof payload.id === 'number')
          ? payload.id
          : null;
      output.write(`${JSON.stringify(rpcError(id, -32600, 'Invalid Request'))}\n`);
      continue;
    }

    const request = payload as unknown as JsonRpcRequest;
    if (request.id === undefined) continue;
    let result: JsonRpcResponse | null;
    if (request.method === 'initialize') {
      result = await dispatchLegacy(request, options, legacyInitialized);
      if (result && !result.error) legacyInitialized = true;
    } else {
      const requested = protocolVersion(request);
      if (
        request.method === 'server/discover' ||
        requested !== undefined ||
        carriesRequestMeta(request)
      ) {
        if (requested !== MCP_PROTOCOL_VERSION) {
          result = unsupportedVersion(request.id, requested);
        } else {
          result = await dispatchModern(request, options);
        }
      } else {
        result = await dispatchLegacy(request, options, legacyInitialized);
      }
    }
    if (result) output.write(`${JSON.stringify(result)}\n`);
  }
}
