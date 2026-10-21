/**
 * Measures local CLI startup and MCP startup/round-trip latency.
 *
 * Usage: pnpm exec tsx scripts/bench-integrations.ts [--runs 3]
 * Reports are written to tmp/bench-integrations-<timestamp>.json.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, freemem, platform, release, totalmem } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI_ENTRY = join(ROOT, 'packages/cli/src/bin.ts');
const REPORT_DIR = join(ROOT, 'tmp');
const PROTOCOL_VERSION = '2026-07-28';
const PROTOCOL_VERSION_KEY = 'io.modelcontextprotocol/protocolVersion';
const CHILD_TIMEOUT_MS = 30_000;

/** Median budgets for the complete local command and MCP request timings. */
export const INTEGRATION_BUDGETS_MS = Object.freeze({
  doctorStartup: 10_000,
  mcpStartup: 4_000,
  mcpRoundTrip: 5_000,
});

export interface IntegrationSamples {
  doctorStartup: number[];
  mcpStartup: number[];
  mcpRoundTrip: number[];
}

export function median(values: readonly number[]): number {
  if (values.length === 0 || values.some((value) => !Number.isFinite(value) || value < 0))
    throw new Error('Timing samples must be a non-empty list of finite non-negative numbers.');
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle];
  if (upper === undefined) throw new Error('Timing samples must not be empty.');
  if (sorted.length % 2 === 1) return upper;
  const lower = sorted[middle - 1];
  if (lower === undefined) throw new Error('Timing samples must not be empty.');
  return (lower + upper) / 2;
}

export function summarize(samples: IntegrationSamples) {
  return {
    doctorStartupMs: median(samples.doctorStartup),
    mcpStartupMs: median(samples.mcpStartup),
    mcpRoundTripMs: median(samples.mcpRoundTrip),
  };
}

export function budgetResults(summary: ReturnType<typeof summarize>) {
  return {
    doctorStartup: {
      medianMs: summary.doctorStartupMs,
      budgetMs: INTEGRATION_BUDGETS_MS.doctorStartup,
      withinBudget: summary.doctorStartupMs <= INTEGRATION_BUDGETS_MS.doctorStartup,
    },
    mcpStartup: {
      medianMs: summary.mcpStartupMs,
      budgetMs: INTEGRATION_BUDGETS_MS.mcpStartup,
      withinBudget: summary.mcpStartupMs <= INTEGRATION_BUDGETS_MS.mcpStartup,
    },
    mcpRoundTrip: {
      medianMs: summary.mcpRoundTripMs,
      budgetMs: INTEGRATION_BUDGETS_MS.mcpRoundTrip,
      withinBudget: summary.mcpRoundTripMs <= INTEGRATION_BUDGETS_MS.mcpRoundTrip,
    },
  };
}

function parseRuns(args: readonly string[]): number {
  let runs = 5;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== '--runs')
      throw new Error('Usage: pnpm exec tsx scripts/bench-integrations.ts [--runs 3]');
    const value = args[index + 1];
    if (!value || !/^\d+$/.test(value)) throw new Error('--runs requires an integer from 1 to 20.');
    runs = Number(value);
    index += 1;
  }
  if (runs < 1 || runs > 20) throw new Error('--runs must be from 1 to 20.');
  return runs;
}

function request(id: number, method: string, params: Record<string, unknown> = {}) {
  return {
    jsonrpc: '2.0',
    id,
    method,
    params: {
      ...params,
      _meta: { [PROTOCOL_VERSION_KEY]: PROTOCOL_VERSION },
    },
  };
}

function parseResponse(line: string, id: number): Record<string, unknown> {
  const value: unknown = JSON.parse(line);
  if (
    !value ||
    typeof value !== 'object' ||
    (value as { id?: unknown }).id !== id ||
    (value as { jsonrpc?: unknown }).jsonrpc !== '2.0'
  )
    throw new Error(`MCP response ${id} was missing or malformed.`);
  const frame = value as Record<string, unknown>;
  if (frame.error) throw new Error(`MCP request ${id} failed: ${JSON.stringify(frame.error)}`);
  return frame;
}

function childExit(child: ReturnType<typeof spawn>): Promise<number> {
  return new Promise((resolveExit, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`CLI child process exceeded ${CHILD_TIMEOUT_MS} ms.`));
    }, CHILD_TIMEOUT_MS);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      resolveExit(code ?? 1);
    });
  });
}

