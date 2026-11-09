import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import { checkSlug } from '@protoyard/core';
import { z } from 'zod';
import { CliError, type Envelope, errorEnvelope } from '../lib/output.ts';
import { hasControlCharacter } from '../lib/paths.ts';
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
  | 'doctor'
  | 'ds_create'
  | 'ds_validate'
  | 'ds_export'
  | 'ds_use'
  | 'ds_component_request'
  | 'ds_component_new';

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

/** One `ds new` input: a single line, so it cannot become another brand clause or option. */
const dsText = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((value) => !/[\r\n]/.test(value), 'Use one line.');
/** A workspace path: no control characters or line separators (they could end a generated comment). */
const dsPath = z
  .string()
  .min(1)
  .max(2048)
  .refine((value) => !hasControlCharacter(value), 'Use a plain path.');
const dsId = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/, 'Use a lowercase kebab-case id.');
const dsCreateArgs = z
  .object({
    id: dsId,
    name: dsText(80).optional(),
    brief: dsText(2048).optional(),
    brand: dsText(64).optional(),
    secondary: dsText(64).optional(),
    accent: dsText(64).optional(),
    font: dsText(120).optional(),
    headingFont: dsText(120).optional(),
    monoFont: dsText(120).optional(),
    shape: z.enum(['sharp', 'rounded', 'pill']).optional(),
    radius: z.number().min(0).max(64).optional(),
    density: z.enum(['dense', 'compact', 'comfortable', 'spacious']).optional(),
    motion: z.enum(['none', 'subtle', 'standard', 'expressive']).optional(),
    contrast: z.enum(['AA', 'AAA']).optional(),
    fromTheme: dsId.optional(),
    out: dsPath.optional(),
    force: z.boolean().optional(),
    dryRun: z.boolean().optional(),
  })
  .strict();
const dsFileArgs = z.object({ file: dsPath }).strict();
const dsExportArgs = z
  .object({
    file: dsPath,
    format: z.enum(['css', 'tailwind', 'json']).optional(),
  })
  .strict();
const dsUseArgs = z
  .object({
    slug: slugArg,
    file: dsPath,
    lock: z.boolean().optional(),
    upgrade: z.boolean().optional(),
    force: z.boolean().optional(),
    dryRun: z.boolean().optional(),
  })
  .strict();
/** A design-system component name (PascalCase), as `ds component` checks it. */
const dsComponentName = z
  .string()
  .regex(/^[A-Z][A-Za-z0-9]{0,63}$/, 'Use a PascalCase component name, e.g. StatusPill.');
/** One line of human text: no control characters or line separators. */
const dsLine = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((value) => !hasControlCharacter(value), 'Use one line without control characters.');
const dsComponentRequestArgs = z
  .object({
    id: dsId,
    name: dsComponentName,
    purpose: dsLine(280),
    why: dsLine(1000),
    by: dsLine(120).optional(),
  })
  .strict();
const dsComponentNewArgs = z
  .object({
    id: dsId,
    name: dsComponentName,
    prototype: slugArg.optional(),
  })
  .strict();
/**
 * The agent rule both component tools repeat: an agent never invents a
 * component; it stops and asks, and approvals stay with a human (there is no
 * approve-request tool).
 */
const DS_COMPONENT_RULE =
  'If no design-system component fits, stop and ask the human first: the name, the purpose, and why the existing components do not fit. Only after they agree, record the request; a human approves it with `protoyard ds component approve-request` (no tool does that), and only then scaffold it. Never style controls locally in a locked prototype: `protoyard check ds` fails the build.';
