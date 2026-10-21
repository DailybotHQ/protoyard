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
 * Exits 1 with `file:line: message` for each issue.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
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
  return issues;
}

async function main(): Promise<number> {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const { createProgram } = await import('../packages/cli/src/program.ts');
  const { MCP_TOOLS } = await import('../packages/cli/src/mcp/tools.ts');
  const tree = cliTree(createProgram({ setExitCode: () => {} }) as CommandLike);
  const issues = validateIntegrations(root, tree, MCP_TOOLS);
  for (const issue of issues) console.log(`${issue.file}:${issue.line}: ${issue.message}`);
  if (issues.length > 0) {
    console.log(`FAIL: ${issues.length} integration recipe issue(s)`);
    return 1;
  }
  console.log(
    `OK: ${integrationDocs(root).length} integration docs match the CLI (${tree.paths.size} commands) and the MCP tools (${MCP_TOOLS.length})`
  );
  return 0;
}

const entry = process.argv[1] ? resolve(process.argv[1]) : '';
if (entry === resolve(fileURLToPath(import.meta.url))) process.exitCode = await main();
