import { createRng, hashString } from '@protoyard/core';
import type { Agent } from '../database/schema.ts';

/**
 * Scripted agents. A reply is a pure function of (agent, prompt), so the same
 * question always gets the same answer — reproducible demos, no model calls.
 */

export const AGENTS: Agent[] = [
  {
    id: 'agent_atlas',
    name: 'Atlas',
    handle: 'atlas',
    description: 'Research agent — summarizes, compares and finds the facts in your threads.',
    color: '#0ea5e9',
    speed: 38,
    skills: ['summaries', 'comparisons', 'research'],
  },
  {
    id: 'agent_quill',
    name: 'Quill',
    handle: 'quill',
    description: 'Writing agent — drafts announcements, release notes and replies.',
    color: '#a855f7',
    speed: 30,
    skills: ['drafting', 'tone', 'editing'],
  },
  {
    id: 'agent_ops',
    name: 'Beacon',
    handle: 'beacon',
    description: 'Ops agent — status checks, incident timelines and checklists.',
    color: '#f97316',
    speed: 44,
    skills: ['incidents', 'checklists', 'status'],
  },
];

const TOPICS: { match: RegExp; replies: string[] }[] = [
  {
    match: /\b(summar|tl;?dr|recap)/i,
    replies: [
      'Here is the short version:\n\n1. The team agreed to ship the beta on Thursday.\n2. Two blockers remain: billing copy and the onboarding email.\n3. Owners: Priya on copy, Morgan on email.\n\nWant me to turn this into a checklist?',
    ],
  },
  {
    match: /\b(release|announce|changelog|notes)\b/i,
    replies: [
      '**Draft announcement**\n\nWe just shipped faster search, saved filters and a refreshed dark mode. Search results now appear as you type, and filters stay put between sessions.\n\nTone options: *playful*, *neutral*, *executive*. Which one?',
    ],
  },
  {
    match: /\b(incident|outage|down|error|status)\b/i,
    replies: [
      'Simulated status check:\n\n• API — operational\n• Webhooks — degraded (p95 2.4s)\n• Dashboard — operational\n\nSuggested next step: open an incident channel and page the on-call engineer.',
    ],
  },
  {
    match: /\b(compare|vs\.?|versus|difference)\b/i,
    replies: [
      'Comparison:\n\n| | Option A | Option B |\n|---|---|---|\n| Cost | Lower | Higher |\n| Setup | 1 day | 1 week |\n| Risk | Medium | Low |\n\nIf speed matters most, A. If risk matters most, B.',
    ],
  },
];

const FALLBACKS = [
  'Good question. Based on this thread, I would start with the smallest version that proves the idea, then measure before adding more.',
  'I can help with that. Could you share one concrete example? I will draft a first pass right away.',
  'Noted. I have added this to the thread context. Ask me to summarize, compare or draft whenever you are ready.',
];

export function scriptedReply(agent: Agent, prompt: string): string {
  const topic = TOPICS.find((t) => t.match.test(prompt));
  const rng = createRng(hashString(`${agent.id}:${prompt.trim().toLowerCase()}`));
  const body = topic ? rng.pick(topic.replies) : rng.pick(FALLBACKS);
  return agent.handle === 'quill' && !topic ? `✍️ ${body}` : body;
}

/** Splits a reply into stream chunks of ~3–6 words (deterministic). */
export function chunkReply(text: string): string[] {
  const words = text.split(/(\s+)/);
  const chunks: string[] = [];
  const rng = createRng(hashString(text));
  let current = '';
  let target = rng.int(3, 6) * 2;
  for (const piece of words) {
    current += piece;
    target--;
    if (target <= 0) {
      chunks.push(current);
      current = '';
      target = rng.int(3, 6) * 2;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Finds `@handle` mentions; defaults to the conversation's first agent. */
export function mentionedAgents(text: string, available: readonly Agent[]): Agent[] {
  const handles = new Set([...text.matchAll(/@([a-z]+)/gi)].map((m) => m[1]?.toLowerCase()));
  return available.filter((a) => handles.has(a.handle));
}
