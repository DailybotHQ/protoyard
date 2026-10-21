// @vitest-environment node
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { cliTree } from '../../../scripts/check-skill-cli.ts';
import {
  ADDON_FILES,
  ADDON_PACKET,
  checkArtifacts,
  checkDescriptor,
  checkLinks,
  checkTestReport,
  DESCRIPTOR_SCHEMA,
  INTEGRATIONS_DIR,
  integrationTestFiles,
  validateIntegrations,
} from '../../../scripts/validate-integrations.ts';
import { MCP_TOOLS } from '../src/mcp/tools.ts';
import { createProgram } from '../src/program.ts';

/**
 * The integration surface gate (`scripts/validate-integrations.ts`, `pnpm
 * check:integrations [-- --run-tests]`): the addon packet and its JSON, the
 * descriptor against the vendored DWP schema, links, commands and MCP tools
 * in the docs, and the integration test files, which must each select and
 * pass at least one test.
 */

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/** A disposable copy of the integration files the artifact check reads. */
function copyOfIntegrations(): string {
  const root = mkdtempSync(join(tmpdir(), 'protoyard-integration-surface-'));
  roots.push(root);
  cpSync(join(REPO, INTEGRATIONS_DIR), join(root, INTEGRATIONS_DIR), { recursive: true });
  mkdirSync(join(root, DESCRIPTOR_SCHEMA, '..'), { recursive: true });
  cpSync(join(REPO, DESCRIPTOR_SCHEMA), join(root, DESCRIPTOR_SCHEMA));
  return root;
}

const descriptor = () =>
  JSON.parse(readFileSync(join(REPO, ADDON_PACKET, 'addon.json'), 'utf8')) as Record<
    string,
    unknown
  >;
const schema = () => JSON.parse(readFileSync(join(REPO, DESCRIPTOR_SCHEMA), 'utf8'));

describe('the whole integration surface', () => {
  it('passes on this repository: commands, MCP tools, paths, links and artifacts', () => {
    const tree = cliTree(createProgram({ setExitCode: () => {} }));
    expect(validateIntegrations(REPO, tree, MCP_TOOLS)).toEqual([]);
  });

  it('finds every integration test file by its name, each with tests in it', () => {
    const files = integrationTestFiles(REPO);
    for (const expected of [
      'packages/cli/tests/interface.test.ts',
      'packages/cli/tests/interface-compat.test.ts',
      'packages/cli/tests/interface-policy.test.ts',
      'packages/cli/tests/version-interface.test.ts',
      'packages/cli/tests/mcp.test.ts',
      'packages/cli/tests/mcp-tools.test.ts',
      'packages/cli/tests/dwp-addon.test.ts',
      'packages/cli/tests/dwp-docs.test.ts',
      'packages/cli/tests/integration-command-drift.test.ts',
      'packages/cli/tests/integration-surface.test.ts',
      'tests/integration/dwp-loop.test.ts',
      'tests/integration/dwp-loop-isolation.test.ts',
    ]) {
      expect(files, expected).toContain(expected);
    }
    // Statically non-empty: every file declares at least one test.
    for (const file of files) {
      expect(readFileSync(join(REPO, file), 'utf8'), file).toMatch(/\bit(?:\.each\([\s\S]*?\))?\(/);
    }
  });
});

describe('checkArtifacts', () => {
  it('accepts the shipped packet', () => {
    expect(checkArtifacts(copyOfIntegrations())).toEqual([]);
  });

  it('reports a missing packet file, broken JSON and a descriptor off the schema', () => {
    const root = copyOfIntegrations();
    rmSync(join(root, ADDON_PACKET, ADDON_FILES[5] as string));
    writeFileSync(
      join(root, ADDON_PACKET, 'test-fixtures', 'interface-1.json'),
      '{"interface": 1,'
    );
    writeFileSync(
      join(root, ADDON_PACKET, 'addon.json'),
      JSON.stringify({ ...descriptor(), key: 'Protoyard!' })
    );
    expect(checkArtifacts(root).map((issue) => [issue.file, issue.message.split(' (')[0]])).toEqual(
      [
        [`${ADDON_PACKET}/${ADDON_FILES[5]}`, 'missing or empty addon packet file'],
        [`${ADDON_PACKET}/test-fixtures/interface-1.json`, 'not valid JSON'],
        [
          `${ADDON_PACKET}/addon.json`,
          `addon.json.key does not match ${schema().properties.key.pattern}`,
        ],
      ]
    );
  });
});

describe('checkDescriptor', () => {
  it('accepts the shipped descriptor', () => {
    expect(checkDescriptor(descriptor(), schema(), 'addon.json')).toEqual([]);
  });

  it('rejects unknown and missing keys, bad patterns, constants and enum values', () => {
    const bad = descriptor();
    bad.extra = true;
    delete bad.detect;
    bad.schema = 'https://example.com/other.json';
    bad.product = { ...(bad.product as object), tag: 'main' };
    bad.requires_grants = ['gate_command_exec', 'root_access'];
    expect(checkDescriptor(bad, schema(), 'addon.json').map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        'addon.json.detect is required',
        'addon.json.extra is not allowed (closed object)',
        'addon.json.schema must be "https://deepworkplan.com/schema/addon-descriptor/v1.json"',
        expect.stringMatching(/^addon\.json\.product\.tag does not match/),
        'addon.json.requires_grants has an unknown value "root_access"',
      ])
    );
  });
});

describe('checkLinks', () => {
  it('reports only relative links that do not resolve', () => {
    const root = copyOfIntegrations();
    const markdown = [
      '[packet](integrations/deepworkplan/protoyard/SPEC.md#abstract)',
      '[site](https://protoyard.app/docs/) and [mail](mailto:team@example.com)',
      '[gone](integrations/deepworkplan/protoyard/MISSING.md)',
    ].join('\n');
    expect(checkLinks(root, 'guide.md', markdown)).toEqual([
      {
        file: 'guide.md',
        line: 3,
        message: 'broken link integrations/deepworkplan/protoyard/MISSING.md',
      },
    ]);
  });
});

describe('checkTestReport', () => {
  const files = ['packages/cli/tests/a.test.ts', 'tests/integration/b.test.ts'];
  const result = (file: string, statuses: string[]) => ({
    name: join(REPO, file),
    assertionResults: statuses.map((status) => ({ status })),
  });

  it('passes when every file ran passing tests', () => {
    const report = { testResults: files.map((file) => result(file, ['passed', 'skipped'])) };
    expect(checkTestReport(REPO, files, report)).toEqual([]);
  });

  it('fails a file that was not run, selected nothing, or failed a test', () => {
    expect(checkTestReport(REPO, files, { testResults: [result(files[0] as string, [])] })).toEqual(
      [
        { file: files[0], line: 1, message: 'ran no passing test (empty selection)' },
        { file: files[1], line: 1, message: 'was not run (no tests selected)' },
      ]
    );
    expect(
      checkTestReport(REPO, files, {
        testResults: [
          result(files[0] as string, ['passed', 'failed']),
          result(files[1] as string, ['skipped']),
        ],
      }).map((issue) => issue.message)
    ).toEqual(['1 test(s) failed', 'ran no passing test (empty selection)']);
  });
});
