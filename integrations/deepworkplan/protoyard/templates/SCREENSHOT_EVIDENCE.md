# Optional screenshot evidence

Use this record after the required exploration gates pass. It is an evidence
record for a local, simulated prototype, not a usability study, production
claim, or deployment approval. Fill the placeholders from the screenshot
command's JSON envelope, then remove this guidance and unused branches.

The screenshot gate is optional. A missing Playwright package or Chromium
browser is an explicit skip; it is never a visual pass. A browser that starts
but cannot boot the page is a failure and must remain visible as one.

## Placeholders

| Placeholder | Meaning |
| --- | --- |
| `{{SLUG}}` | The stable exploration slug |
| `{{VARIANT_COUNT}}` | The generated variant count |
| `{{EVIDENCE_DIR}}` | The approved plan evidence directory |
| `{{SCREENSHOT_RESULT}}` | `pass` or `skip` with its reason |
| `{{SCREENSHOT_ROWS}}` | One row for every copied PNG, including its variant and dimensions |
| `{{SKIP_REASON}}` | `playwright-unavailable` or `browser-unavailable`, when skipped |
| `{{SKIP_DETAIL}}` | The machine's short unavailable-browser detail |
| `{{GAPS}}` | Known visual limitations or unresolved questions |

<!-- screenshot-evidence:start -->

# Screenshot evidence: `{{SLUG}}`

## 1. Gate result

| Field | Value |
| --- | --- |
| Exploration | `{{SLUG}}` |
| Variants | {{VARIANT_COUNT}} |
| Result | {{SCREENSHOT_RESULT}} |
| Evidence directory | `{{EVIDENCE_DIR}}` |
| Browser skip reason | {{SKIP_REASON}} |
| Browser skip detail | {{SKIP_DETAIL}} |

For a pass, the command captured one 1280×800 desktop PNG for the base page
and each `v1`…`vN` variant. A `--phone` run may add one 390×844 PNG per page.
The capture uses a fresh context, light color scheme, a fixed viewport, the
launcher served over loopback, and the player ready marker. These constraints
make the capture deterministic by page and variant. They do not promise
byte-identical PNGs across browsers or machines.

For a skip, leave the result as `skip`, retain the exact reason and detail, and
do not write a fake image path. Only `playwright-unavailable` and
`browser-unavailable` are unavailable-browser skips. `capture-failed` is a
failed browser gate and must not be rewritten as a skip.

For a machine-readable skip, write `browser-evidence.json` beside this record
with this shape, using the exact detail from the command envelope:

```json
{
  "format": "protoyard-screenshot-evidence",
  "version": 1,
  "status": "skipped",
  "reason": "playwright-unavailable",
  "detail": "<short machine detail>",
  "slug": "{{SLUG}}",
  "variantCount": {{VARIANT_COUNT}},
  "screenshots": []
}
```

The same record may use `browser-unavailable` as its reason. Never use
`status: "pass"` with an empty `screenshots` array.

## 2. Captured files

| Variant | Viewport | Relative path | Width | Height | Bytes | SHA-256 | Over budget |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
{{SCREENSHOT_ROWS}}

Every path is relative to `{{EVIDENCE_DIR}}`, every file exists, and every
variant has one desktop row when the result is `pass`. The base row is retained
because it is the unmodified comparison page; `v1`…`vN` are the actual
variants. Keep only the PNGs cited here and the machine-readable envelope or
skip record. Never copy the player directory or a scratch path into plan
evidence.

## 3. Interpretation boundary

The images show a local rendering of fictional data. They do not prove
accessibility, user preference, production performance, or a deployment. Any
accessibility result must be recorded by the separate check that produced it;
this screenshot record must not imply an axe pass that was not run.

Known gaps: {{GAPS}}

Promotion is a separate, human-approved task. A screenshot pass or skip does
not select a variant or copy source files into `prototypes/`.

<!-- screenshot-evidence:end -->
