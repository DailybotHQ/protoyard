import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { z } from 'zod';
import { CliError, type Envelope, errorEnvelope } from '../lib/output.ts';
import type { McpTool } from './stdio.ts';

type ToolName =
  | 'quick'
  | 'iterate'
  | 'validate_blueprint'
  | 'blueprint_schema'
  | 'screenshot'
  | 'promote'
  | 'doctor';

const quickArgs = z
  .object({
    brief: z.string().min(1).max(65_536).optional(),
    blueprint: z.string().min(1).max(2048).optional(),
    slug: z.string().min(1).max(80).optional(),
    name: z.string().min(1).max(120).optional(),
    seed: z.number().int().min(0).max(4_294_967_295).optional(),
    variants: z.number().int().min(1).max(8).optional(),
    standalone: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Boolean(value.brief) !== Boolean(value.blueprint), {
    message: 'Provide exactly one of brief or blueprint.',
  });
const iterateArgs = z
  .object({
    dir: z.string().min(1).max(2048),
    patchFile: z.string().min(1).max(2048),
    allowDrop: z.boolean().optional(),
  })
  .strict();
const validateArgs = z.object({ file: z.string().min(1).max(2048) }).strict();
const emptyArgs = z.object({}).strict();
const screenshotArgs = z.object({ dir: z.string().min(1).max(2048) }).strict();
const promoteArgs = z
  .object({
    dir: z.string().min(1).max(2048),
    slug: z.string().min(1).max(80),
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

function cliArgs(name: ToolName, value: Record<string, unknown>): string[] {
  if (name === 'quick') {
    const args = value.brief ? ['quick', '--', String(value.brief)] : ['quick'];
    if (value.blueprint) args.push('--blueprint', String(value.blueprint));
    if (value.slug) args.push('--slug', String(value.slug));
    if (value.name) args.push('--name', String(value.name));
    if (value.seed !== undefined) args.push('--seed', String(value.seed));
    if (value.variants !== undefined) args.push('--variants', String(value.variants));
    if (value.standalone) args.push('--standalone');
    return args;
  }
  if (name === 'iterate') {
    return [
      'quick',
      'iterate',
      String(value.dir),
      '--patch',
      String(value.patchFile),
      ...(value.allowDrop ? ['--allow-drop'] : []),
    ];
  }
  if (name === 'validate_blueprint') return ['blueprint', 'validate', String(value.file)];
  if (name === 'screenshot') return ['quick', 'shot', String(value.dir)];
  if (name === 'promote') {
    return [
      'quick',
      'promote',
      String(value.dir),
      String(value.slug),
      ...(value.variant ? ['--variant', String(value.variant)] : []),
      ...(value.noInstall ? ['--no-install'] : []),
    ];
  }
  return ['doctor', '--offline'];
}

async function runCliEnvelope(args: string[]): Promise<Envelope> {
  let stdout = '';
  let exitCode = 0;
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
    if (typeof parsed === 'object' && parsed !== null && 'ok' in parsed && 'command' in parsed)
      return parsed as Envelope;
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
}

export function createMcpToolHandler(options: McpToolHandlerOptions = {}) {
  const invokeCli = options.runCli ?? runCliEnvelope;
  const loadSchema = options.loadSchema ?? loadBlueprintSchema;

  return async (name: string, args: Record<string, unknown>): Promise<Envelope> => {
    if (!Object.hasOwn(validators, name))
      return errorEnvelope('mcp', new CliError('not_found', `Unknown MCP tool: ${name}`));
    const toolName = name as ToolName;
    const parsed = validators[toolName].safeParse(args);
    if (!parsed.success)
      return validationEnvelope(
        name,
        parsed.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        }))
      );
    if (toolName === 'blueprint_schema') return blueprintSchemaEnvelope(loadSchema);
    const data = parsed.data as Record<string, unknown>;
    if (toolName === 'doctor' && data.offline === false) return invokeCli(['doctor']);
    return invokeCli(cliArgs(toolName, data));
  };
}

export const callMcpTool = createMcpToolHandler();
