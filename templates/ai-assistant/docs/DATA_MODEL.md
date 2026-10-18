# AI Assistant: data model

## Overview

TODO: the domain in words, and why the model looks this way.

## Tables

<!-- protoyard:generated:tables -->
| Table | Primary key | Indexes |
| --- | --- | --- |
| `conversations` | `id` (unique) | `folder`, `pinned`, `projectId`, `updatedAt` |
| `messages` | `id` (unique) | `conversationId`, `createdAt`, `role` |
| `projects` | `id` (unique) | `createdAt` |
| `settings` | `id` (unique) | — |
<!-- /protoyard:generated:tables -->

## Diagram

<!-- protoyard:generated:er-diagram -->
```mermaid
erDiagram
  conversations {
    string id PK
    string folder
    string pinned
    string projectId FK
    string updatedAt
  }
  messages {
    string id PK
    string conversationId FK
    string createdAt
    string role
  }
  projects {
    string id PK
    string createdAt
  }
  settings {
    string id PK
  }
  projects ||--o{ conversations : projectId
  conversations ||--o{ messages : conversationId
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
| 1 | `conversations`, `messages`, `projects`, `settings` | — | — |
<!-- /protoyard:generated:versions -->

## Migrations

TODO: what each `upgrade` does to existing rows.
