# Admin Console: data model

## Overview

TODO: the domain in words, and why the model looks this way.

## Tables

<!-- protoyard:generated:tables -->
| Table | Primary key | Indexes |
| --- | --- | --- |
| `impersonation` | `id` (unique) | — |
| `subscriptions` | `id` (unique) | `plan`, `status`, `tenantId` |
| `tenants` | `id` (unique) | `createdAt`, `name`, `plan`, `region`, `status` |
| `user_access` | `id` (unique) | `disabled`, `tenantId` |
<!-- /protoyard:generated:tables -->

## Diagram

<!-- protoyard:generated:er-diagram -->
```mermaid
erDiagram
  impersonation {
    string id PK
  }
  subscriptions {
    string id PK
    string plan
    string status
    string tenantId FK
  }
  tenants {
    string id PK
    string createdAt
    string name
    string plan
    string region
    string status
  }
  user_access {
    string id PK
    string disabled
    string tenantId FK
  }
  tenants ||--o{ subscriptions : tenantId
  tenants ||--o{ user_access : tenantId
```

_Indexed fields only. Relations are inferred from indexed `…Id` fields that match a table name; describe the rest by hand._
<!-- /protoyard:generated:er-diagram -->

## Relations

TODO: foreign keys and cardinalities the diagram cannot infer.

## Field notes

TODO: units (integer cents, ISO dates), enums and invariants.

## Schema history

<!-- protoyard:generated:versions -->
| Version | Adds | Changes indexes | Deletes |
| --- | --- | --- | --- |
| 1 | `impersonation`, `subscriptions`, `tenants`, `user_access` | — | — |
<!-- /protoyard:generated:versions -->

## Migrations

TODO: what each `upgrade` does to existing rows.
