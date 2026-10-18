# Chat widget: data model

## Overview

TODO: the domain in words, and why the model looks this way.

## Tables

<!-- protoyard:generated:tables -->
| Table | Primary key | Indexes |
| --- | --- | --- |
| `conversations` | `id` (unique) | `createdBy`, `lastMessageAt` |
| `messages` | `id` (unique) | `[conversationId+at]` (compound), `authorId`, `conversationId`, `status` |
| `reads` | `id` (unique) | `conversationId`, `personaId` |
<!-- /protoyard:generated:tables -->

## Diagram

<!-- protoyard:generated:er-diagram -->
```mermaid
erDiagram
  conversations {
    string id PK
    string createdBy
    string lastMessageAt
  }
  messages {
    string id PK
    string authorId
    string conversationId FK
    string status
  }
  reads {
    string id PK
    string conversationId FK
    string personaId
  }
  conversations ||--o{ messages : conversationId
  conversations ||--o{ reads : conversationId
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
| 1 | `conversations`, `messages`, `reads` | — | — |
<!-- /protoyard:generated:versions -->

## Migrations

TODO: what each `upgrade` does to existing rows.
