/**
 * Checks the integration recipes against the real Protoyard CLI.
 *
 *   pnpm exec tsx scripts/validate-integrations.ts
 *
 * Every `protoyard …` / `pnpm protoyard …` command in the integration docs —
 * docs/INTERFACE.md, docs/MCP.md, docs/DWP.md and every Markdown file under
 * integrations/ — must name a real command path and only flags it (or the
 * global options) accepts. The truth source is the command tree `protoyard
 * --help` prints, read from createProgram(); the extraction is the one the
 * skill check uses (scripts/check-skill-cli.ts), so shell fences, `\`
 * continuations, `if` branches and inline code all count, and sections whose
 * heading says planned or not implemented are skipped.
 *
 * docs/MCP.md is also checked against the MCP server's own tool registry
 * (`MCP_TOOLS`): its tool table lists exactly those tools with exactly their
 * argument names, and every `tools/call` example names a real tool with real
 * arguments.
 *
 * Every text file under integrations/ (docs, the descriptor, test fixtures)
 * must name no absolute local path (a home folder or a checkout location).
 *
 * The integration surface is checked as a whole too:
 * - the DWP addon packet has every file it ships, every JSON file under
 *   integrations/ parses, and `addon.json` follows the vendored DWP
 *   addon-descriptor v1 schema (closed keys, required keys, patterns, enums);
 * - every relative link in the integration docs resolves;
 * - the integration test files (interface, version, MCP, DWP and the
 *   integration tests) are found by naming pattern, so a new one joins the
 *   gate; with `--run-tests` they run in one Vitest run, and every file must
 *   select at least one test and fail none.
 *
 *   pnpm exec tsx scripts/validate-integrations.ts [--run-tests]
 *
 * Exits 1 with `file:line: message` for each issue.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type CliTree,
  type CommandLike,
  checkInvocation,
  cliTree,
  extractInvocations,
  type SkillCliIssue,
} from './check-skill-cli.ts';

export type IntegrationIssue = SkillCliIssue;

/** Docs outside integrations/ whose recipes the integrations rely on. */
export const INTEGRATION_DOCS = ['docs/INTERFACE.md', 'docs/MCP.md', 'docs/DWP.md'] as const;
export const INTEGRATIONS_DIR = 'integrations';

/** The parts of an MCP tool this check reads. */
export interface McpToolLike {
  name: string;
  inputSchema: { properties?: Record<string, unknown> };
}

const TEXT_FILE = /\.(?:md|json|ya?ml|py|ts|js|txt|sh)$/i;
/** A home folder or a typical local checkout prefix, after whitespace, a quote or a bracket. */
const ABSOLUTE_LOCAL_PATH =
  /(?:^|[\s"'`(=:[])(\/Users\/[A-Za-z0-9._-]+|\/home\/[A-Za-z0-9._-]+|[A-Za-z]:\\Users\\[A-Za-z0-9._-]+)/g;

function walk(dir: string, filter: (name: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path, filter));
    else if (filter(name)) out.push(path);
  }
  return out;
}

/** The Markdown files whose `protoyard` commands are checked, relative to `root`. */
export function integrationDocs(root: string): string[] {
  const integrations = join(root, INTEGRATIONS_DIR);
  return [
    ...INTEGRATION_DOCS,
    ...walk(integrations, (name) => name.endsWith('.md')).map((path) => relative(root, path)),
  ];
}

/** Command and flag drift in one Markdown text. */
export function checkCommands(tree: CliTree, markdown: string, file: string): IntegrationIssue[] {
  return extractInvocations(markdown, file).flatMap((invocation) =>
    checkInvocation(tree, invocation)
  );
}

/** Absolute local paths in one text. */
export function checkLocalPaths(text: string, file: string): IntegrationIssue[] {
  const issues: IntegrationIssue[] = [];
  text.split('\n').forEach((line, index) => {
    for (const match of line.matchAll(ABSOLUTE_LOCAL_PATH)) {
      issues.push({
        file,
        line: index + 1,
        message: `absolute local path ${match[1]}; name the repository or use a relative path`,
      });
    }
  });
  return issues;
}

