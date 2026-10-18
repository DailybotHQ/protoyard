# Beacon Help Desk: data model

## Overview

TODO: the domain in words, and why the model looks this way.

## Tables

<!-- protoyard:generated:tables -->
| Table | Primary key | Indexes |
| --- | --- | --- |
| `auditEntries` | `id` (unique) | `action`, `actorId`, `at`, `entity`, `recordId` |
| `customers` | `id` (unique) | `accountManagerId`, `createdAt`, `deletedAt`, `name`, `plan`, `tags` (multi-entry), `updatedAt` |
| `files` | `id` (unique) | `createdAt`, `entity`, `ownerId`, `recordId` |
| `notifications` | `id` (unique) | `[personaId+readAt]` (compound), `createdAt`, `personaId`, `readAt` |
| `replies` | `id` (unique) | `authorId`, `createdAt`, `message`, `ticketId`, `updatedAt` |
| `tickets` | `id` (unique) | `assigneeId`, `attachmentsIds` (multi-entry), `createdAt`, `customerId`, `deletedAt`, `priority`, `slaDueAt`, `status`, `subject`, `tags` (multi-entry), `updatedAt` |
<!-- /protoyard:generated:tables -->

## Diagram

<!-- protoyard:generated:er-diagram -->
```mermaid
erDiagram
  auditEntries {
    string id PK
    string action
    string actorId
    string at
    string entity
    string recordId
  }
  customers {
    string id PK
    string accountManagerId
    string createdAt
    string deletedAt
    string name
    string plan
    string tags
    string updatedAt
  }
  files {
    string id PK
    string createdAt
    string entity
    string ownerId
    string recordId
  }
  notifications {
    string id PK
    string createdAt
    string personaId
    string readAt
  }
  replies {
    string id PK
    string authorId
    string createdAt
    string message
    string ticketId FK
    string updatedAt
  }
  tickets {
    string id PK
    string assigneeId
    string attachmentsIds
    string createdAt
    string customerId FK
    string deletedAt
    string priority
    string slaDueAt
    string status
    string subject
    string tags
    string updatedAt
  }
  tickets ||--o{ replies : ticketId
  customers ||--o{ tickets : customerId
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
| 1 | `auditEntries`, `customers`, `files`, `notifications`, `replies`, `tickets` | — | — |
<!-- /protoyard:generated:versions -->

## Migrations

TODO: what each `upgrade` does to existing rows.
