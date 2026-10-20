# From a brief to a prototype

Protoyard can turn a short product description into a data-only blueprint,
then generate a working prototype from that blueprint. The workflow is offline
and deterministic: the brief synthesizer uses local rules, not an AI service or
network request. The result is a useful first draft that should be reviewed
against the actual product idea.

Use the [`brief-to-prototype` skill](../.agents/skills/brief-to-prototype/SKILL.md)
or invoke `/new-from-brief`. For the longer hands-on build after generation,
continue with [`create-prototype`](../.agents/skills/create-prototype/SKILL.md).

## The loop

### 1. Describe the product

Include who uses it, the records they manage, their main actions, meaningful
statuses or dates, roles and any special workflow. A sentence or two is enough
to start; specifics help the synthesizer choose better fields and screens.

### 2. Synthesize a blueprint

Save the brief in a text or Markdown file and run:

```bash
pnpm protoyard blueprint new tmp/acme-desk.blueprint.json \
  --from-brief docs/acme-brief.md --name "Acme Desk"
```

The command prints its selected archetype and a rationale for the entities,
fields and screens, including the matched keywords. Strong cues can select the
`assistant`, `team-chat`, `saas-onboarding` and `analytics` seeds. If equally
strong kit archetypes conflict, synthesis uses the generic tracker; pass
`--archetype <id>` to choose explicitly. To inspect without writing, add `--dry-run`. To provide
brief text on stdin, use `--from-brief -`. Use `--interactive` to answer the
CLI's short question flow on a terminal. These four seeds also write the
portable kit declaration to `blueprint.archetype`, so the player and generator
can retain the selected adapter and entity-slot mapping. Supported ids are
listed by `pnpm protoyard blueprint new --help`.

### 3. Review and refine

Read the entire blueprint and compare it with the brief. Confirm relation
targets, required fields, date and money fields, permission actions and the
screens that matter. Edit the blueprint JSON when a field, role or screen needs
correction, then validate it:

```bash
pnpm protoyard blueprint validate tmp/acme-desk.blueprint.json
```

The CLI reports validation paths and messages. An editor or agent that needs
actionable repairs can call `validateBlueprintForAuthoring(input)` from
`@protoyard/blueprint`; its complete schema and cross-reference checks return a
`jsonPath`, `message` and `hint` for each diagnostic. Apply one targeted repair
to the JSON, run validation again, and keep the corrected blueprint as the
source of truth. JSON Schema completion alone cannot verify entity and route
references.

When the idea comes from existing structure, infer a draft instead of copying
records: the lazy `@protoyard/blueprint/import/csv-shape`,
`@protoyard/blueprint/import/json-shape` and
`@protoyard/blueprint/import/sqlite-schema` modules inspect headers, object
shapes or `CREATE TABLE` declarations. They return draft entities and review
notes without sample values or database rows. JSON shape inference returns
relation candidates; supported SQLite foreign keys become relations. Add the selected
entities to a complete blueprint, supply its roles, screens and any archetype,
then run the same validation command. The package guide has copyable API
examples and the enforced parser bounds.

For a small ready-made model, choose an example from the
[quick blueprint catalog](../blueprints/quick/README.md). For a kit-specific
first experience, choose `assistant`, `team-chat`, `saas-onboarding` or
`analytics`; the portable `blueprint.archetype` block records entity slots,
screens, scenario defaults and supported lazy kit entry points. Brief synthesis
selects these from strong cues or accepts an explicit `--archetype <id>`.

The JSON is the source of truth. Generated code is not an editing surface.

### 4. Generate

Choose a new kebab-case slug and generate the prototype:

```bash
pnpm protoyard generate acme-desk \
  --blueprint tmp/acme-desk.blueprint.json
```

Generation normally links workspace dependencies through `pnpm install`. If
you are working in a shared checkout without lockfile ownership, follow
`docs/AI_AGENT_COLLAB.md`: skip the install only when appropriate and have the
lockfile owner link the generated app before validation.

You can combine synthesis and generation with `blueprint new --generate
<slug>`. Use that shortcut when the user wants a direct result; keep the
separate review step for briefs whose inferred model or permissions need care.

### 5. Add only product-specific screens

Run the generated app and compare it with the brief. The generator already
provides common blueprint-driven screens such as dashboards, lists, boards,
calendars, maps, analytics, timelines, tabbed details and settings. Keep those
generated screens when they fit. Add an owned Svelte screen under
`prototypes/<slug>/src/screens/` only for a real product-specific workflow or
interaction that the generated screen cannot express. Wire it through the
prototype's owned app code. Never edit `src/generated/**`; refine the blueprint
and regenerate it, or add separate owned code.

