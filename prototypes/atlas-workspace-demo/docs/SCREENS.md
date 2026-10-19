# Atlas Workspace Demo: screens

## Routes

<!-- protoyard:generated:routes -->
| Route | Screen | Capability | Description |
| --- | --- | --- | --- |
| `#/` | Overview | — | Review workspace performance and recent activity. |
| `#/layouts` | Layout gallery | — | Compare the workspace across supported layouts and themes. |
| `#/playbook` | Operations playbook | — | Read the workspace guide in a documentation layout. |
| `#/access` | Simulated access | — | Preview a split sign-in surface and learn the simulation boundary. |
| `#/onboarding` | Workspace tour | — | Walk through a three-step workspace orientation. |
| `#/customers` | Customers | `customers:read` | Browse workspace customers. |
| `#/customers/:id` | Customer | `customers:read` | Inspect an individual customer. |
| `#/orders` | Orders | `orders:read` | Browse and manage workspace orders. |
| `#/settings` | Settings | `settings:read` | Manage workspace preferences. |
<!-- /protoyard:generated:routes -->

## Screens

Overview shows metrics, a revenue chart and recent activity; empty data has explicit empty states and live data reads show loading feedback. Customers and Orders provide search, filters, pagination, detail views and service-backed edits; validation, permission and simulated network errors are surfaced inline or as messages. Settings edits are capability-gated and read-only personas get an explanation. Layout gallery has working light/dark preview links for every supported frame. Playbook is static guidance. Access preview is explicitly non-authenticating. Workspace tour advances through three wizard steps and a completion state.

## Shell

The responsive web prototype defaults to the sidebar frame and the `aurora-analytics` library theme. The manifest supports sidebar, rail, top-nav, dual-sidebar, master-detail, dashboard-grid, docs, marketing, wizard and auth-split; layout and color mode overrides are URL-shareable.
