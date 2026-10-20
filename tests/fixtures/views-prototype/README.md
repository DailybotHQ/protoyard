# views-prototype fixture

A minimal Vite + Svelte app for the views kit bundle guard
(`packages/cli/tests/views-bundle.test.ts`). It is not a workspace package:
the test copies it into a temporary folder whose `node_modules` links the real
`@protoyard/views-ui`, `@protoyard/ui` and `@protoyard/renderer-svelte`
packages (as pnpm does for a prototype), builds it with Vite and inspects the
chunks.

- `shell.html` → `src/shell.ts`: a realistic first screen (`runService`,
  `liveQuery`, the ui `Button` and toasts), the floor every view is measured on.
- `board.html`, `calendar.html`, `grid.html`, `map.html`, `editor.html`,
  `timeline.html`, `activity.html`: the shell plus one view on the first
  screen, so the test can measure what each view adds to initial JS.
- `baseline.html` (Svelte only) and `button.html` (the ui Button only) are
  reference points.
