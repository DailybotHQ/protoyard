# SaaS Dashboard: data model

## Overview

TODO: the domain in words, and why the model looks this way.

## Tables

<!-- protoyard:generated:tables -->
| Table | Primary key | Indexes |
| --- | --- | --- |
| `customers` | `id` (unique) | `createdAt`, `name`, `ownerId`, `plan`, `status` |
| `events` | `id` (unique) | `actorId`, `at`, `customerId`, `orderId`, `type` |
| `orders` | `id` (unique) | `createdAt`, `customerId`, `reference`, `status` |
| `settings` | `id` (unique) | — |
<!-- /protoyard:generated:tables -->

## Diagram

<!-- protoyard:generated:er-diagram -->
```mermaid
erDiagram
  customers {
    string id PK
    string createdAt
    string name
    string ownerId
    string plan
    string status
  }
  events {
    string id PK
    string actorId
    string at
    string customerId FK
    string orderId FK
    string type
  }
  orders {
    string id PK
    string createdAt
    string customerId FK
    string reference
    string status
  }
  settings {
    string id PK
  }
  customers ||--o{ events : customerId
  orders ||--o{ events : orderId
  customers ||--o{ orders : customerId
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
| 1 | `customers`, `events`, `orders`, `settings` | — | — |
| 2 | — | — | — |
<!-- /protoyard:generated:versions -->

## Migrations

TODO: what each `upgrade` does to existing rows.
