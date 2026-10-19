---
name: brief-to-prototype
description: Turn a product brief into a reviewed blueprint and a validated Protoyard prototype.
version: "1.0.0"
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob, Edit, Write
# === Documentation (ignored by harnesses, useful for humans) ===
tier: standard
intent: create
max-files: 25
---

# Skill: Brief to prototype

## Goal

Take a short product idea through offline blueprint synthesis, human review,
prototype generation, focused custom screens, validation and export. Keep the
blueprint as the source of truth and measure the brief-to-running loop when
collecting benchmark data.

## When to use

Use when the user has a product brief or idea in prose and wants a runnable
Protoyard prototype. For a prototype request without a brief, use
`create-prototype`.

## Inputs

- A brief in a Markdown/text file or inline text. Include users, the records
  they manage, key actions, important statuses or dates, roles and any screen
  the product needs.
- Optional product name, prototype slug, template choice and archetype override.
- Optional constraints the synthesizer cannot infer: must-have fields, roles,
  scenario states, layout or brand direction.

## Steps

1. **Start the clock when benchmarking.** Record a start timestamp immediately
   before reviewing the brief. Stop after the first successful production build
   in step 7. Record elapsed milliseconds, machine/OS, Node version, brief,
   slug and gate result with the benchmark run. For example:
   ```bash
   start_ms=$(node -p 'Date.now()')
   # Run the workflow through validate --build.
   end_ms=$(node -p 'Date.now()')
   printf 'ideaToRunningMs=%s\n' "$((end_ms - start_ms))"
   ```
   Do not present one run as a stable performance result; machine load and
   brief complexity affect elapsed time.
2. **Choose the archetype.** Let the synthesizer select an archetype when its
   rationale matches the brief. Use `--archetype <id>` only when the chosen
   structure is clearly wrong or the user has specified a product model. The
   current supported ids are shown by `pnpm protoyard blueprint new --help`.
   Never force an archetype just to get a named screen.
3. **Synthesize offline.** Save the brief, then create a reviewable blueprint:
   ```bash
   pnpm protoyard blueprint new tmp/<slug>.brief.json \
     --from-brief <path-to-brief.md> --name "<Product Name>"
   ```
   For a one-off, pipe the brief with `--from-brief -`. Use `--interactive`
   only when the user wants the CLI's short question flow. Add `--dry-run` to
   inspect the proposed blueprint without writing it. Synthesis is local and
   deterministic; it does not call a model or network service.
4. **Review and refine the blueprint.** Read the rationale and inspect the
   generated entities, fields, roles, screen specs, layout and brand. Check
   required fields, relation targets, money units, dates and permissions
   against the brief. Edit the JSON source when a decision needs correction,
   then run:
   ```bash
   pnpm protoyard blueprint validate <blueprint.json>
   ```
   Do not continue with an invalid or materially incomplete blueprint.
5. **Generate the prototype.** Use a new kebab-case slug. A separate generate
   step leaves the blueprint easy to review; `--generate <slug>` is available
   when the user wants one command:
   ```bash
   pnpm protoyard generate <slug> --blueprint <blueprint.json>
   ```
   Generation normally links workspace dependencies with `pnpm install`. In a
   shared checkout, use the repo's lockfile-owner procedure and do not change
   `pnpm-lock.yaml` from a non-owner lane. If using `--no-install`, arrange for
   the lockfile owner to link the generated app before building it.
6. **Add only the owned screens the product needs.** First run the generated
   screens and compare them with the brief. A generic dashboard, list, board,
   calendar, map, analytics, timeline, detail tabs or settings screen does not
   need a duplicate hand-written screen. For a product-specific workflow, add
   a component under `prototypes/<slug>/src/screens/` and wire it through the
   prototype's owned app code. Never edit `src/generated/**`; update the
   blueprint and regenerate instead. Use `add-entity`, `add-scenario` or
   `add-ui-component` when that work crosses their procedures.
7. **Validate before calling it runnable.** Generate/update spec docs, run the
   prototype tests and strict build gate, then export:
   ```bash
   pnpm protoyard spec <slug> --write
   pnpm vitest run prototypes/<slug>
   pnpm protoyard validate <slug> --strict-spec --build
   pnpm protoyard export <slug>
   ```
   Confirm the Vitest output selected tests. Resolve stale generated files,
   type errors, scenario failures and build errors before describing the result
   as validated. A browser walkthrough or E2E test is useful for interaction
   quality, but does not replace these gates.

## Validation

The workflow is complete when the blueprint validates, generation succeeds,
tests select and pass, `validate --strict-spec --build` passes, and export
reports a ZIP path, size, hash and isolation result. Report measured timing only
when the start and end points above were actually recorded.

## Notes

- Synthesis is heuristic and rule-based. Treat its rationale and output as a
  draft; the user brief and review determine the product.
- The generated app is a simulation: data is browser-local, roles and
  permissions are UX, there is no production backend, and all generated people
  and records are fictional.
- Generated screens cover supported common patterns. They do not infer every
  interaction or product-specific state. Add owned screens for genuine gaps.
- Keep all paths inside the repository and the new `prototypes/<slug>`; never
  modify an existing prototype to make a variant.
- See [the brief-to-prototype guide](../../../docs/BRIEF_TO_PROTOTYPE.md) for
  observed examples and troubleshooting.
