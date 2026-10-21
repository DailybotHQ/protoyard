# Exploration decision report template

Use this report after a disposable local exploration has completed. It records
what was observed, what was decided, and what happens next as separate facts.
It is local evidence from simulated data, not production research, user
research, or a deployment claim. Fill every `{{PLACEHOLDER}}` from the actual
exploration, then remove this guidance and the unused alternatives.

Do not copy source PII, credentials, network responses, or unvalidated output
into this report. Evidence paths must remain inside the approved plan scope.

## Placeholders

| Placeholder | Meaning |
| --- | --- |
| `{{REPORT_TITLE}}` | Short name for the exploration decision |
| `{{DECISION_QUESTION}}` | The single product question being answered |
| `{{INPUT}}` | Bounded brief or validated blueprint path |
| `{{SLUG}}` | Stable exploration slug |
| `{{SEED}}` | Fixed whole-number seed |
| `{{VARIANT_COUNT}}` | Number of compared variants |
| `{{CLI_VERSION}}` | Version returned by the machine-readable probe |
| `{{CAPABILITIES}}` | Capabilities used, or `none` |
| `{{EVIDENCE_DIR}}` | Approved evidence directory |
| `{{VALIDATION_RESULT}}` | Result of the real route and behavior predicates |
| `{{BROWSER_RESULT}}` | Screenshots and axe result, or the explicit skip reason |
| `{{VARIANT_ROWS}}` | One table row per variant, grounded in copied evidence |
| `{{METRIC_ROWS}}` | One row per observed metric and its source |
| `{{SELECTED_VARIANT}}` | `v1`…`vN`, or `none` |
| `{{DECISION}}` | `adopt`, `iterate`, or `discard` |
| `{{RATIONALE}}` | Evidence-based reason for the decision |
| `{{REJECTED_ALTERNATIVES}}` | Alternatives not selected and the observed reason |
| `{{FOLLOW_UP}}` | Separate next task or `none` |
| `{{PROMOTION_STATUS}}` | Explicit human decision pending, approved follow-up, or not requested |
| `{{GAPS}}` | Known limitations, skipped checks, or unresolved questions |

<!-- decision-report:start -->

# {{REPORT_TITLE}}

## 1. Scope and determinism

| Field | Value |
| --- | --- |
| Decision question | {{DECISION_QUESTION}} |
| Input | {{INPUT}} (fictional data only) |
| Slug | `{{SLUG}}` |
| Seed | `{{SEED}}` |
| Variants | {{VARIANT_COUNT}} |
| CLI version | `{{CLI_VERSION}}` |
| Capabilities | {{CAPABILITIES}} |
| Evidence directory | `{{EVIDENCE_DIR}}` |
| Consent | accepted |

The same bounded input, slug, seed, and variant count should produce the same
blueprints. This report cites only the evidence copied into the approved
directory; scratch files are not evidence.

## 2. Observed local evidence

This section describes what the local artifact did. Do not state a product
decision here and do not turn simulated behavior into a claim about real users.

### Validation and browser checks

- Validation predicates: {{VALIDATION_RESULT}}
- Browser evidence: {{BROWSER_RESULT}}
- Simulated-data note: all records, roles, timings, and interactions were
  generated or entered locally for this exploration.

### Variant observations

| Variant | Label | Blueprint SHA-256 | Observed criteria result | Evidence |
| --- | --- | --- | --- | --- |
{{VARIANT_ROWS}}

Every result above must name what was observed against the stated criteria and
cite a file below `{{EVIDENCE_DIR}}`. A missing browser is recorded as
`playwright-unavailable` with its reason; it is not silently counted as a
successful browser check.

### Observed metrics

Metrics are descriptive measurements of this local run. Define the unit and
collection source so another agent can reproduce the observation.

| Metric | Variant | Definition and unit | Observed value | Source |
| --- | --- | --- | --- | --- |
{{METRIC_ROWS}}

Do not add a metric without a source. A missing attempt, screenshot, or browser
must remain visible as missing or skipped rather than becoming a zero.

## 3. Decision

This section interprets the evidence above. It must not add facts that were not
observed locally.

| Field | Value |
| --- | --- |
| Selected variant | {{SELECTED_VARIANT}} |
| Decision | {{DECISION}} |
| Rationale | {{RATIONALE}} |
| Rejected alternatives | {{REJECTED_ALTERNATIVES}} |

Use `iterate` when the criteria are not answered or the evidence is incomplete;
use `adopt` only when the selected variant is supported by evidence for the
question; use `discard` when no variant merits another step. The selected
variant is a direction for the next decision, not a production artifact.

## 4. Follow-up and promotion boundary

- Follow-up: {{FOLLOW_UP}}
- Promotion status: {{PROMOTION_STATUS}}
- Known gaps: {{GAPS}}

Promotion is never implied by `adopt`. Turning an exploration into a source
prototype is a separate, human-approved task that owns source files, tests,
build budgets, and review. If no follow-up is needed, write `none` explicitly.

## 5. Evidence inventory

List only validated files copied into `{{EVIDENCE_DIR}}`, for example:

- `blueprint.json` and `quick.json`;
- one variant blueprint per compared variant;
- the quick JSON envelope;
- the validation report or imported metrics;
- screenshots and accessibility results, or the
  `playwright-unavailable` record;
- this completed `DECISION.md`.

<!-- decision-report:end -->
