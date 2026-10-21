// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { type CliNode, type CliTree, cliTree } from '../../../scripts/check-skill-cli.ts';
import {
  checkCommands,
  checkLocalPaths,
  checkMcpDoc,
  INTEGRATION_DOCS,
  integrationDocs,
  type McpToolLike,
  validateIntegrations,
} from '../../../scripts/validate-integrations.ts';
import { MCP_TOOLS } from '../src/mcp/tools.ts';
import { createProgram } from '../src/program.ts';

/**
 * Integration recipes stay runnable: every `protoyard` command and flag in
 * the interface, MCP, DWP guides and the addon packet (its SKILL, SPEC,
 * handoff and exploration templates, including the gates) exists in the real
 * CLI; docs/MCP.md matches the MCP server's tools; and no integration file
 * names an absolute local path. Removing a documented command or flag fails
 * with the file and line of every recipe that uses it.
 */

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const realTree = () => cliTree(createProgram({ setExitCode: () => {} }));

/** A copy of the real tree with one command path removed. */
function withoutCommand(tree: CliTree, path: string): CliTree {
  const paths = new Map(tree.paths);
  for (const key of [...paths.keys()]) {
    if (key === path || key.startsWith(`${path} `)) paths.delete(key);
  }
  const parentPath = path.split(' ').slice(0, -1).join(' ');
  const name = path.split(' ').at(-1) as string;
  const parent = parentPath ? tree.paths.get(parentPath) : tree.root;
  const copy = (node: CliNode): CliNode => ({ ...node, subcommands: new Map(node.subcommands) });
  const root = parent === tree.root ? copy(tree.root) : tree.root;
  if (parent && parent !== tree.root) {
    const replaced = copy(parent);
    replaced.subcommands.delete(name);
    paths.set(parentPath, replaced);
    // Re-link the replaced parent under its own parent so walks see it.
    const grand = parentPath.split(' ').slice(0, -1).join(' ');
    const grandNode = grand ? paths.get(grand) : root;
    grandNode?.subcommands.set(parentPath.split(' ').at(-1) as string, replaced);
  } else {
    root.subcommands.delete(name);
  }
  return { root, paths };
}

/** A copy of the real tree where `path` no longer accepts `flag`. */
function withoutFlag(tree: CliTree, path: string, flag: string): CliTree {
  const node = tree.paths.get(path);
  if (!node) throw new Error(`no command ${path}`);
  const replaced: CliNode = {
    ...node,
    flags: new Set([...node.flags].filter((f) => f !== flag)),
    longs: new Set([...node.longs].filter((f) => f !== flag)),
  };
  const paths = new Map(tree.paths);
  paths.set(path, replaced);
  const parentPath = path.split(' ').slice(0, -1).join(' ');
  const parent = parentPath ? paths.get(parentPath) : tree.root;
  const parentCopy: CliNode = { ...(parent as CliNode), subcommands: new Map(parent?.subcommands) };
  parentCopy.subcommands.set(path.split(' ').at(-1) as string, replaced);
  if (parentPath) paths.set(parentPath, parentCopy);
  return { root: parentPath ? tree.root : parentCopy, paths };
}

const filesOf = (issues: { file: string }[]) =>
  [...new Set(issues.map((issue) => issue.file))].sort();

describe('integration recipes against the real CLI', () => {
  it('pass today, over the guides and every Markdown file in the addon packet', () => {
    const docs = integrationDocs(REPO);
    for (const doc of INTEGRATION_DOCS) expect(docs).toContain(doc);
    expect(docs).toContain('integrations/deepworkplan/protoyard/templates/EXPLORATION_GATES.md');
    expect(docs).toContain('integrations/deepworkplan/protoyard/templates/EXPLORATION_TASK.md');
    expect(docs).toContain('integrations/deepworkplan/protoyard/SKILL.md');
    expect(validateIntegrations(REPO, realTree(), MCP_TOOLS)).toEqual([]);
  });

  it('fail, path by path, when a documented subcommand is removed', () => {
    const issues = validateIntegrations(REPO, withoutCommand(realTree(), 'quick shot'), MCP_TOOLS);
    expect(filesOf(issues)).toEqual(
      expect.arrayContaining([
        'docs/DWP.md',
        'integrations/deepworkplan/protoyard/templates/EXPLORATION_GATES.md',
      ])
    );
    for (const issue of issues) {
      expect(issue.message).toBe('unknown command `protoyard quick shot`');
      expect(issue.line).toBeGreaterThan(0);
    }
  });

  it('fail when a documented flag is removed', () => {
    const issues = validateIntegrations(
      REPO,
      withoutFlag(realTree(), 'quick', '--variants'),
      MCP_TOOLS
    );
    expect(filesOf(issues)).toEqual(
      expect.arrayContaining([
        'docs/DWP.md',
        'integrations/deepworkplan/protoyard/templates/EXPLORATION_GATES.md',
        'integrations/deepworkplan/protoyard/templates/EXPLORATION_TASK.md',
      ])
    );
    expect(new Set(issues.map((issue) => issue.message))).toEqual(
      new Set(['`protoyard quick` has no option --variants'])
    );
  });

  it('fail when a top-level command the interface relies on is removed', () => {
    const issues = validateIntegrations(REPO, withoutCommand(realTree(), 'doctor'), MCP_TOOLS);
    expect(filesOf(issues)).toEqual(
      expect.arrayContaining(['docs/INTERFACE.md', 'integrations/deepworkplan/protoyard/SKILL.md'])
    );
  });

  it('read commands from shell branches and continuations, and skip other tools', () => {
    const tree = realTree();
    const markdown = [
      '```bash',
      'set -eu',
      'if [ "{{INPUT_KIND}}" = blueprint ]; then',
      '  protoyard quick --blueprint "{{INPUT}}" --slug "{{SLUG}}" \\',
      '    --variants "{{VARIANT_COUNT}}" --frobnicate --json \\',
      '    > "{{SCRATCH_DIR}}/envelope.json"',
      'fi',
      'node -e "process.exit(0)" --frobnicate',
      'git status --porcelain=v1',
      '```',
    ].join('\n');
    expect(checkCommands(tree, markdown, 'gates.md')).toEqual([
      { file: 'gates.md', line: 4, message: '`protoyard quick` has no option --frobnicate' },
    ]);
  });
});

