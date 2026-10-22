/** Vitest sets NODE_ENV=test and VITEST_* variables; builds must use production defaults. */
export function productionBuildEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([key, value]) => value !== undefined && key !== 'NODE_ENV' && !key.startsWith('VITEST')
    )
  ) as NodeJS.ProcessEnv;
}
