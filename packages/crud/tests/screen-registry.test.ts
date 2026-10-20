import { SCREEN_TYPES } from '@protoyard/blueprint';
import { describe, expect, it } from 'vitest';
import {
  getScreenKind,
  loadScreenKind,
  registerScreenKind,
  type ScreenKindRegistration,
  screenKinds,
} from '../src/registry.ts';
import { getScreenKindMetadata, screenKindMetadata } from '../src/registry-meta.ts';

describe('CRUD screen registry', () => {
  it('provides a lazy loader and metadata for every blueprint screen type', () => {
    for (const kind of SCREEN_TYPES) {
      expect(typeof screenKinds[kind]?.load, `${kind} loader`).toBe('function');
      expect(getScreenKindMetadata(kind)).toEqual(screenKindMetadata[kind]);
    }
  });

  it('adapts settings and generic screen props for their component contracts', () => {
    expect(
      getScreenKind('settings').adaptProps({
        runtime: 'runtime',
        blueprint: 'blueprint',
        screen: { sections: ['appearance'], title: 'Settings' },
        library: ['theme'],
      })
    ).toEqual({
      runtime: 'runtime',
      blueprint: 'blueprint',
      sections: ['appearance'],
      title: 'Settings',
      library: ['theme'],
    });
    expect(getScreenKind('board').adaptProps({ screen: { type: 'board' } })).toEqual({
      runtime: undefined,
      blueprint: undefined,
      services: undefined,
      screen: { type: 'board' },
    });
  });

  it('reports unknown kinds and allows one-time archetype registration', async () => {
    expect(() => getScreenKind('not-a-screen')).toThrow('Unknown screen kind "not-a-screen".');
    expect(() => getScreenKindMetadata('not-a-screen')).toThrow(
      'Unknown screen kind "not-a-screen".'
    );

    let loadCount = 0;
    const custom: ScreenKindRegistration = {
      ...screenKindMetadata['entity-page'],
      kind: 'test-archetype',
      subpath: '@protoyard/test/archetype',
      exportName: 'TestArchetype',
      load: async () => {
        loadCount += 1;
        return {} as never;
      },
      adaptProps: (props) => props,
    };
    registerScreenKind('test-archetype', custom);
    expect(loadCount).toBe(0);
    expect(getScreenKind('test-archetype')).toMatchObject({
      kind: 'test-archetype',
      subpath: '@protoyard/test/archetype',
      exportName: 'TestArchetype',
    });
    const loading = loadScreenKind('test-archetype');
    expect(loadCount).toBe(1);
    expect(await loading).toBeTruthy();
    expect(() => registerScreenKind('test-archetype', custom)).toThrow(
      'Screen kind "test-archetype" is already registered.'
    );
  });

  it('reserves entity-page for registration by the CRUD app shell', async () => {
    expect(screenKinds['entity-page']?.subpath).toBe('@protoyard/crud/app');
    await expect(loadScreenKind('entity-page')).rejects.toThrow(
      'The entity-page screen must be registered by the CRUD app shell.'
    );
  });
});
