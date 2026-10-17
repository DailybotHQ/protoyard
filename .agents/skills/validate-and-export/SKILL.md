---
name: validate-and-export
description: Validate a Protoyard prototype end to end, build it, preview the static artifact and export a relocatable ZIP with the isolation check.
version: "1.0.0"
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob
# === Documentation (ignored by harnesses, useful for humans) ===
tier: light
intent: validate
max-files: 0
---

# Skill: Validate and export

## Goal

Prove a prototype is shippable and produce `artifacts/<slug>/<slug>.zip`: a
self-contained static build with `base: './'`, no DevTools by default, and no
code from any other prototype.

## When to use

- At the end of `create-prototype` or any prototype change.
- Before `publish-prototype`, or to hand someone a ZIP.

## Inputs

- `slug`. Optional: `--base /sub/path/` for a fixed sub-path host,
  `--include-devtools` for an internal demo that needs the panel.

## Steps

1. **Static checks and tests.**
   ```bash
   npx biome check prototypes/<slug>
   pnpm vitest run prototypes/<slug>          # read the Tests line: 0 selected is a failure
   pnpm protoyard scenario validate <slug>    # every scenario generates and passes integrity
   ```
2. **Contract validation and production build.**
   ```bash
   pnpm protoyard validate <slug> --build
   ```
   It checks the manifest schema, folder contract, package name
   (`@prototype/<slug>`), scenario ids, `storage.schemaVersion`,
   `svelte-check`, then runs a production build into
   `artifacts/<slug>/dist` with `build-manifest.json`.
3. **Preview like a static host.**
   ```bash
   pnpm protoyard preview <slug>              # default port 4173; --strict-port to pin it
   ```
   Open it in a fresh browser profile, load two scenarios, reload, and
   confirm data persisted. For an automated check, run the smoke spec:
   `PROTOYARD_E2E_PROTOTYPES=<slug> pnpm test:e2e` (see `write-e2e`).
4. **Export.**
   ```bash
   pnpm protoyard export <slug> --json
   ```
   Record the ZIP path, size and sha256 from the output, and confirm the
   isolation result reports no foreign references (the guard lives in
   `packages/cli/src/lib/build.ts`). Use `--skip-build` only to re-zip a
   build that is verified against `build-manifest.json`.

## Validation

All of these exit 0: `npx biome check`, `pnpm vitest run prototypes/<slug>`
(non-empty), `pnpm protoyard scenario validate <slug>`,
`pnpm protoyard validate <slug> --build`, `pnpm protoyard export <slug>`.
Exit codes: 1 failure, 2 usage, 3 not found, 4 validation.

## Notes

- `validate --build`, `scenario validate` and `export` run the prototype's
  code; review prototypes from untrusted sources first (`docs/SECURITY.md`).
- Build output goes to `artifacts/` (git-ignored); never commit it.
- Report the real numbers from the command output; never estimate them.