`screenDefaults` selects standard list, detail and form routes for each entity.
The optional `@protoyard/blueprint/workflows` API validates explicit data-only
state models, but those models are not yet part of blueprint formatVersion 1 or
generated services. Custom workflow actions must remain in owned code and use
the generated entity services' normal validation and permission path.

### 6. Validate and export

Refresh the prototype specification and run its tests, strict build validation
and export:

```bash
pnpm protoyard spec acme-desk --write
pnpm vitest run prototypes/acme-desk
pnpm protoyard validate acme-desk --strict-spec --build
pnpm protoyard export acme-desk
```

Confirm Vitest selected tests. The validation command checks the generated
blueprint output, prototype types and production build. Export reports the ZIP
path, size, hash and isolation result. Walk the important flows in a browser;
add E2E coverage when the prototype needs repeatable interaction checks.

For a benchmark run, start timing just before reviewing the brief and stop at
the first passing `validate --strict-spec --build`. Record elapsed milliseconds,
machine/OS, Node version, the brief or its stable identifier, slug and result.
This records one observed idea-to-running time; it is not a repeatable timing
claim by itself.

## Example briefs and observed results

These outputs were observed with the current local synthesizer. The examples
show the likely shape, not a promise that every future rule revision will emit
identical details.

| Brief | Selected archetype and entities | Generated screen kinds |
| --- | --- | --- |
| “A neighborhood salon where clients book appointments, choose services and stylists, and staff track appointment status, payment totals, and the daily schedule. Include owner and receptionist roles, upcoming appointments, and customer profiles.” | `booking`; `appointment`, `client`, `schedule` | dashboard, list, board, timeline, calendar, analytics, detail, settings |
| “A small customer support desk where agents manage tickets by status and priority, assign owners, reply to customers, and track SLA due dates. Include agent, lead, and viewer roles, a ticket board, customer records, and audit history.” | `helpdesk`; `ticket`, `customer` | dashboard, list, board, calendar, detail, settings |
| “A product team tracker for projects and tasks, with status, priority, owner, start and due dates, dependencies, and linked customer feedback. Include a roadmap timeline, status board, and a dashboard of overdue and completed work.” | `pm`; `task`, `project` | dashboard, list, board, timeline, calendar, analytics, detail, settings |

Try one directly in the terminal:

```bash
printf '%s\n' 'A small customer support desk where agents manage tickets by status and priority, assign owners, reply to customers, and track SLA due dates. Include agent, lead, and viewer roles, a ticket board, customer records, and audit history.' \
  | pnpm protoyard blueprint new tmp/support.blueprint.json --from-brief - --dry-run
```

The rationale explains the heuristic matches; the JSON output is the place to
check the specific fields, roles and screen specs.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| The chosen archetype does not match the product | Read the rationale, then rerun with `--archetype <supported-id>` or edit the blueprint. Do not pick an archetype only to force a screen. |
| A generated field or role is missing | Add it to the blueprint JSON, run `blueprint validate`, then regenerate. Keep role permissions aligned with the requested user actions. |
| Blueprint validation reports an unknown field or relation | Check the path in the error; field references and relation targets must name fields/entities declared in the blueprint. |
| A prototype or blueprint file already exists | Choose a new name, or use `--force` only when replacing that file is intended. `generate` will not take over an unrelated prototype. |
| Strict spec validation says documentation is stale | Run `pnpm protoyard spec <slug> --write`, review the generated spec changes, and validate again. |
| Type checking cannot resolve a new workspace package after `--no-install` | Ask the lockfile owner to install/link workspace dependencies, then rerun validation. Do not hand-edit package links or the lockfile. |
| A generated file was edited by hand or drift is reported | Move custom behavior to owned files under `src/`, restore generated files, edit the blueprint and regenerate. Generated files carry hashes and are managed by the CLI. |
| The prototype builds but does not match the product flow | Add a focused owned screen or service after reviewing the generated behavior. Use the `add-entity`, `add-scenario` and `add-ui-component` skills for those changes. |

## Limits

Blueprint synthesis is heuristic, not a product-specification engine. Generated
people and records are fictional; persistence is browser-local; roles, sign-in
and permissions are simulation UX, not security; there is no production
backend. A successful build proves that the prototype compiles, not that every
interaction matches the brief. Review the output and add owned code where the
product needs behavior beyond the generated patterns.
