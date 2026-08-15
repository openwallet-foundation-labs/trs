---
title: Getting started
sidebar_position: 1
---

# Getting started

## Prerequisites

- **Node.js** ≥ 20
- **pnpm** (the repo is a pnpm workspace)

## Install & build

From the repo root:

```bash
pnpm install                    # install the whole workspace
pnpm build:core                 # build @trs/trqp-core (shared zod schemas/types)
```

`@trs/trqp-core` is consumed as a compiled package, so build it once (and after
changing it) before building or testing the server.

## Test

```bash
cd trs
pnpm test                       # unit + e2e (jest)
```

The suite covers the adapter registry (order-based first-match, 404/503) and the
TRQP endpoints end-to-end (routing, response mapping, RFC 7807 errors).

## Run the resolver

```bash
cd trs
pnpm start                      # nest start resolver  → http://localhost:3000
```

Then exercise it:

```bash
curl -s -X POST http://localhost:3000/authorization \
  -H 'content-type: application/json' \
  -d '{"entity_id":"did:web:issuer","authority_id":"did:web:root.example","action":"issue","resource":"license"}'
```

An unknown authority returns `404 application/problem+json`; an invalid body
returns `400`.

## Where things live

See the [repository layout](../how-it-works/overview.md#repository-layout). The
two areas you will touch most as a contributor:

- `trs/libs/adapter-*` — the trust-protocol adapters
- `trs/apps/resolver/src/adapters/adapters.module.ts` — where adapters are registered

## Run the docs site

This site is a standalone Docusaurus project in `website/`:

```bash
cd website
npm install
npm run start                   # local preview
npm run build                   # production build (what CI/CD builds)
```
