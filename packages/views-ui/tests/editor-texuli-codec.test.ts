import { parseEditorDocument, serializeEditorDocument } from '@protoyard/views/editor';
import { markdownToDocument } from '@texuli/editor/markdown';
import { describe, expect, it } from 'vitest';

/*
 * G48: Texuli's Markdown codec reads host inline extensions as `<sigil>{id|label}`,
 * the same form `@protoyard/views/editor` stores mentions in. These tests pin what
 * already matches and the one difference that still blocks reading stored editor
 * text with Texuli's codec (the `\@` escape Protoyard writes for a literal `@`).
 */
const MENTION = [{ name: 'mention', sigil: '@' as const }];

type Inline = { type: string; text: string; marks: { type: string; name?: string; id?: string }[] };
function texuliInline(source: string): Inline[] {
  const result = markdownToDocument(source, { extensions: MENTION }) as unknown as {
    doc: { blocks: { content: Inline[] }[] };
  };
  return result.doc.blocks[0]?.content ?? [];
}

describe("stored editor text through Texuli's Markdown codec (G48)", () => {
  it('reads a stored mention as an extension mark with the same id and label', () => {
    const stored = serializeEditorDocument(
      parseEditorDocument('Can you review this, @{priya.nair|Priya Nair}?')
    );
    expect(stored).toContain('@{priya.nair|Priya Nair}');
    const mention = texuliInline(stored).find((node) =>
      node.marks.some((m) => m.type === 'extension')
    );
    expect(mention?.text).toBe('Priya Nair');
    expect(mention?.marks).toContainEqual({ type: 'extension', name: 'mention', id: 'priya.nair' });
  });

  // Texuli gap (reported with T-kits-gaps): `\@` is not read as an escape, so stored
  // text with a literal `@` would show a stray backslash. CommonMark escapes every
  // ASCII punctuation character; Texuli already does for `*`, `#` and `!`.
  it.fails('reads the stored escape of a literal @ as plain text', () => {
    const stored = serializeEditorDocument(parseEditorDocument('Write to team\\@example.com'));
    expect(stored).toBe('Write to team\\@example.com');
    expect(
      texuliInline(stored)
        .map((node) => node.text)
        .join('')
    ).toBe('Write to team@example.com');
  });
});
