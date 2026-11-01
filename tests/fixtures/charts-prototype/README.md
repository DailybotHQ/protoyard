# charts-prototype fixture

A minimal Vite + Svelte app for the charts bundle measurement in
`scripts/bench-charts.ts` (the unit test that also used it,
`charts-bundle.test.ts`, was removed in PLAN_009). It is not a workspace
package: the bench copies it into a temporary folder whose `node_modules` links the real
`@protoyard/charts-ui` and `@protoyard/charts` packages (as pnpm does for a
prototype), builds it with Vite, and inspects the chunks.

- `index.html` → `src/main.ts`: Sparkline on the first screen, LineChart and
  BarChart behind a dynamic `import()`.
- `baseline.html` → `src/baseline.ts`: the same shell without charts, so a
  build can measure what Sparkline adds to initial JS.
