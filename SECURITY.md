# Security Policy

Protoyard is a local, browser-first developer tool from
[Dailybot](https://www.dailybot.com). It has no server component, no accounts
and no telemetry. Prototypes store their data in the viewer's browser
(IndexedDB). The full threat model is in
[docs/SECURITY.md](docs/SECURITY.md).

## Supported versions

Protoyard is pre-1.0 and develops on `main`. Fixes land on `main` and in the
next release tag.

| Version | Supported |
| --- | --- |
| `main` (latest release) | yes |
| Older tags | no |

## Reporting a vulnerability

Please report security issues **privately through GitHub's private
vulnerability reporting** at
<https://github.com/DailybotHQ/protoyard/security>. Do not open a public
issue. Or email **security@dailybot.com** with "protoyard" in the subject.

Include a description and impact, reproduction steps (a minimal proof of
concept is ideal), the affected commit or version, and your name or handle if
you would like credit.

| Step | Target |
| --- | --- |
| Acknowledgement | within 3 business days |
| Triage and severity assessment | within 7 days |
| Fix or mitigation for confirmed issues | as soon as practical, coordinated with you |

## In scope

- Path traversal or writes outside the workspace by the CLI (`new`, `build`,
  `export`, `publish`).
- The local control server (`127.0.0.1`), including Origin checks, slug
  validation and process spawning.
- Snapshot import: anything that executes code, bypasses validation, or
  corrupts other prototypes' data.
- Secrets leaking into builds, ZIPs, snapshots, logs or CLI output.
- Cross-prototype data leaks within the standard local setup that contradict
  the documented boundaries.

## Out of scope (by design, and documented)

- **Simulated permissions.** Personas and roles are UX simulation. Anyone using
  the browser can change IndexedDB, so bypassing a role is not a vulnerability.
- **Same-origin storage.** Prototypes served from one origin share an origin.
  Separate database names are namespaces, not a security boundary. Use
  separate origins for untrusted prototypes.
- **Running untrusted prototypes.** `protoyard dev` and `build` run the
  prototype's code, like any web app or npm script.
- Vulnerabilities in third-party hosts (Cloudflare, Netlify, Vercel) or in
  your own deployed prototype code.
