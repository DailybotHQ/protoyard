# The agent service (`apps/agent`)

A stateless worker (agent-service design) that turns a chat prompt into a
validated blueprint draft. **It is not deployed, it has no real model provider
and no key exists.** It answers with a fake adapter that replays recorded
model output. Choosing a provider, placing a key (only ever outside the
repository) and deploying are developer decisions.

## Run it locally

```bash
pnpm --filter @texuli/agent dev
```

The dev server listens on `http://localhost:8787` (`AGENT_PORT` changes it).
`AGENT_ENABLED=0` turns it off (the kill switch; `{ "enabled": false }` in the
operator file `~/.config/texuli/agent.json` also stops a running server);
`AGENT_ALLOWED_ORIGIN` sets the one allowed browser origin (default
`http://localhost:4321`, the website dev server). Sessions need
`AGENT_SESSION_SECRET` (at least 32 bytes) before tokens are issued or
accepted. Runbook: `apps/agent/docs/service-runbook.md`.

## Contract (`/v1`)

| Route | What it does |
| --- | --- |
| `GET /v1/health` | `{ ok, api, enabled, catalogHash }` |
| `POST /v1/session` | An anonymous, signed, short-lived session token when a secret is configured |
| `POST /v1/draft` | `{ prompt, catalogHash, draft?, history? }` → server-sent events, or one JSON result |
| `GET /v1/receipts` | The action receipts of the authenticated session (no prompt text or caller data) |
| `POST /v1/csp-reports` | Only when a report store is configured: reduced, counted CSP violation reports (`apps/agent/docs/csp-reports.md`) |

There is no activate, publish or send route; those paths return 404.

**Events:** `accepted`, `generating` (plain text), `validating`,
`repairing`, `result`, `done`, `error`. Partial trees are never streamed.

**A valid result** carries:
- the draft and its envelope, `validated` because it passed the gate (the
  host still owns activation);
- the diagnostics;
- a receipt: id, catalog hash, checks, attempts, model, timing, usage, and
  an action receipt (artifact kind, tiers, completion time);
- a plain-text note.

## What the service guarantees

- **Admission:** the body is capped at 64 KiB while it is read, before
  `JSON.parse`. The request shape is strict, the prompt is limited to
  4,096 characters, only the last 6 history turns are kept, and the catalog
  hash must match (`catalog-mismatch`).
- **Client draft:** a draft the client sends is re-validated with
  `validateDraft`; the client copy is untrusted.
- **Model input:** the model sees only a tool schema generated from the
  Tier U manifests (no slots, events or CSS hooks).
- **Gate:** the output passes `validateDraft` plus the inertness check, with
  at most two repair attempts.
- **Controls:**
  - the kill switch, and per-IP, per-session and daily limits;
  - token ceilings per session and per day (`AGENT_TOKEN_BUDGETS`, counted in
    fictional budget units, not currency);
  - one request per session;
  - one allowed origin; `no-store` and `nosniff` headers;
  - provider errors never leak detail.

## Evals (offline)

Run them from `apps/agent` with `pnpm exec vitest run` (the app's own Vitest
config; the root config does not collect app tests yet).

- **Golden replay:** the 30 golden briefs replay through the HTTP handler to
  valid drafts whose scored golden checks all pass.
- **Hostile gate:** every hostile-corpus sample, sent as a prompt or as a
  forged model output, comes back invalid or inert.

The site's chat island is tested against the handler in-process.

## The chat island

`/agent-chat/` on texuli.com calls the service named by
`PUBLIC_TEXULI_AGENT_URL` at build time (https, or localhost for development).
When it is unset, as it is today, the island says the agent is not running and
sends nothing. Drafts are painted by `@texuli/player` in the untrusted tier.
