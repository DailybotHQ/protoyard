import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import { checkSlug } from '@protoyard/core';
import { z } from 'zod';
import { CliError, type Envelope, errorEnvelope } from '../lib/output.ts';
import {
  assertMcpOutputSize,
  assertMcpRequestSize,
  mcpPathPolicy,
  resolveMcpPath,
  sanitizeMcpEnvelope,
  withMcpTimeout,
} from './security.ts';
import type { McpTool } from './stdio.ts';

export type ToolName =
  | 'quick'
  | 'iterate'
  | 'validate_blueprint'
  | 'blueprint_schema'
  | 'screenshot'
  | 'promote'
  | 'doctor';

/** A prototype or exploration slug, checked like the CLI checks it (never an option-like `-…`). */
const slugArg = z
  .string()
  .min(1)
  .max(80)
  .refine((value) => checkSlug(value).ok, 'Not a valid slug (lowercase kebab-case).');

/** Blueprint kinds `quick --kind` accepts when a brief is given. */
const quickKindArg = z.enum(['app', 'deck', 'page', 'doc']);

const quickArgs = z
  .object({
    // `-` would make the CLI read stdin, which is the JSON-RPC channel here.
    brief: z
      .string()
      .min(1)
      .max(65_536)
      .refine((value) => value.trim() !== '-', 'A brief of "-" (stdin) is not available over MCP.')
      .optional(),
    blueprint: z.string().min(1).max(2048).optional(),
    slug: slugArg.optional(),
    name: z.string().min(1).max(120).optional(),
    seed: z.number().int().min(0).max(4_294_967_295).optional(),
    variants: z.number().int().min(1).max(8).optional(),
    standalone: z.boolean().optional(),
    /** Forces the synthesizer kind when `brief` is set (CLI `--kind`). */
    kind: quickKindArg.optional(),
  })
  .strict()
  .refine((value) => Boolean(value.brief) !== Boolean(value.blueprint), {
    message: 'Provide exactly one of brief or blueprint.',
  })
  .refine((value) => value.kind === undefined || value.brief !== undefined, {
    message: 'kind applies only when brief is set (a blueprint file declares its own kind).',
    path: ['kind'],
  });
const iterateArgs = z
  .object({
    dir: z.string().min(1).max(2048),
    patchFile: z
      .string()
      .min(1)
      .max(2048)
      .refine(
        (value) => value.trim() !== '-',
        'A patch file of "-" (stdin) is not available over MCP.'
      ),
    allowDrop: z.boolean().optional(),
  })
  .strict();
const validateArgs = z.object({ file: z.string().min(1).max(2048) }).strict();
const emptyArgs = z.object({}).strict();
const screenshotArgs = z.object({ dir: z.string().min(1).max(2048) }).strict();
const promoteArgs = z
  .object({
    dir: z.string().min(1).max(2048),
    slug: slugArg,
    variant: z
      .string()
      .regex(/^v[1-8]$/)
      .optional(),
    noInstall: z.boolean().optional(),
  })
  .strict();
const doctorArgs = z.object({ offline: z.boolean().optional() }).strict();

const toolSchemas: Record<ToolName, McpTool> = {
  quick: {
    name: 'quick',
    description: 'Create a disposable prototype from a brief or blueprint.',
    inputSchema: {
      type: 'object',
      properties: {
        brief: { type: 'string', minLength: 1, maxLength: 65536 },
        blueprint: { type: 'string', minLength: 1, maxLength: 2048 },
        slug: { type: 'string', minLength: 1, maxLength: 80 },
        name: { type: 'string', minLength: 1, maxLength: 120 },
        seed: { type: 'integer', minimum: 0, maximum: 4294967295 },
        variants: { type: 'integer', minimum: 1, maximum: 8 },
        standalone: { type: 'boolean' },
        kind: { type: 'string', enum: ['app', 'deck', 'page', 'doc'] },
      },
      oneOf: [
        { required: ['brief'], not: { required: ['blueprint'] } },
        { required: ['blueprint'], not: { required: ['brief'] } },
      ],
      additionalProperties: false,
    },
  },
  iterate: {
    name: 'iterate',
    description: 'Apply a validated patch to an existing quick exploration.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: { type: 'string', minLength: 1, maxLength: 2048 },
        patchFile: { type: 'string', minLength: 1, maxLength: 2048 },
        allowDrop: { type: 'boolean' },
      },
      required: ['dir', 'patchFile'],
      additionalProperties: false,
    },
  },
  validate_blueprint: {
    name: 'validate_blueprint',
    description: 'Validate a blueprint JSON file without generating a prototype.',
    inputSchema: {
      type: 'object',
      properties: { file: { type: 'string', minLength: 1, maxLength: 2048 } },
      required: ['file'],
      additionalProperties: false,
    },
  },
  blueprint_schema: {
    name: 'blueprint_schema',
    description: 'Return the published JSON Schema for Protoyard blueprints.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  screenshot: {
    name: 'screenshot',
    description: 'Capture screenshots for an existing quick exploration.',
    inputSchema: {
      type: 'object',
      properties: { dir: { type: 'string', minLength: 1, maxLength: 2048 } },
      required: ['dir'],
      additionalProperties: false,
    },
  },
  promote: {
    name: 'promote',
    description: 'Promote a quick exploration into a full prototype.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: { type: 'string', minLength: 1, maxLength: 2048 },
        slug: { type: 'string', minLength: 1, maxLength: 80 },
        variant: { type: 'string', pattern: '^v[1-8]$' },
        noInstall: { type: 'boolean' },
      },
      required: ['dir', 'slug'],
      additionalProperties: false,
    },
  },
  doctor: {
    name: 'doctor',
    description: 'Check the local Protoyard CLI environment and interface.',
    inputSchema: {
      type: 'object',
      properties: { offline: { type: 'boolean' } },
      additionalProperties: false,
    },
  },
};

