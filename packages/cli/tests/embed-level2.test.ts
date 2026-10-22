import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  embeddedAppNamespace,
  isEmbeddedAppMessage,
  loadEmbeddedApp,
} from '@protoyard/blueprint/kinds/embed';
import { describe, expect, it } from 'vitest';

const validApp = JSON.parse(
  readFileSync(resolve(process.cwd(), 'packages/player/src/fixtures/demo.blueprint.json'), 'utf8')
) as Record<string, unknown>;

describe('level-two embedded apps', () => {
  it('derives stable, host-and-block-specific valid storage namespaces', async () => {
    const first = await embeddedAppNamespace('create-anything-deck', 'embed-intro');
    expect(first).toMatch(/^embed-[0-9a-f]{42}$/);
    expect(await embeddedAppNamespace('create-anything-deck', 'embed-intro')).toBe(first);
    expect(await embeddedAppNamespace('other-host', 'embed-intro')).not.toBe(first);
    expect(await embeddedAppNamespace('create-anything-deck', 'embed-other')).not.toBe(first);
  });

  it('accepts only the exact same-origin protocol message shapes', () => {
    expect(isEmbeddedAppMessage({ protocol: 'protoyard-embedded-app/1', type: 'ready' })).toBe(
      true
    );
    expect(
      isEmbeddedAppMessage({
        protocol: 'protoyard-embedded-app/1',
        type: 'start',
        requestId: 'embed-1',
        hostNamespace: 'create-anything-deck',
        blockId: 'embed-intro',
        app: validApp,
        extra: true,
      })
    ).toBe(false);
  });

  it('validates app data and refuses a payload carrying a nested embed marker', () => {
    expect(loadEmbeddedApp(validApp).success).toBe(true);
    const nested = structuredClone(validApp);
    // App blueprints have no block field; an embed marker in an extension field
    // therefore fails the strict app schema instead of allowing another level.
    nested.untrustedContent = { type: 'embed-app' };
    expect(loadEmbeddedApp(nested)).toMatchObject({
      success: false,
      issues: [{ code: 'invalid-blueprint' }],
    });
  });

  it('keeps all generated-kind embed bootstraps behind the explicit iframe route', () => {
    for (const kind of ['deck', 'page', 'doc']) {
      const main = readFileSync(resolve(process.cwd(), `templates/${kind}/src/main.ts`), 'utf8');
      expect(main).toContain("has('__py_embed')");
      expect(main).toContain("import('./embed-entry.ts')");
      expect(main).not.toContain('@protoyard/player/boot');
    }
  });
});
