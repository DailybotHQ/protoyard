# Cadence Studio: data model

## Overview

TODO: the domain in words, and why the model looks this way.

## Tables

<!-- protoyard:generated:tables -->
| Table | Primary key | Indexes |
| --- | --- | --- |
| `auditEntries` | `id` (unique) | `action`, `actorId`, `at`, `entity`, `recordId` |
| `bookings` | `id` (unique) | `classId`, `clientId`, `coordinatorId`, `createdAt`, `deletedAt`, `instructorId`, `roomId`, `title`, `updatedAt` |
| `classes` | `id` (unique) | `createdAt`, `instructorId`, `name`, `roomId`, `updatedAt` |
| `clients` | `id` (unique) | `createdAt`, `name`, `updatedAt` |
| `instructors` | `id` (unique) | `createdAt`, `name`, `updatedAt` |
| `rooms` | `id` (unique) | `createdAt`, `name`, `updatedAt` |
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
  bookings {
    string id PK
    string classId FK
    string clientId FK
    string coordinatorId
    string createdAt
    string deletedAt
    string instructorId FK
    string roomId FK
    string title
    string updatedAt
  }
  classes {
    string id PK
    string createdAt
    string instructorId FK
    string name
    string roomId FK
    string updatedAt
  }
  clients {
    string id PK
    string createdAt
    string name
    string updatedAt
  }
  instructors {
    string id PK
    string createdAt
    string name
    string updatedAt
  }
  rooms {
    string id PK
    string createdAt
    string name
    string updatedAt
  }
  classes ||--o{ bookings : classId
  clients ||--o{ bookings : clientId
  instructors ||--o{ bookings : instructorId
  rooms ||--o{ bookings : roomId
  instructors ||--o{ classes : instructorId
  rooms ||--o{ classes : roomId
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
| 1 | `auditEntries`, `bookings`, `classes`, `clients`, `instructors`, `rooms` | — | — |
<!-- /protoyard:generated:versions -->

## Migrations

TODO: what each `upgrade` does to existing rows.