export const MCP_TOOLS: readonly McpTool[] = Object.freeze(
  Object.values(toolSchemas).sort((left, right) => left.name.localeCompare(right.name))
);

const validators: Record<ToolName, z.ZodType> = {
  quick: quickArgs,
  iterate: iterateArgs,
  validate_blueprint: validateArgs,
  blueprint_schema: emptyArgs,
  screenshot: screenshotArgs,
  promote: promoteArgs,
  doctor: doctorArgs,
};

function commandForTool(name: string): string {
  if (name === 'validate_blueprint') return 'blueprint validate';
  if (name === 'blueprint_schema') return 'blueprint_schema';
  if (name === 'iterate' || name === 'promote' || name === 'screenshot') return 'quick';
  return name;
}

function validationEnvelope(
  name: string,
  issues: { path: PropertyKey[]; message: string }[]
): Envelope {
  const details = issues.map((issue) => ({
    path: issue.path.map(String).join('.') || '(root)',
    message: issue.message,
  }));
  return errorEnvelope(
    commandForTool(name),
    new CliError('validation', `Invalid arguments for ${name}.`, {
      data: { tool: name, issues: details },
    })
  );
}

/**
 * The CLI argv for a tool: the command path, then every option, then a single
 * `--`, then the positionals. After `--` the CLI reads every word as a
 * positional, so a value that starts with `-` can never become an option, and
 * no option may follow it.
 */
export function cliArgs(name: ToolName, value: Record<string, unknown>): string[] {
  const command = (path: string[], options: string[], positionals: string[]) =>
    positionals.length > 0 ? [...path, ...options, '--', ...positionals] : [...path, ...options];
  if (name === 'quick') {
    const options: string[] = [];
    if (value.blueprint) options.push('--blueprint', String(value.blueprint));
    if (value.slug) options.push('--slug', String(value.slug));
    if (value.name) options.push('--name', String(value.name));
    if (value.seed !== undefined) options.push('--seed', String(value.seed));
    if (value.variants !== undefined) options.push('--variants', String(value.variants));
    if (value.standalone) options.push('--standalone');
    if (value.kind) options.push('--kind', String(value.kind));
    return command(['quick'], options, value.brief ? [String(value.brief)] : []);
  }
  if (name === 'iterate') {
    return command(
      ['quick', 'iterate'],
      ['--patch', String(value.patchFile), ...(value.allowDrop ? ['--allow-drop'] : [])],
      [String(value.dir)]
    );
  }
  if (name === 'validate_blueprint')
    return command(['blueprint', 'validate'], [], [String(value.file)]);
  if (name === 'screenshot') return command(['quick', 'shot'], [], [String(value.dir)]);
  if (name === 'promote') {
    return command(
      ['quick', 'promote'],
      [
        ...(value.variant ? ['--variant', String(value.variant)] : []),
        ...(value.noInstall ? ['--no-install'] : []),
      ],
      [String(value.dir), String(value.slug)]
    );
  }
  return ['doctor', '--offline'];
}

/**
 * Under MCP, stdin is the JSON-RPC channel: no in-process command may read it.
 * The `quick` brief and `quick iterate --patch -` readers get an empty stream
 * instead, once, for the life of the server (the schemas also refuse `-`).
 */