function readLine(
  iterator: AsyncIterator<string>,
  child: ReturnType<typeof spawn>
): Promise<string> {
  return new Promise((resolveLine, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`MCP response exceeded ${CHILD_TIMEOUT_MS} ms.`));
    }, CHILD_TIMEOUT_MS);
    iterator.next().then(
      ({ value, done }) => {
        clearTimeout(timer);
        if (done || value === undefined)
          reject(new Error('MCP server closed stdout unexpectedly.'));
        else resolveLine(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function benchDoctorStartup(): Promise<number> {
  const started = performance.now();
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', CLI_ENTRY, 'doctor', '--json', '--offline'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
  const code = await childExit(child);
  if (code !== 0) throw new Error(`doctor exited ${code}: ${stderr || stdout}`);
  const envelope: unknown = JSON.parse(stdout);
  if (
    !envelope ||
    typeof envelope !== 'object' ||
    (envelope as { ok?: unknown }).ok !== true ||
    (envelope as { command?: unknown }).command !== 'doctor'
  )
    throw new Error('doctor did not return a successful JSON envelope.');
  return performance.now() - started;
}

async function benchMcp(): Promise<{ startupMs: number; roundTripMs: number }> {
  const started = performance.now();
  const child = spawn(process.execPath, ['--import', 'tsx', CLI_ENTRY, 'mcp'], {
    cwd: ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const iterator = lines[Symbol.asyncIterator]();
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));

  try {
    child.stdin.write(`${JSON.stringify(request(1, 'server/discover'))}\n`);
    const discovery = parseResponse(await readLine(iterator, child), 1);
    if (!discovery.result || typeof discovery.result !== 'object')
      throw new Error('MCP server/discover response has no result.');
    const startupMs = performance.now() - started;

    const roundTripStarted = performance.now();
    child.stdin.write(
      `${JSON.stringify(
        request(2, 'tools/call', {
          name: 'doctor',
          arguments: { offline: true },
        })
      )}\n`
    );
    const call = parseResponse(await readLine(iterator, child), 2);
    const result = call.result as { content?: { text?: string }[]; isError?: boolean } | undefined;
    const text = result?.content?.[0]?.text;
    if (result?.isError || typeof text !== 'string')
      throw new Error('MCP doctor call did not return successful text content.');
    const envelope = JSON.parse(text) as { ok?: boolean; command?: string };
    if (envelope.ok !== true || envelope.command !== 'doctor')
      throw new Error('MCP doctor call did not return a successful CLI envelope.');
    const roundTripMs = performance.now() - roundTripStarted;

    child.stdin.end();
    const code = await childExit(child);
    if (code !== 0) throw new Error(`MCP server exited ${code}: ${stderr}`);
    return { startupMs, roundTripMs };
  } catch (error) {
    child.kill();
    throw error;
  } finally {
    lines.close();
  }
}

function machineInfo() {
  return {
    platform: `${platform()} ${release()}`,
    node: process.version,
    cpu: cpus()[0]?.model ?? 'unknown',
    cores: cpus().length,
    memoryGb: Math.round((totalmem() / 1024 ** 3) * 10) / 10,
    freeMemoryGb: Math.round((freemem() / 1024 ** 3) * 10) / 10,
  };
}

async function main(): Promise<void> {
  const runs = parseRuns(process.argv.slice(2));
  const samples: IntegrationSamples = { doctorStartup: [], mcpStartup: [], mcpRoundTrip: [] };
  for (let run = 0; run < runs; run += 1) {
    samples.doctorStartup.push(await benchDoctorStartup());
    const mcp = await benchMcp();
    samples.mcpStartup.push(mcp.startupMs);
    samples.mcpRoundTrip.push(mcp.roundTripMs);
  }

  const summary = summarize(samples);
  const budgets = budgetResults(summary);
  const measuredAt = new Date().toISOString();
  const report = {
    format: 'protoyard.bench-integrations',
    version: 1,
    measuredAt,
    runs,
    machine: machineInfo(),
    budgets,
    summary,
    samples,
  };
  mkdirSync(REPORT_DIR, { recursive: true });
  const filename = join(REPORT_DIR, `bench-integrations-${measuredAt.replace(/[:.]/g, '-')}.json`);
  writeFileSync(filename, `${JSON.stringify(report, null, 2)}\n`);

  console.log(
    `Integrations · Node ${report.machine.node}, ${report.machine.cpu}, ${report.machine.cores} cores`
  );
  for (const [key, result] of Object.entries(budgets)) {
    console.log(
      `${key}: median ${result.medianMs.toFixed(1)} ms / budget ${result.budgetMs} ms ${result.withinBudget ? '✓' : '✗'}`
    );
  }
  console.log(`Report: ${filename}`);
  if (Object.values(budgets).some((result) => !result.withinBudget)) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
