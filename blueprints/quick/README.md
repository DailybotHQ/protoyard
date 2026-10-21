# Quick blueprint catalog

Quick blueprints are compact, data-only starting points for an idea that needs a useful first run. They are separate from the 40-entry marketplace catalog: they prioritize a small domain model, the smallest useful route set, and one clear exercise over broad product coverage.

## Selection criteria

A blueprint belongs here when it:

- uses a supported portable archetype and declares only the lazy kit entry points that archetype needs;
- has at most 3 entities, 3 explicit screens, 8 derived routes and 5,000 bytes of source JSON;
- generates deterministic fictional defaults and labels simulated assistants, sign-in, invitations, plans and analytics honestly;
- gives someone a concrete first-run exercise, using `validation.tasks` where the example supports a machine-checkable outcome.

These are catalog scope limits, not bundle budgets. The table reports each blueprint's source bytes and derived route count so the catalog test can catch growth. After generating a prototype, measure its JavaScript with `pnpm protoyard budget <slug>`; the existing 250 KB gzip limit remains the enforced bundle budget.

## Examples

| Blueprint | Archetype | Supported kits | First-run scope | Validation exercise |
| --- | --- | --- | --- | --- |
| [Quick Assistant Workspace](./assistant.json) | assistant | `@protoyard/ai`, `@protoyard/ai-ui` | 2 entities · 6 routes · 2,390 B JSON | Open `/assistant`, inspect a fictional conversation, then continue it with the local simulated assistant. |
| [Quick Team Chat](./team-chat.json) | team-chat | `@protoyard/ai`, `@protoyard/ai-ui` | 3 entities · 7 routes · 3,254 B JSON | Open `/chat`, switch rooms, and inspect the seeded member and message history. |
| [Quick Workspace Onboarding](./saas-onboarding.json) | saas-onboarding | `@protoyard/saas`, `@protoyard/saas-ui` | 2 entities · 8 routes · 4,109 B JSON | Complete `create-workspace` and `invite-teammate`; sign-in and invitations are simulated. |
| [Quick Product Analytics](./analytics.json) | analytics | `@protoyard/analytics`, `@protoyard/analytics-ui/grid`, `@protoyard/analytics-ui/date-range` | 2 entities · 7 routes · 3,799 B JSON | Complete `find-signups` and `record-metric` against deterministic sample events. |

The first-run scope values are derived from each parsed blueprint: entity count, `deriveAppModel()` route count, and checked-in JSON file size. The catalog test validates the links, metadata and limits.