const DS_CREATE_TEXT = {
  name: 80,
  brief: 2048,
  brand: 64,
  secondary: 64,
  accent: 64,
  font: 120,
  headingFont: 120,
  monoFont: 120,
} as const;
const DS_FLAGS: Record<string, string> = {
  name: '--name',
  brief: '--brief',
  brand: '--brand',
  secondary: '--secondary',
  accent: '--accent',
  font: '--font',
  headingFont: '--heading-font',
  monoFont: '--mono-font',
  shape: '--shape',
  radius: '--radius',
  density: '--density',
  motion: '--motion',
  contrast: '--contrast',
  fromTheme: '--from-theme',
  out: '--out',
};

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
  ds_create: {
    name: 'ds_create',
    description:
      'Create a Texuli design system from a brief, a few inputs (brand color, fonts, shape, density, motion) or a Protoyard theme; validates, compiles and writes design-systems/<id>/ (document.json, a draft approval.json and components.json).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', pattern: '^[a-z][a-z0-9-]{0,63}$' },
        ...Object.fromEntries(
          Object.entries(DS_CREATE_TEXT).map(([key, max]) => [
            key,
            { type: 'string', minLength: 1, maxLength: max },
          ])
        ),
        shape: { type: 'string', enum: ['sharp', 'rounded', 'pill'] },
        radius: { type: 'number', minimum: 0, maximum: 64 },
        density: { type: 'string', enum: ['dense', 'compact', 'comfortable', 'spacious'] },
        motion: { type: 'string', enum: ['none', 'subtle', 'standard', 'expressive'] },
        contrast: { type: 'string', enum: ['AA', 'AAA'] },
        fromTheme: { type: 'string', pattern: '^[a-z][a-z0-9-]{0,63}$' },
        out: { type: 'string', minLength: 1, maxLength: 2048 },
        force: { type: 'boolean' },
        dryRun: { type: 'boolean' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  ds_validate: {
    name: 'ds_validate',
    description:
      'Validate an untrusted Texuli design-system document and compile it (contrast report, hash).',
    inputSchema: {
      type: 'object',
      properties: { file: { type: 'string', minLength: 1, maxLength: 2048 } },
      required: ['file'],
      additionalProperties: false,
    },
  },
  ds_export: {
    name: 'ds_export',
    description: 'Export a design system as CSS variables, a Tailwind preset or compiled JSON.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', minLength: 1, maxLength: 2048 },
        format: { type: 'string', enum: ['css', 'tailwind', 'json'] },
      },
      required: ['file'],
      additionalProperties: false,
    },
  },
  ds_use: {
    name: 'ds_use',
    description:
      'Apply a design system (its id or document file) to a prototype: writes src/design-system.ts, adds it to definePrototype({ themes }) and sets defaultTheme. lock binds the prototype to an approved design system at its exact version; upgrade moves an existing binding and lists what changed.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', minLength: 1, maxLength: 80 },
        file: { type: 'string', minLength: 1, maxLength: 2048 },
        lock: { type: 'boolean' },
        upgrade: { type: 'boolean' },
        force: { type: 'boolean' },
        dryRun: { type: 'boolean' },
      },
      required: ['slug', 'file'],
      additionalProperties: false,
    },
  },
  ds_component_request: {
    name: 'ds_component_request',
    description: `Record a request for a new component in a design-system folder (design-systems/<id>/requests/<Name>.json, status open). Writes no code. Refuses an existing component, an open or approved request with the same name, a flat or unknown design system, and text with control characters. ${DS_COMPONENT_RULE}`,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', pattern: '^[a-z][a-z0-9-]{0,63}$' },
        name: { type: 'string', pattern: '^[A-Z][A-Za-z0-9]{0,63}$' },
        purpose: { type: 'string', minLength: 1, maxLength: 280 },
        why: { type: 'string', minLength: 1, maxLength: 1000 },
        by: { type: 'string', minLength: 1, maxLength: 120 },
      },
      required: ['id', 'name', 'purpose', 'why'],
      additionalProperties: false,
    },
  },
  ds_component_new: {
    name: 'ds_component_new',
    description: `Scaffold a design-system component whose request a human approved: components/<Name>.svelte from Texuli components with layout classes only (passes check ds), a draft components.json entry with its sha256, and a kit story stub. Refuses without an approved request, for a locked prototype target, from inside a prototype folder, and for an existing component. ${DS_COMPONENT_RULE}`,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', pattern: '^[a-z][a-z0-9-]{0,63}$' },
        name: { type: 'string', pattern: '^[A-Z][A-Za-z0-9]{0,63}$' },
        prototype: { type: 'string', minLength: 1, maxLength: 80 },
      },
      required: ['id', 'name'],
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
  ds_create: dsCreateArgs,
  ds_validate: dsFileArgs,
  ds_export: dsExportArgs,
  ds_use: dsUseArgs,
  ds_component_request: dsComponentRequestArgs,
  ds_component_new: dsComponentNewArgs,
};

function commandForTool(name: string): string {
  if (name === 'validate_blueprint') return 'blueprint validate';
  if (name === 'blueprint_schema') return 'blueprint_schema';
  if (name === 'iterate' || name === 'promote' || name === 'screenshot') return 'quick';
  if (name === 'ds_create') return 'ds new';
  if (name === 'ds_component_request') return 'ds component request';
  if (name === 'ds_component_new') return 'ds component new';
  if (name.startsWith('ds_')) return `ds ${name.slice(3)}`;
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
  if (name === 'ds_create') {
    // `--flag=value`, so a value that starts with `-` stays the option's value.
    const options = Object.entries(DS_FLAGS).flatMap(([key, flag]) =>
      value[key] === undefined ? [] : [`${flag}=${String(value[key])}`]
    );
    if (value.force) options.push('--force');
    if (value.dryRun) options.push('--dry-run');
    return command(['ds', 'new'], options, [String(value.id)]);
  }
  if (name === 'ds_validate') return command(['ds', 'validate'], [], [String(value.file)]);
  if (name === 'ds_export') {
    return command(['ds', 'export'], value.format ? [`--format=${String(value.format)}`] : [], [
      String(value.file),
    ]);
  }
  if (name === 'ds_use') {
    return command(
      ['ds', 'use'],
      [
        ...(value.lock ? ['--lock'] : []),
        ...(value.upgrade ? ['--upgrade'] : []),
        ...(value.force ? ['--force'] : []),
        ...(value.dryRun ? ['--dry-run'] : []),
      ],
      [String(value.slug), String(value.file)]
    );
  }
  if (name === 'ds_component_request') {
    return command(
      ['ds', 'component', 'request'],
      [
        `--purpose=${String(value.purpose)}`,
        `--why=${String(value.why)}`,
        ...(value.by === undefined ? [] : [`--by=${String(value.by)}`]),
      ],
      [String(value.id), String(value.name)]
    );
  }
  if (name === 'ds_component_new') {
    return command(
      ['ds', 'component', 'new'],
      value.prototype === undefined ? [] : [`--prototype=${String(value.prototype)}`],
      [String(value.id), String(value.name)]
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
      if (toolName === 'ds_validate' || toolName === 'ds_export' || toolName === 'ds_use') {
        // A bare design-system id (design-systems/<id>/) stays an id; a path
        // becomes the canonical absolute path.
        if (!/^[a-z][a-z0-9-]{0,63}$/.test(String(data.file))) data.file = canonical(data.file);
      }
      if (toolName === 'ds_create' && data.out) data.out = canonical(data.out);
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
