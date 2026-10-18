# Team chat: data model

## Overview

TODO: the domain in words, and why the model looks this way.

## Tables

<!-- protoyard:generated:tables -->
| Table | Primary key | Indexes |
| --- | --- | --- |
| `channelMembers` | `id` (unique) | `[channelId+personaId]` (compound), `channelId`, `personaId` |
| `channels` | `id` (unique) | `dmKey`, `kind`, `lastMessageAt`, `workspaceId` |
| `files` | `id` (unique) | `channelId`, `uploadedBy` |
| `huddles` | `id` (unique) | `channelId`, `startedAt` |
| `messages` | `id` (unique) | `[channelId+at]` (compound), `authorId`, `channelId`, `threadId` |
| `presence` | `id` (unique) | `personaId`, `status` |
| `reactions` | `id` (unique) | `[messageId+personaId+emoji]` (compound), `messageId` |
| `reads` | `id` (unique) | `[channelId+personaId]` (compound), `channelId`, `personaId` |
| `workspaces` | `id` (unique) | `slug` |
<!-- /protoyard:generated:tables -->

## Diagram

<!-- protoyard:generated:er-diagram -->
```mermaid
erDiagram
  channelMembers {
    string id PK
    string channelId FK
    string personaId
  }
  channels {
    string id PK
    string dmKey
    string kind
    string lastMessageAt
    string workspaceId FK
  }
  files {
    string id PK
    string channelId FK
    string uploadedBy
  }
  huddles {
    string id PK
    string channelId FK
    string startedAt
  }
  messages {
    string id PK
    string authorId
    string channelId FK
    string threadId
  }
  presence {
    string id PK
    string personaId
    string status
  }
  reactions {
    string id PK
    string messageId FK
  }
  reads {
    string id PK
    string channelId FK
    string personaId
  }
  workspaces {
    string id PK
    string slug
  }
  channels ||--o{ channelMembers : channelId
  workspaces ||--o{ channels : workspaceId
  channels ||--o{ files : channelId
  channels ||--o{ huddles : channelId
  channels ||--o{ messages : channelId
  messages ||--o{ reactions : messageId
  channels ||--o{ reads : channelId
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
| 1 | `channelMembers`, `channels`, `files`, `huddles`, `messages`, `presence`, `reactions`, `reads`, `workspaces` | — | — |
<!-- /protoyard:generated:versions -->

## Migrations

TODO: what each `upgrade` does to existing rows.