/**
 * docs/MCP.md against the server's tools: the `## Tools` table lists exactly
 * the registered tools with exactly their argument names, and every
 * `tools/call` example names a real tool with real arguments.
 */
export function checkMcpDoc(
  tools: readonly McpToolLike[],
  markdown: string,
  file: string
): IntegrationIssue[] {
  const issues: IntegrationIssue[] = [];
  const at = (line: number, message: string) => issues.push({ file, line, message });
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const lines = markdown.split('\n');
  const start = lines.indexOf('## Tools');
  if (start < 0) {
    at(1, 'missing the "## Tools" section');
    return issues;
  }
  const documented = new Set<string>();
  for (let index = start + 1; index < lines.length; index += 1) {
    const text = lines[index] as string;
    if (text.startsWith('## ')) break;
    const row = /^\| `([a-z_]+)` \| ([^|]*) \|/.exec(text);
    if (!row) continue;
    const name = row[1] as string;
    documented.add(name);
    const tool = byName.get(name);
    if (!tool) {
      at(index + 1, `MCP tool \`${name}\` is not registered`);
      continue;
    }
    const properties = Object.keys(tool.inputSchema.properties ?? {});
    // Argument names are the backticked identifiers outside parentheses.
    const cell = (row[2] ?? '').replace(/\([^)]*\)/g, '');
    const named = new Set(
      [...cell.matchAll(/`([a-zA-Z][a-zA-Z0-9]*)`/g)].map((m) => m[1] as string)
    );
    for (const argument of named) {
      if (!properties.includes(argument))
        at(index + 1, `MCP tool \`${name}\` has no argument \`${argument}\``);
    }
    for (const property of properties) {
      if (!named.has(property))
        at(index + 1, `MCP tool \`${name}\` row is missing its argument \`${property}\``);
    }
  }
  for (const tool of tools) {
    if (!documented.has(tool.name)) at(start + 1, `MCP tool \`${tool.name}\` is not documented`);
  }
  lines.forEach((text, index) => {
    if (!text.includes('"tools/call"')) return;
    let call: { params?: { name?: unknown; arguments?: Record<string, unknown> } };
    try {
      call = JSON.parse(text) as typeof call;
    } catch {
      at(index + 1, 'a tools/call example is not one JSON line');
      return;
    }
    const tool = byName.get(String(call.params?.name));
    if (!tool) {
      at(index + 1, `tools/call example names unknown tool \`${String(call.params?.name)}\``);
      return;
    }
    const properties = Object.keys(tool.inputSchema.properties ?? {});
    for (const argument of Object.keys(call.params?.arguments ?? {})) {
      if (!properties.includes(argument))
        at(
          index + 1,
          `tools/call example passes unknown argument \`${argument}\` to \`${tool.name}\``
        );
    }
  });
  return issues;
}

/** The files the DWP addon packet ships, relative to the repository. */
export const ADDON_PACKET = 'integrations/deepworkplan/protoyard';
export const ADDON_FILES = [
  'addon.json',
  'SPEC.md',
  'SKILL.md',
  'UPSTREAM.md',
  'templates/EXPLORATION_TASK.md',
  'templates/EXPLORATION_GATES.md',
  'templates/SCREENSHOT_EVIDENCE.md',
  'templates/DECISION_REPORT.md',
] as const;
/** The vendored DWP addon-descriptor schema `addon.json` must follow. */
export const DESCRIPTOR_SCHEMA =
  '.agents/skills/deepworkplan/spec/schema/addon-descriptor-v1.schema.json';

interface SchemaNode {
  const?: unknown;
  pattern?: string;
  required?: string[];
  properties?: Record<string, SchemaNode>;
  items?: { enum?: string[] };
  enum?: string[];
}

/**
 * A descriptor against the subset of JSON Schema the DWP descriptor uses:
 * closed objects, required keys, `const`, string `pattern`s and enum items.
 */