let stdinIsolated = false;
async function isolateStdin(): Promise<void> {
  if (stdinIsolated) return;
  const [{ setQuickStdin }, { setQuickIterateStdin }] = await Promise.all([
    import('../commands/quick/index.ts'),
    import('../commands/quick/iterate.ts'),
  ]);
  setQuickStdin(Readable.from([]));
  setQuickIterateStdin(Readable.from([]));
  stdinIsolated = true;
}

/** Runs the CLI in process with stdin isolated and returns its sanitized envelope. */
export async function runCliEnvelope(args: string[]): Promise<Envelope> {
  let stdout = '';
  let exitCode = 0;
  await isolateStdin();
  const { runCli } = await import('../program.ts');
  await runCli(['--json', ...args], {
    streams: {
      stdout: (text) => {
        stdout += text;
      },
      stderr: () => {},
    },
    setExitCode: (code) => {
      exitCode = code;
    },
  });

  try {
    const parsed: unknown = JSON.parse(stdout);
    if (typeof parsed === 'object' && parsed !== null && 'ok' in parsed && 'command' in parsed) {
      const envelope = parsed as Envelope;
      assertMcpOutputSize(envelope);
      return sanitizeMcpEnvelope(envelope);
    }
  } catch {
    // A CLI that emitted no envelope is converted to a structured MCP failure below.
  }
  return errorEnvelope(
    'mcp',
    new CliError('failure', `CLI command did not return a JSON envelope (exit ${exitCode}).`)
  );
}

async function loadBlueprintSchema(): Promise<unknown> {
  const require = createRequire(import.meta.url);
  const schemaPath = require.resolve('@protoyard/blueprint/schema.json');
  return JSON.parse(await readFile(schemaPath, 'utf8')) as unknown;
}

async function blueprintSchemaEnvelope(loadSchema: () => Promise<unknown>): Promise<Envelope> {
  try {
    const schema = await loadSchema();
    return { ok: true, command: 'blueprint_schema', data: schema };
  } catch (error) {
    return errorEnvelope('blueprint_schema', error);
  }
}

/** Validate one tool request and route it through the existing CLI implementation. */
export interface McpToolHandlerOptions {
  runCli?: (args: string[]) => Promise<Envelope>;
  loadSchema?: () => Promise<unknown>;
  workspaceRoot?: string;
  timeoutMs?: number;
}

export function createMcpToolHandler(options: McpToolHandlerOptions = {}) {
  const invokeCli = options.runCli ?? runCliEnvelope;
  const loadSchema = options.loadSchema ?? loadBlueprintSchema;
  const pathPolicy = mcpPathPolicy(options.workspaceRoot);
  const timeoutMs = options.timeoutMs;

  /** The canonical absolute path the CLI receives (never the caller's spelling). */
  const canonical = (value: unknown): string => resolveMcpPath(String(value), pathPolicy);

  return async (name: string, args: Record<string, unknown>): Promise<Envelope> => {
    if (!Object.hasOwn(validators, name))
      return errorEnvelope('mcp', new CliError('not_found', `Unknown MCP tool: ${name}`));
    const toolName = name as ToolName;
    try {
      assertMcpRequestSize(args);
    } catch (error) {
      return errorEnvelope(commandForTool(name), error);
    }
    const parsed = validators[toolName].safeParse(args);
    if (!parsed.success)
      return validationEnvelope(
        name,
        parsed.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        }))
      );
    const data = { ...(parsed.data as Record<string, unknown>) };
    try {
      // Every path argument becomes the canonical absolute path checked here, so
      // the CLI acts on exactly the file that passed the workspace policy.
      if (toolName === 'iterate' || toolName === 'screenshot' || toolName === 'promote') {
        data.dir = canonical(data.dir);
      }
      if (toolName === 'iterate') data.patchFile = canonical(data.patchFile);
      if (toolName === 'validate_blueprint') data.file = canonical(data.file);
      if (toolName === 'quick' && data.blueprint) data.blueprint = canonical(data.blueprint);
    } catch (error) {
      return errorEnvelope(commandForTool(name), error);
    }
    try {
      if (toolName === 'blueprint_schema') {
        const schema = await withMcpTimeout(() => blueprintSchemaEnvelope(loadSchema), timeoutMs);
        assertMcpOutputSize(schema);
        return sanitizeMcpEnvelope(schema);
      }
      const result = await withMcpTimeout(
        () =>
          invokeCli(
            toolName === 'doctor' && data.offline === false ? ['doctor'] : cliArgs(toolName, data)
          ),
        timeoutMs
      );
      assertMcpOutputSize(result);
      return sanitizeMcpEnvelope(result);
    } catch (error) {
      return errorEnvelope(commandForTool(name), error);
    }
  };
}

export const callMcpTool = createMcpToolHandler();
