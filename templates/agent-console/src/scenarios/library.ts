import type { Agent, EvalCase, ToolName } from '../database/schema.ts';

/** Fictional agents seeded by the generator, with prompts and evaluation cases. */
export interface LibraryAgent {
  name: string;
  description: string;
  instructions: string;
  modelId: string;
  tools: ToolName[];
  approvalTools: ToolName[];
  prompts: string[];
  dataset: string;
  cases: Omit<EvalCase, 'id'>[];
}

export const AGENT_LIBRARY: readonly LibraryAgent[] = [
  {
    name: 'Support triage',
    description: 'Looks up customers and help articles before drafting a reply.',
    instructions:
      'You triage incoming support requests. Look up the customer first, search the help center, then summarize the next step in two sentences.',
    modelId: 'py-orbit-pro',
    tools: ['search', 'crm.lookup'],
    approvalTools: [],
    prompts: [
      'Find the onboarding guide for a new customer account',
      'Look up the customer Jordan Lee and search for incident notes',
      'Search the launch checklist for the Cedar account',
      'Look up customer Taylor Morgan',
      'What should I tell a customer about the incident?',
      'Search for onboarding steps',
    ],
    dataset: 'Triage regression set',
    cases: [
      { prompt: 'Look up the customer Jordan Lee', expectTool: 'crm.lookup', expectText: null },
      { prompt: 'Search the onboarding guide', expectTool: 'search', expectText: 'onboarding' },
      {
        prompt: 'Summarize the incident for the customer account',
        expectTool: 'crm.lookup',
        expectText: null,
      },
      { prompt: 'Say hello', expectTool: null, expectText: 'without tools' },
    ],
  },
  {
    name: 'Scheduling assistant',
    description: 'Checks the team calendar; booking-style lookups need a person to approve.',
    instructions:
      'You help people find time on the shared calendar. Always confirm the event name and start time.',
    modelId: 'py-orbit-small',
    tools: ['calendar.lookup', 'search'],
    approvalTools: ['calendar.lookup'],
    prompts: [
      'What meetings are on the calendar this week?',
      'Schedule time after the design review',
      'Find the product planning event',
      'Search notes for the launch meeting',
    ],
    dataset: 'Calendar checks',
    cases: [
      {
        prompt: 'What meetings are on the calendar this week?',
        expectTool: 'calendar.lookup',
        expectText: 'Product planning',
      },
      { prompt: 'Search notes for the launch meeting', expectTool: 'search', expectText: null },
      {
        prompt: 'Book a meeting with the design team',
        expectTool: 'calendar.lookup',
        expectText: null,
      },
    ],
  },
  {
    name: 'Code reviewer',
    description: 'Requests simulated code runs (never executed) and long-context reviews.',
    instructions:
      'You review short snippets. Ask the code runner for a simulated result, then explain the outcome. Code is never executed.',
    modelId: 'py-orbit-long',
    tools: ['code.run'],
    approvalTools: ['code.run'],
    prompts: [
      'Run code: sum the numbers from 1 to 10',
      'Execute code that prints the release version',
      'Review this function for edge cases',
    ],
    dataset: 'Code runner smoke tests',
    cases: [
      { prompt: 'Run code: return 42', expectTool: 'code.run', expectText: 'not executed' },
      { prompt: 'Explain recursion', expectTool: 'code.run', expectText: null },
    ],
  },
];

export type SeedAgent = Agent & { library: LibraryAgent };