export function checkDescriptor(
  descriptor: unknown,
  schema: SchemaNode,
  file: string
): IntegrationIssue[] {
  const issues: IntegrationIssue[] = [];
  const at = (message: string) => issues.push({ file, line: 1, message });
  const visit = (value: unknown, node: SchemaNode, path: string) => {
    if (node.const !== undefined && value !== node.const)
      at(`${path} must be ${JSON.stringify(node.const)}`);
    if (node.pattern !== undefined) {
      if (typeof value !== 'string' || !new RegExp(node.pattern).test(value))
        at(`${path} does not match ${node.pattern}`);
    }
    if (node.enum !== undefined && !node.enum.includes(value as string))
      at(`${path} must be one of ${node.enum.join(', ')}`);
    if (node.items?.enum !== undefined) {
      if (!Array.isArray(value)) at(`${path} must be an array`);
      else
        for (const item of value)
          if (!node.items.enum.includes(item))
            at(`${path} has an unknown value ${JSON.stringify(item)}`);
    }
    if (node.properties !== undefined) {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        at(`${path} must be an object`);
        return;
      }
      const record = value as Record<string, unknown>;
      for (const key of node.required ?? []) if (!(key in record)) at(`${path}.${key} is required`);
      for (const [key, child] of Object.entries(record)) {
        const childNode = node.properties[key];
        if (!childNode) at(`${path}.${key} is not allowed (closed object)`);
        else visit(child, childNode, `${path}.${key}`);
      }
    }
  };
  visit(descriptor, schema, 'addon.json');
  return issues;
}

/** The packet's files, every JSON file under integrations/, and the descriptor. */
export function checkArtifacts(root: string): IntegrationIssue[] {
  const issues: IntegrationIssue[] = [];
  for (const name of ADDON_FILES) {
    const file = `${ADDON_PACKET}/${name}`;
    const path = join(root, file);
    if (!existsSync(path) || statSync(path).size === 0)
      issues.push({ file, line: 1, message: 'missing or empty addon packet file' });
  }
  for (const path of walk(join(root, INTEGRATIONS_DIR), (name) => name.endsWith('.json'))) {
    const file = relative(root, path);
    try {
      JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
      issues.push({ file, line: 1, message: `not valid JSON (${(error as Error).message})` });
    }
  }
  const descriptorPath = join(root, ADDON_PACKET, 'addon.json');
  const schemaPath = join(root, DESCRIPTOR_SCHEMA);
  if (existsSync(descriptorPath) && existsSync(schemaPath)) {
    try {
      issues.push(
        ...checkDescriptor(
          JSON.parse(readFileSync(descriptorPath, 'utf8')),
          JSON.parse(readFileSync(schemaPath, 'utf8')) as SchemaNode,
          `${ADDON_PACKET}/addon.json`
        )
      );
    } catch {
      // Unparseable JSON is already reported above.
    }
  } else if (!existsSync(schemaPath)) {
    issues.push({
      file: DESCRIPTOR_SCHEMA,
      line: 1,
      message: 'the vendored descriptor schema is missing',
    });
  }
  return issues;
}

/** Relative Markdown links (`](path)`, `](path#anchor)`) that do not resolve. */
export function checkLinks(root: string, file: string, markdown: string): IntegrationIssue[] {
  const issues: IntegrationIssue[] = [];
  markdown.split('\n').forEach((text, index) => {
    for (const match of text.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
      const target = match[1] as string;
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue; // https:, mailto:
      if (!existsSync(resolve(dirname(join(root, file)), target)))
        issues.push({ file, line: index + 1, message: `broken link ${target}` });
    }
  });
  return issues;
}

/** Test files that belong to the integration surface, found by naming pattern. */
export const INTEGRATION_TEST_PATTERN =
  /^(?:interface|version-interface|mcp|dwp|integration)[a-z-]*\.test\.ts$/;
export function integrationTestFiles(root: string): string[] {
  const cli = readdirSync(join(root, 'packages', 'cli', 'tests'))
    .filter((name) => INTEGRATION_TEST_PATTERN.test(name))
    .map((name) => `packages/cli/tests/${name}`);
  const integration = existsSync(join(root, 'tests', 'integration'))
    ? readdirSync(join(root, 'tests', 'integration'))
        .filter((name) => name.endsWith('.test.ts'))
        .map((name) => `tests/integration/${name}`)
    : [];
  return [...cli, ...integration].sort();
}

/** The parts of a Vitest JSON report this gate reads. */
export interface VitestReport {
  testResults?: { name: string; assertionResults?: { status: string }[] }[];
}

