import { createRng, hashString, type Rng } from '@protoyard/core';

export type AiToolStatus = 'succeeded' | 'failed';

export interface AiToolResult {
  status: AiToolStatus;
  output: unknown;
  error?: string;
}

/** Only service functions are exposed to tools; table/database handles are intentionally absent. */
export type AiToolServices = Readonly<
  Record<string, (input: unknown) => unknown | Promise<unknown>>
>;

export interface AiToolContext {
  seed: number | string;
  rng: Rng;
  now: () => Date;
  services: AiToolServices;
}

export interface AiToolDefinition<Input = unknown, Output = unknown> {
  name: string;
  description: string;
  requiresApproval?: boolean;
  /** Reproducible chance of a simulated tool failure, from 0 to 1. */
  failureRate?: number;
  failureMessage?: string;
  parseInput?: (input: unknown) => Input;
  execute: (input: Input, context: AiToolContext) => Output | Promise<Output>;
}

export interface AiTool {
  name: string;
  description: string;
  requiresApproval?: boolean;
  failureRate?: number;
  failureMessage?: string;
  run(input: unknown, context: AiToolContext): Promise<unknown>;
}

export function defineAiTool<Input, Output>(definition: AiToolDefinition<Input, Output>): AiTool {
  if (!/^[a-z][a-z0-9_.-]*$/.test(definition.name)) {
    throw new TypeError(`Invalid AI tool name: ${definition.name}`);
  }
  if ((definition.failureRate ?? 0) < 0 || (definition.failureRate ?? 0) > 1) {
    throw new RangeError('AI tool failureRate must be between 0 and 1.');
  }
  return {
    name: definition.name,
    description: definition.description,
    ...(definition.requiresApproval !== undefined
      ? { requiresApproval: definition.requiresApproval }
      : {}),
    ...(definition.failureRate !== undefined ? { failureRate: definition.failureRate } : {}),
    ...(definition.failureMessage !== undefined
      ? { failureMessage: definition.failureMessage }
      : {}),
    async run(input, context) {
      const parsed = definition.parseInput ? definition.parseInput(input) : (input as Input);
      return await definition.execute(parsed, context);
    },
  };
}

/** Declares a tool backed by a domain service; mutations remain in the service layer. */
export function serviceAiTool<Input = unknown, Output = unknown>(definition: {
  name: string;
  description: string;
  service: string;
  requiresApproval?: boolean;
  failureRate?: number;
  failureMessage?: string;
  parseInput?: (input: unknown) => Input;
}) {
  return defineAiTool<Input, Output>({
    ...definition,
    async execute(input, context) {
      const service = context.services[definition.service];
      if (!service)
        throw new RangeError(`AI tool service is not registered: ${definition.service}`);
      return (await service(input)) as Output;
    },
  });
}

export function toolFailureRoll(
  seed: number | string,
  runId: string,
  step: number,
  toolName: string
): number {
  return createRng(hashString(`${String(seed)}:${runId}:${step}:${toolName}`)).next();
}

export function createSimulatedSearchTool() {
  const documents = [
    {
      title: 'Launch checklist',
      snippet: 'Coordinate owners, readiness reviews, and a staged rollout.',
    },
    {
      title: 'Customer onboarding guide',
      snippet: 'Help new workspaces invite teammates and complete setup.',
    },
    {
      title: 'Incident response notes',
      snippet: 'Record impact, assign a responder, and share the next update.',
    },
  ] as const;
  return defineAiTool<{ query: string }, (typeof documents)[number][]>({
    name: 'search',
    description: 'Search a small fictional local knowledge index.',
    parseInput: readQuery,
    execute: ({ query }) => {
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      return documents
        .map((document) => ({
          document,
          score: terms.filter((term) =>
            `${document.title} ${document.snippet}`.toLowerCase().includes(term)
          ).length,
        }))
        .filter(({ score }) => score > 0)
        .sort(
          (left, right) =>
            right.score - left.score || left.document.title.localeCompare(right.document.title)
        )
        .slice(0, 3)
        .map(({ document }) => document);
    },
  });
}

export function createSimulatedCalendarTool() {
  return defineAiTool<{ query: string }, { event: string; start: string; attendee: string }[]>({
    name: 'calendar.lookup',
    description: 'Look up fictional calendar events in the local simulation.',
    parseInput: readQuery,
    execute: ({ query }) => {
      const normalized = query.toLowerCase();
      const events = [
        {
          event: 'Product planning',
          start: '2026-10-20T15:00:00.000Z',
          attendee: 'alex@example.com',
        },
        { event: 'Design review', start: '2026-10-21T16:30:00.000Z', attendee: 'sam@example.org' },
      ];
      return events.filter(
        (event) => event.event.toLowerCase().includes(normalized) || normalized.includes('week')
      );
    },
  });
}

export function createSimulatedCrmLookupTool() {
  return defineAiTool<
    { query: string },
    { id: string; name: string; company: string; email: string }[]
  >({
    name: 'crm.lookup',
    description: 'Look up fictional example customers.',
    parseInput: readQuery,
    execute: ({ query }) => {
      const customers = [
        {
          id: 'cus_001',
          name: 'Jordan Lee',
          company: 'Northstar Example',
          email: 'jordan@northstar.example',
        },
        {
          id: 'cus_002',
          name: 'Taylor Morgan',
          company: 'Cedar Example',
          email: 'taylor@cedar.example',
        },
      ];
      const needle = query.toLowerCase();
      return customers.filter((customer) =>
        `${customer.name} ${customer.company} ${customer.email}`.toLowerCase().includes(needle)
      );
    },
  });
}

export function createSimulatedCodeTool() {
  return defineAiTool<{ code: string }, { status: 'simulated'; output: string }>({
    name: 'code.run',
    description: 'Return a deterministic simulated code-run result; code is never executed.',
    parseInput(input) {
      if (
        !input ||
        typeof input !== 'object' ||
        typeof (input as { code?: unknown }).code !== 'string'
      ) {
        throw new TypeError('code.run expects a string code field.');
      }
      return { code: (input as { code: string }).code };
    },
    execute: ({ code }) => ({
      status: 'simulated',
      output: `Simulation only: ${code.length} characters received; code was not executed.`,
    }),
  });
}

export function createDefaultAiTools() {
  return [
    createSimulatedSearchTool(),
    createSimulatedCalendarTool(),
    createSimulatedCrmLookupTool(),
    createSimulatedCodeTool(),
  ] as const;
}

function readQuery(input: unknown): { query: string } {
  if (
    !input ||
    typeof input !== 'object' ||
    typeof (input as { query?: unknown }).query !== 'string'
  ) {
    throw new TypeError('Tool input must include a query string.');
  }
  return { query: (input as { query: string }).query };
}
