import { describe, expect, it } from 'vitest';
import type { Conversation, Message } from '../src/database/schema.ts';
import { AGENTS, scriptedReply } from '../src/domain/agents.ts';
import { parseInline, parseMarkdown, plainText } from '../src/lib/markdown.ts';
import { activeMention, addMention, applyMention } from '../src/lib/mentions.ts';
import { groupMessages, sortConversations } from '../src/lib/thread.ts';

const atlas = AGENTS[0]!;

describe('safe markdown subset', () => {
  it('parses the scripted comparison table into header and rows', () => {
    const blocks = parseMarkdown(scriptedReply(atlas, 'compare A vs B'));
    const table = blocks.find((b) => b.type === 'table');
    expect(table?.type).toBe('table');
    if (table?.type !== 'table') return;
    expect(table.header.map((c) => c.map((n) => ('text' in n ? n.text : '')).join(''))).toEqual([
      '',
      'Option A',
      'Option B',
    ]);
    expect(table.rows).toHaveLength(3);
    expect(blocks.at(-1)?.type).toBe('paragraph');
  });

  it('parses ordered and bullet lists, bold, italics and mentions', () => {
    const blocks = parseMarkdown('Intro\n\n1. one\n2. **two**\n\n• a\n• b *c*\n\nhey @atlas');
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'list', 'list', 'paragraph']);
    const ordered = blocks[1];
    expect(ordered?.type === 'list' && ordered.ordered).toBe(true);
    expect(ordered?.type === 'list' && ordered.items[1]).toEqual([{ type: 'strong', text: 'two' }]);
    expect(parseInline('hey @Atlas!')).toEqual([
      { type: 'text', text: 'hey ' },
      { type: 'mention', handle: 'atlas' },
      { type: 'text', text: '!' },
    ]);
  });

  it('keeps markup-looking text as plain text (never HTML)', () => {
    const nodes = parseInline('<img src=x onerror=alert(1)> **unclosed');
    expect(nodes).toEqual([{ type: 'text', text: '<img src=x onerror=alert(1)> **unclosed' }]);
    expect(parseInline('mail me at a@b.co')).toEqual([{ type: 'text', text: 'mail me at a@b.co' }]);
  });

  it('flattens bodies for previews', () => {
    expect(plainText('**Draft**\n\nWe  shipped', 50)).toBe('Draft We shipped');
    expect(plainText('x'.repeat(20), 10)).toHaveLength(10);
  });
});

describe('mention helpers', () => {
  it('detects the mention being typed at the caret', () => {
    expect(activeMention('hello @at', 9)).toEqual({ start: 6, query: 'at' });
    expect(activeMention('@', 1)).toEqual({ start: 0, query: '' });
    expect(activeMention('mail a@b', 8)).toBeNull();
    expect(activeMention('@atlas done', 11)).toBeNull();
  });

  it('completes and inserts mentions', () => {
    const mention = activeMention('ask @qu now', 7)!;
    expect(applyMention('ask @qu now', mention, 'quill')).toEqual({
      text: 'ask @quill now',
      caret: 11,
    });
    expect(addMention('', 'atlas')).toBe('@atlas ');
    expect(addMention('hi', 'atlas')).toBe('hi @atlas ');
    expect(addMention('hi @atlas ', 'atlas')).toBe('hi @atlas ');
  });
});

describe('thread helpers', () => {
  const conv = (id: string, lastMessageAt: string, pinned = false) =>
    ({ id, lastMessageAt, pinned }) as Conversation;

  it('sorts pinned first, then most recent', () => {
    const sorted = sortConversations([
      conv('a', '2026-10-01T00:00:00Z'),
      conv('b', '2026-10-03T00:00:00Z'),
      conv('c', '2026-09-01T00:00:00Z', true),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(['c', 'b', 'a']);
  });

  it('groups consecutive messages by author within five minutes and splits days', () => {
    const msg = (id: string, authorId: string, at: string) =>
      ({ id, authorId, authorKind: 'person', at }) as Message;
    const groups = groupMessages([
      msg('1', 'u1', '2026-10-16T10:00:00Z'),
      msg('2', 'u1', '2026-10-16T10:04:00Z'),
      msg('3', 'u1', '2026-10-16T10:20:00Z'),
      msg('4', 'u2', '2026-10-16T10:21:00Z'),
      msg('5', 'u2', '2026-10-17T10:21:00Z'),
    ]);
    expect(groups.map((g) => g.messages.map((m) => m.id))).toEqual([
      ['1', '2'],
      ['3'],
      ['4'],
      ['5'],
    ]);
    expect(groups[0]?.dayStart).not.toBeNull();
    expect(groups[1]?.dayStart).toBeNull();
    expect(groups[3]?.dayStart).not.toBeNull();
  });
});
