// @vitest-environment node
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CliError } from '../src/lib/output.ts';
import { childPath, isInside, resolveWorkspaceRoot } from '../src/lib/paths.ts';
import { normalizeBase } from '../src/lib/vite.ts';
import { assertSlug, isCi } from '../src/lib/workspace.ts';
import { createWorkspace, type TempWorkspace } from './helpers.ts';

let ws: TempWorkspace | undefined;
afterEach(() => ws?.cleanup());

describe('slug and path guards', () => {
  it('rejects traversal, separators and reserved slugs before touching the disk', () => {
    for (const bad of ['../etc', '..', 'a/b', 'a\\b', '/abs', 'templates', 'My-App', '']) {
      expect(() => assertSlug(bad), bad).toThrow(CliError);
    }
    expect(assertSlug('my-app')).toBe('my-app');
  });

  it('treats CI as non-interactive unless it is empty, 0 or false', () => {
    for (const value of ['1', 'true', 'TRUE', 'yes']) expect(isCi({ CI: value }), value).toBe(true);
    for (const value of ['', '0', 'false', 'False']) expect(isCi({ CI: value }), value).toBe(false);
    expect(isCi({})).toBe(false);
  });

  it('childPath only ever returns a direct child', () => {
    expect(childPath('/w/prototypes', 'crm')).toBe('/w/prototypes/crm');
    for (const bad of ['..', '../x', 'a/b', '', 'x\0']) {
      expect(() => childPath('/w/prototypes', bad), bad).toThrow(CliError);
    }
  });

  it('isInside distinguishes children, siblings with a shared prefix and parents', () => {
    expect(isInside('/w/prototypes', '/w/prototypes/a')).toBe(true);
    expect(isInside('/w/prototypes', '/w/prototypes')).toBe(true);
    expect(isInside('/w/prototypes', '/w/prototypes-evil/a')).toBe(false);
    expect(isInside('/w/prototypes', '/w')).toBe(false);
  });

  it('finds the workspace root by walking up, or uses --root', () => {
    const temp = createWorkspace();
    ws = temp;
    // Roots are canonical (macOS temp dirs live behind the /var symlink).
    const real = realpathSync(temp.root);
    expect(resolveWorkspaceRoot({ cwd: join(temp.root, 'prototypes') })).toBe(real);
    expect(resolveWorkspaceRoot({ root: temp.root, cwd: '/' })).toBe(real);
    expect(() => resolveWorkspaceRoot({ root: join(temp.root, 'missing') })).toThrow(
      /does not exist/
    );
  });

  it('normalizes public bases and refuses unsafe ones', () => {
    expect(normalizeBase(undefined)).toBe('./');
    expect(normalizeBase('.')).toBe('./');
    expect(normalizeBase('/demos/crm')).toBe('/demos/crm/');
    for (const bad of ['demos/', '/a/../b/', 'https://x.dev/', '/a b/']) {
      expect(() => normalizeBase(bad), bad).toThrow(CliError);
    }
  });
});
