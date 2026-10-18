# B2B SaaS Workspace: data model

## Overview

TODO: the domain in words, and why the model looks this way.

## Tables

<!-- protoyard:generated:tables -->
| Table | Primary key | Indexes |
| --- | --- | --- |
| `projects` | `id` (unique) | `createdAt`, `organizationId`, `ownerPersonaId`, `status` |
| `saas_accounts` | `id` (unique) | `email` (unique), `personaId` |
| `saas_inbox` | `id` (unique) | `at`, `kind`, `personaId`, `recipient` |
| `saas_invitations` | `id` (unique) | `email`, `organizationId`, `status`, `tokenId` |
| `saas_invoices` | `id` (unique) | `issuedAt`, `organizationId`, `subscriptionId` |
| `saas_mfa` | `id` (unique) | `accountId` (unique) |
| `saas_onboarding` | `id` (unique) | `organizationId`, `personaId` |
| `saas_sessions_log` | `id` (unique) | `accountId`, `at`, `personaId` |
| `saas_subscriptions` | `id` (unique) | `organizationId`, `status` |
| `saas_tokens` | `id` (unique) | `accountId`, `email`, `expiresAt`, `kind` |
<!-- /protoyard:generated:tables -->

## Diagram

<!-- protoyard:generated:er-diagram -->
```mermaid
erDiagram
  projects {
    string id PK
    string createdAt
    string organizationId
    string ownerPersonaId
    string status
  }
  saas_accounts {
    string id PK
    string email
    string personaId
  }
  saas_inbox {
    string id PK
    string at
    string kind
    string personaId
    string recipient
  }
  saas_invitations {
    string id PK
    string email
    string organizationId
    string status
    string tokenId
  }
  saas_invoices {
    string id PK
    string issuedAt
    string organizationId
    string subscriptionId
  }
  saas_mfa {
    string id PK
    string accountId
  }
  saas_onboarding {
    string id PK
    string organizationId
    string personaId
  }
  saas_sessions_log {
    string id PK
    string accountId
    string at
    string personaId
  }
  saas_subscriptions {
    string id PK
    string organizationId
    string status
  }
  saas_tokens {
    string id PK
    string accountId
    string email
    string expiresAt
    string kind
  }
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
| 1 | `projects`, `saas_accounts`, `saas_inbox`, `saas_invitations`, `saas_invoices`, `saas_mfa`, `saas_onboarding`, `saas_sessions_log`, `saas_subscriptions`, `saas_tokens` | — | — |
<!-- /protoyard:generated:versions -->

## Migrations

TODO: what each `upgrade` does to existing rows.
