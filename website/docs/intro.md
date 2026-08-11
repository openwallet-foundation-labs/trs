---
title: Introduction
slug: /
sidebar_position: 1
---

# Trust Resolver System (TRS)

TRS is a TypeScript implementation of a **Trust Resolver** that speaks the
**Trust Registry Query Protocol (TRQP)** and bridges it onto many underlying
trust protocols — did:web, did:webvh, did:webs, OpenID Federation, X.509 / PKI,
EUDI Trusted Lists, and more.

A client asks one simple TRQP question — *"is this entity authorized?"* or
*"does this authority recognize that one?"* — and the resolver figures out which
trust protocol actually backs the authority, resolves it, and answers in a
single, uniform shape.

```
client ──TRQP──▶ trust resolver ──▶ protocol-specific resolution ──▶ trust registry
```

In TRQP terms, each protocol integration is a **Bridge**:
`TRQP query → protocol-specific resolution → TRQP response`.

## What this site is

This is the **developer documentation**. It covers:

- **[How it works](./how-it-works/overview.md)** — the internal architecture: the
  request lifecycle, the pluggable adapter layer and its routing, and caching.
- **[Contributing](./contributing/getting-started.md)** — how to set up the repo
  and, most importantly, **[how to add a new trust-protocol adapter](./contributing/adding-an-adapter.md)**.

It is intentionally **not** an end-user API/usage guide yet — the focus for now
is the architecture and the contribution workflow.

:::note Status
TRS is early-stage. The resolver core, the adapter registry, and the did:web
adapter's routing are in place; most protocol adapters and real resolution logic
are still to be built. See the
[open issues](https://github.com/openwallet-foundation-labs/trs/issues).
:::