/**
 * Every listed file must appear in the report, select at least one test that
 * ran (passed), and fail none. An empty selection is a failure, not a pass.
 */
export function checkTestReport(
  root: string,
  files: readonly string[],
  report: VitestReport
): IntegrationIssue[] {
  const issues: IntegrationIssue[] = [];
  const byFile = new Map(
    (report.testResults ?? []).map((result) => [relative(root, result.name), result])
  );
  for (const file of files) {
    const result = byFile.get(file);
    const statuses = result?.assertionResults?.map((assertion) => assertion.status) ?? [];
    const passed = statuses.filter((status) => status === 'passed').length;
    const failed = statuses.filter((status) => status === 'failed').length;
    if (!result) issues.push({ file, line: 1, message: 'was not run (no tests selected)' });
    else if (failed > 0) issues.push({ file, line: 1, message: `${failed} test(s) failed` });
    else if (passed === 0)
      issues.push({ file, line: 1, message: 'ran no passing test (empty selection)' });
  }
  return issues;
}

/** Runs the integration test files in one Vitest run and checks the report. */
export function runIntegrationTests(root: string, files: readonly string[]): IntegrationIssue[] {
  const dir = mkdtempSync(join(tmpdir(), 'protoyard-integration-report-'));
  const output = join(dir, 'report.json');
  try {
    const run = spawnSync(
      'pnpm',
      ['exec', 'vitest', 'run', ...files, '--reporter=json', `--outputFile=${output}`],
      { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: false }
    );
    if (!existsSync(output)) {
      return [
        {
          file: 'vitest',
          line: 1,
          message: `no report (exit ${run.status}): ${(run.stderr || run.stdout).slice(-400)}`,
        },
      ];
    }
    return checkTestReport(root, files, JSON.parse(readFileSync(output, 'utf8')) as VitestReport);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Every check over a repository root. */
export function validateIntegrations(
  root: string,
  tree: CliTree,
  tools: readonly McpToolLike[]
): IntegrationIssue[] {
  const issues: IntegrationIssue[] = [];
  for (const file of integrationDocs(root)) {
    const markdown = readFileSync(join(root, file), 'utf8');
    issues.push(...checkCommands(tree, markdown, file));
    if (file === 'docs/MCP.md') issues.push(...checkMcpDoc(tools, markdown, file));
  }
  for (const path of walk(join(root, INTEGRATIONS_DIR), (name) => TEXT_FILE.test(name))) {
    const file = relative(root, path);
    issues.push(...checkLocalPaths(readFileSync(path, 'utf8'), file));
  }
  for (const file of integrationDocs(root)) {
    issues.push(...checkLinks(root, file, readFileSync(join(root, file), 'utf8')));
  }
  issues.push(...checkArtifacts(root));
  return issues;
}

async function main(): Promise<number> {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const { createProgram } = await import('../packages/cli/src/program.ts');
  const { MCP_TOOLS } = await import('../packages/cli/src/mcp/tools.ts');
  const tree = cliTree(createProgram({ setExitCode: () => {} }) as CommandLike);
  const issues = validateIntegrations(root, tree, MCP_TOOLS);
  const tests = integrationTestFiles(root);
  if (process.argv.includes('--run-tests')) issues.push(...runIntegrationTests(root, tests));
  for (const issue of issues) console.log(`${issue.file}:${issue.line}: ${issue.message}`);
  if (issues.length > 0) {
    console.log(`FAIL: ${issues.length} integration issue(s)`);
    return 1;
  }
  console.log(
    `OK: ${integrationDocs(root).length} integration docs match the CLI (${tree.paths.size} commands) and the MCP tools (${MCP_TOOLS.length}); addon packet and links verified`
  );
  console.log(
    process.argv.includes('--run-tests')
      ? `OK: ${tests.length} integration test files ran, each with passing tests and no failures`
      : `${tests.length} integration test files in the surface (add --run-tests to run them)`
  );
  return 0;
}

const entry = process.argv[1] ? resolve(process.argv[1]) : '';
if (entry === resolve(fileURLToPath(import.meta.url))) process.exitCode = await main();
