import { describe, expect, it } from 'vitest';
import { contextFor } from '../../../tests/support/generate-context.ts';
import type { Conversation, Message, Participant } from '../src/database/schema.ts';
import { AGENTS, chunkReply, scriptedReply } from '../src/domain/agents.ts';
import { definition } from '../src/prototype.ts';
import { generateChatWorld } from '../src/scenarios/generators.ts';

const ctx = (id: string, seed?: number) => contextFor(definition.scenarios, id, seed);
const rows = <T>(world: ReturnType<typeof generateChatWorld>, table: string) =>
  (world.tables[table] ?? []) as unknown as T[];

describe('ai-chat-demo', () => {
  it('generates deterministic, referentially valid worlds', () => {
    expect(generateChatWorld(ctx('active-team'))).toEqual(generateChatWorld(ctx('active-team')));
    for (const scenario of definition.scenarios) {
      const world = generateChatWorld(ctx(scenario.id));
      const conversations = new Set(rows<Conversation>(world, 'conversations').map((c) => c.id));
      const authors = new Set([...world.personas.map((p) => p.id), ...AGENTS.map((a) => a.id)]);
      for (const m of rows<Message>(world, 'messages')) {
        expect(conversations.has(m.conversationId)).toBe(true);
        expect(authors.has(m.authorId)).toBe(true);
        expect(Date.parse(m.at)).toBeLessThanOrEqual(Date.parse(scenario.referenceTime));
      }
      for (const p of rows<Participant>(world, 'participants')) {
        expect(conversations.has(p.conversationId)).toBe(true);
      }
    }
  });

  it('maps scenarios to meaningful worlds', () => {
    expect(rows(generateChatWorld(ctx('empty-new-user')), 'conversations')).toHaveLength(0);
    const long = generateChatWorld(ctx('long-thread'));
    const counts = new Map<string, number>();
    for (const m of rows<Message>(long, 'messages')) {
      counts.set(m.conversationId, (counts.get(m.conversationId) ?? 0) + 1);
    }
    expect(Math.max(...counts.values())).toBeGreaterThan(500);
  });

  it('scripts replies deterministically and streams them losslessly', () => {
    const atlas = AGENTS[0];
    if (!atlas) throw new Error('missing agent');
    const reply = scriptedReply(atlas, 'Can you summarize this?');
    expect(reply).toBe(scriptedReply(atlas, 'Can you summarize this?'));
    expect(reply).toMatch(/short version/);
    expect(chunkReply(reply).join('')).toBe(reply);
    expect(chunkReply(reply).length).toBeGreaterThan(5);
  });
});
