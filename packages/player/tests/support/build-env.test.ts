import { describe, expect, it } from 'vitest';
import { productionBuildEnv } from './build-env.ts';

describe('productionBuildEnv', () => {
  it('removes Vitest mode while preserving ordinary build environment values', () => {
    expect(
      productionBuildEnv({
        NODE_ENV: 'test',
        VITEST: 'true',
        VITEST_WORKER_ID: '3',
        CI: 'true',
        PATH: '/usr/bin',
      })
    ).toEqual({ CI: 'true', PATH: '/usr/bin' });
  });
});
