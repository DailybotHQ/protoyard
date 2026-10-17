## Summary

<!-- What changes and why, in a few sentences. -->

## Linked issue

<!-- Closes #… (or "none"). -->

## Test evidence

<!-- Paste the last line of each run. -->

- `pnpm lint`:
- `pnpm typecheck`:
- `pnpm test`:
- `pnpm test:e2e` (UI changes):
- `pnpm protoyard validate <slug> --build` (prototype/template changes):
- `bash scripts/check-public-hygiene.sh`:

## Checklist

- [ ] Conventional commit title (`feat:`, `fix:`, `docs:`, …)
- [ ] Seeded data stays deterministic (no `Math.random()` / `Date.now()` in generators)
- [ ] Permissions are checked in services, not only in the UI
- [ ] Tests added or updated; docs updated where behavior changed
- [ ] Accessible: labels, focus states, keyboard, contrast
- [ ] No secrets, tokens, personal paths or private context in the diff
