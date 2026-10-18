# Admin Console: screens

## Routes

<!-- protoyard:generated:routes -->
| Route | Screen | Capability | Description |
| --- | --- | --- | --- |
| `#/` | Overview | `console:read` | Platform health: tenants, people, revenue and recent staff actions. |
| `#/tenants` | Tenants | `console:read` | Every customer organization, filterable by status and plan. |
| `#/tenants/:id` | Tenant | `console:read` | One tenant: people, subscription, suspension and impersonation. |
| `#/users` | Users | `console:read` | People across all tenants. |
| `#/audit` | Audit log | `console:read` | Every staff action, newest first. |
<!-- /protoyard:generated:routes -->

## Screens

TODO: for each screen, its purpose, the data shown, the actions, and the empty, loading, error and denied states.

## Shell

TODO: the device or host shell and viewport this prototype is designed for (`preview` in protoyard.json).
