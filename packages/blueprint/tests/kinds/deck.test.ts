import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  blueprintKind,
  isDeckBlueprint,
  parseAnyBlueprint,
  safeParseAnyBlueprint,
} from '../../src/index.ts';

const FIXTURE = join(import.meta.dirname, '../fixtures/kinds/intro.deck.json');
const deckFixture = () => JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, unknown>;

async function issuePaths(input: unknown): Promise<string[]> {
  const result = await safeParseAnyBlueprint(input);
  expect(result.success).toBe(false);
  return (result.error?.issues ?? []).map((issue) =>
    issue.path.reduce<string>(
      (path, part) =>
        typeof part === 'number' ? `${path}[${part}]` : `${path}[${JSON.stringify(String(part))}]`,
      '$'
    )
  );
}

describe('deck blueprints', () => {
  it('parses a deck fixture through the kind union and retains step markers', async () => {
    const parsed = await parseAnyBlueprint(deckFixture());
    expect(blueprintKind(parsed)).toBe('deck');
    expect(isDeckBlueprint(parsed)).toBe(true);
    if (!isDeckBlueprint(parsed)) return;
    expect(parsed.deck.slides[0]).toMatchObject({
      layout: 'process-steps',
      props: {
        steps: [{ step: 1, fragment: 'fade-up' }, { step: 2, reveal: 'highlight' }, { step: 3 }],
      },
    });
  });

  it('rejects duplicate slide ids with a stable JSON path', async () => {
    const input = deckFixture();
    const body = input.deck as { slides: unknown[] };
    body.slides.push({ ...(body.slides[0] as object) });
    expect(await issuePaths(input)).toContain('$["deck"]["slides"][1]["id"]');
  });

  it('rejects unknown layout ids and invalid catalog props with JSON paths', async () => {
    const unknown = deckFixture();
    const unknownBody = unknown.deck as { slides: Record<string, unknown>[] };
    (unknownBody.slides[0] as Record<string, unknown>).layout = 'made-up-layout';
    expect(await issuePaths(unknown)).toContain('$["deck"]["slides"][0]["layout"]');

    const invalidProps = deckFixture();
    const propsBody = invalidProps.deck as { slides: Record<string, unknown>[] };
    propsBody.slides[0] = { ...propsBody.slides[0], props: { title: '' } };
    expect(await issuePaths(invalidProps)).toContain('$["deck"]["slides"][0]["props"]["title"]');
  });

  it('rejects malformed step markers at their exact JSON path', async () => {
    const input = deckFixture();
    const body = input.deck as { slides: { props: { steps: Record<string, unknown>[] } }[] };
    const second = body.slides[0]?.props.steps[1];
    if (second) body.slides[0]!.props.steps[1] = { ...second, step: 1_001 };
    expect(await issuePaths(input)).toContain(
      '$["deck"]["slides"][0]["props"]["steps"][1]["step"]'
    );
  });
});
