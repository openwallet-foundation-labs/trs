---
title: Overview
sidebar_position: 1
---

# Architecture overview

The resolver is a [NestJS](https://nestjs.com/) application (running on Fastify)
organized as a monorepo inside a pnpm workspace.

## Repository layout

```
<repo root>/                     # pnpm workspace
  packages/
    trqp-core/                   # @trs/trqp-core — framework-agnostic zod schemas + types (SSOT)
  trs/                           # NestJS monorepo (the resolver)
    apps/
      resolver/                  # the resolver application
    libs/
      adapter-kit/               # adapter interface, @TrustAdapter, AdapterRegistry, errors, StaticAdapter
      adapter-did-web/           # the did:web adapter
      cache/                     # in-memory cache
  client/                        # trust-resolver client SDK
  website/                       # this documentation site
```

`@trs/trqp-core` is a **workspace package** (not a Nest library) because both the
server and the out-of-monorepo client SDK consume it. Its zod schemas are the
single source of truth for request/response shapes and validation.

## The three layers

Inside the resolver, a request flows through three layers:

| Layer | Responsibility |
|-------|----------------|
| `trqp` | HTTP binding: `POST /authorization`, `POST /recognition`, request validation, RFC 7807 error responses |
| `resolver` | Orchestration: cache → route to an adapter → map the result to a TRQP response |
| `adapters` | The trust-protocol adapters + the registry that routes to them |

## Request lifecycle

```
POST /authorization
      │
      ▼
ZodValidationPipe        validate body against @trs/trqp-core schema  → 400 problem+json on failure
      │
      ▼
ResolverService.authorize
      │  cache.wrap(key, …)                     ── hit? return cached TRQP response
      ▼
AdapterRegistry.select(authority_id)            ── order-based first-match (may 404 / 503)
      │
      ▼
adapter.resolveAuthorization(input)             ── protocol-specific resolution
      │
      ▼
map to TRQP AuthorizationResponse               ── echo params + authorized + time_evaluated
```

Any error thrown along the way is converted to an
[RFC 7807](https://www.rfc-editor.org/rfc/rfc7807) `application/problem+json`
response by a global exception filter.

## TRQP endpoints

TRQP v2.0 defines two read-only query types, both bound over HTTPS:

- `POST /authorization` — is `entity_id` authorized by `authority_id` for
  `action` on `resource`?
- `POST /recognition` — does `authority_id` recognize the peer `entity_id`?

Successful queries return `200` with the decision plus the echoed query
parameters and a `time_evaluated` timestamp.

Next: [the adapter layer and routing](./adapters.md).
