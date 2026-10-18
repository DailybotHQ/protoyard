# CRUD app: data model

## Overview

TODO: the domain in words, and why the model looks this way.

## Tables

<!-- protoyard:generated:tables -->
| Table | Primary key | Indexes |
| --- | --- | --- |
| `auditEntries` | `id` (unique) | `action`, `actorId`, `at`, `entity`, `recordId` |
| `notifications` | `id` (unique) | `[personaId+readAt]` (compound), `createdAt`, `personaId`, `readAt` |
| `projects` | `id` (unique) | `createdAt`, `deletedAt`, `name`, `ownerId`, `status`, `tags` (multi-entry), `updatedAt` |
| `tasks` | `id` (unique) | `assigneeId`, `createdAt`, `deletedAt`, `projectId`, `status`, `title`, `updatedAt` |
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
  notifications {
    string id PK
    string createdAt
    string personaId
    string readAt
  }
  projects {
    string id PK
    string createdAt
    string deletedAt
    string name
    string ownerId
    string status
    string tags
    string updatedAt
  }
  tasks {
    string id PK
    string assigneeId
    string createdAt
    string deletedAt
    string projectId FK
    string status
    string title
    string updatedAt
  }
  projects ||--o{ tasks : projectId
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
| 1 | `auditEntries`, `notifications`, `projects`, `tasks` | — | — |
<!-- /protoyard:generated:versions -->

## Migrations

TODO: what each `upgrade` does to existing rows.
