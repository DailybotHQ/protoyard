// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  budgetResults,
  INTEGRATION_BUDGETS_MS,
  median,
  summarize,
} from '../../../scripts/bench-integrations.ts';

describe('CLI integration performance budgets', () => {
  it('summarizes doctor, MCP startup and MCP round-trip samples by median', () => {
    expect(
      summarize({
        doctorStartup: [90, 110, 100],
        mcpStartup: [40, 50, 60],
        mcpRoundTrip: [20, 30, 40],
      })
    ).toEqual({ doctorStartupMs: 100, mcpStartupMs: 50, mcpRoundTripMs: 30 });
    expect(median([10, 30])).toBe(20);
    expect(() => median([])).toThrow('non-empty');
    expect(() => median([10, Number.NaN])).toThrow('finite');
  });

  it('applies explicit median budgets to all three measured costs', () => {
    const results = budgetResults({
      doctorStartupMs: INTEGRATION_BUDGETS_MS.doctorStartup,
      mcpStartupMs: INTEGRATION_BUDGETS_MS.mcpStartup + 1,
      mcpRoundTripMs: INTEGRATION_BUDGETS_MS.mcpRoundTrip,
    });

    expect(results.doctorStartup.withinBudget).toBe(true);
    expect(results.mcpStartup.withinBudget).toBe(false);
    expect(results.mcpRoundTrip.withinBudget).toBe(true);
    expect(Object.values(INTEGRATION_BUDGETS_MS).every((budget) => budget > 0)).toBe(true);
  });

  it('keeps the MCP transport behind the MCP command instead of normal CLI startup', () => {
    const program = readFileSync(new URL('../src/program.ts', import.meta.url), 'utf8');
    const mcpCommand = readFileSync(new URL('../src/commands/mcp.ts', import.meta.url), 'utf8');
    const doctorCommand = readFileSync(
      new URL('../src/commands/doctor.ts', import.meta.url),
      'utf8'
    );

    expect(program).toMatch(/from ['"]\.\/commands\/mcp\.ts['"]/);
    expect(program).not.toMatch(/from ['"][^'"]*\/mcp\/(?:stdio|tools)\.ts['"]/);
    expect(doctorCommand).not.toMatch(/from ['"][^'"]*\/mcp\/(?:stdio|tools)\.ts['"]/);
    expect(mcpCommand).toMatch(/import\(['"]\.\.\/mcp\/stdio\.ts['"]\)/);
    expect(mcpCommand).toMatch(/import\(['"]\.\.\/mcp\/tools\.ts['"]\)/);
    expect(mcpCommand).not.toMatch(/from ['"]\.\.\/mcp\//);
  });
});
