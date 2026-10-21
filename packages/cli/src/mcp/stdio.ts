import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import { CliError, type Envelope, errorEnvelope } from '../lib/output.ts';
import { CLI_VERSION } from '../lib/workspace.ts';

/** The MCP revision implemented by this handshake-based stdio transport. */
export const MCP_PROTOCOL_VERSION = '2025-11-25';

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

function envelopeText(envelope: Envelope): { type: 'text'; text: string }[] {
  return [{ type: 'text', text: JSON.stringify(envelope) }];
}

async function dispatch(
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
    return response(request.id, {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'protoyard', version: CLI_VERSION },
    });
  }

  if (!initialized) return rpcError(request.id, -32002, 'Server not initialized');
  if (request.method === 'ping') return response(request.id, {});
  if (request.method === 'tools/list') return response(request.id, { tools: options.tools ?? [] });

  if (request.method === 'tools/call') {
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
    return response(request.id, {
      content: envelopeText(result),
      ...(result.ok ? {} : { isError: true }),
    });
  }

  return rpcError(request.id, -32601, `Method not found: ${request.method}`);
}

/** Serve one MCP JSON-RPC session using newline-delimited JSON on stdio. */
export async function serveMcpStdio(options: McpStdioOptions = {}): Promise<void> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const diagnostics = options.diagnostics ?? process.stderr;
  const lines = createInterface({ input, crlfDelay: Infinity });
  let initialized = false;

  for await (const line of lines) {
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
    const result = await dispatch(request, options, initialized);
    if (request.method === 'initialize' && result && !result.error) initialized = true;
    if (result) output.write(`${JSON.stringify(result)}\n`);
  }
}