describe('docs/MCP.md against the MCP tools', () => {
  const tools: McpToolLike[] = [
    { name: 'quick', inputSchema: { properties: { brief: {}, seed: {} } } },
    { name: 'doctor', inputSchema: { properties: { offline: {} } } },
  ];
  const doc = (rows: string[], examples: string[] = []) =>
    [
      '# MCP',
      '',
      '## Tools',
      '',
      '| Tool | Arguments | Behavior |',
      '| --- | --- | --- |',
      ...rows,
      '',
      '## Examples',
      ...examples,
    ].join('\n');
  const good = [
    '| `quick` | Optional `brief` (1–65,536 characters) and `seed` (integer) | Create. |',
    '| `doctor` | Optional `offline` (boolean) | Check. |',
  ];

  it('accepts a table and examples that match the registry', () => {
    const call = JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'quick', arguments: { brief: 'x', seed: 1 } },
    });
    expect(checkMcpDoc(tools, doc(good, [call]), 'mcp.md')).toEqual([]);
  });

  it('reports unknown and missing tools and arguments, and bad examples', () => {
    const call = JSON.stringify({
      method: 'tools/call',
      params: { name: 'quick', arguments: { prompt: 'x' } },
    });
    const ghost = JSON.stringify({ method: 'tools/call', params: { name: 'deploy' } });
    const issues = checkMcpDoc(
      tools,
      doc(
        [
          '| `quick` | Optional `brief` and `variants` | Create. |',
          '| `deploy` | No arguments | Ship. |',
        ],
        [call, ghost]
      ),
      'mcp.md'
    ).map((issue) => issue.message);
    expect(issues).toEqual([
      'MCP tool `quick` has no argument `variants`',
      'MCP tool `quick` row is missing its argument `seed`',
      'MCP tool `deploy` is not registered',
      'MCP tool `doctor` is not documented',
      'tools/call example passes unknown argument `prompt` to `quick`',
      'tools/call example names unknown tool `deploy`',
    ]);
  });

  it('matches the real server: removing a tool or an argument fails', () => {
    const real = MCP_TOOLS as readonly McpToolLike[];
    const markdownIssues = (tools: readonly McpToolLike[]) =>
      validateIntegrations(REPO, realTree(), tools).filter((issue) => issue.file === 'docs/MCP.md');
    expect(markdownIssues(real)).toEqual([]);
    expect(markdownIssues(real.filter((tool) => tool.name !== 'promote'))).toEqual([
      expect.objectContaining({ message: 'MCP tool `promote` is not registered' }),
    ]);
    const quick = real.find((tool) => tool.name === 'quick') as McpToolLike;
    const { variants: _dropped, ...rest } = quick.inputSchema.properties ?? {};
    const issues = markdownIssues(
      real.map((tool) => (tool === quick ? { ...quick, inputSchema: { properties: rest } } : tool))
    ).map((issue) => issue.message);
    expect(issues).toContain('MCP tool `quick` has no argument `variants`');
    expect(issues).toContain('tools/call example passes unknown argument `variants` to `quick`');
  });
});

describe('absolute local paths', () => {
  // Built at runtime so this file itself names no local path.
  const home = ['', 'Users', 'example-person'].join('/');
  const linuxHome = ['', 'home', 'example-person'].join('/');

  it('are reported with file and line, wherever they appear', () => {
    const text = [
      'Install the pack, then run it.',
      `Checked out in ${home}/projects/protoyard.`,
      `{"path": "${linuxHome}/work"}`,
      'A relative path: integrations/deepworkplan/protoyard/SKILL.md',
      'The URL https://github.com/DailybotHQ/protoyard/tree/main/docs is fine.',
    ].join('\n');
    expect(checkLocalPaths(text, 'notes.md')).toEqual([
      expect.objectContaining({ file: 'notes.md', line: 2 }),
      expect.objectContaining({ file: 'notes.md', line: 3 }),
    ]);
  });

  it('appear nowhere under integrations/ today (docs, descriptor and fixtures)', () => {
    expect(
      validateIntegrations(REPO, realTree(), MCP_TOOLS).filter((issue) =>
        issue.message.startsWith('absolute local path')
      )
    ).toEqual([]);
  });
});
