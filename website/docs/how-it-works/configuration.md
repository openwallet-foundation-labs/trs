---
title: Configuration
sidebar_position: 4
---

# Configuration

The resolver is configured through environment variables. Invalid values stop
the server at startup with a message naming the variable, rather than falling
back silently.

## Server

| Variable | Default | Description |
| --- | --- | --- |
| `TRS_PORT` | `3000` | Port to listen on. `PORT` is used if `TRS_PORT` is unset. |
| `TRS_HOST` | `0.0.0.0` | Interface to bind. |

## Cache

| Variable | Default | Description |
| --- | --- | --- |
| `TRS_CACHE_MAX_ENTRIES` | `10000` | Upper bound on cached query results (LRU). See [Caching](./caching.md). |

## Adapters

Each adapter documents its own variables:

- [EU Trusted List](../adapters/eu-trusted-list.md#configuration): `TRS_EU_LOTL_URL`, `TRS_EU_TL_ALLOW_HTTP`
- [PKI (X.509)](../adapters/pki-x509.md): `TRS_PKI_CONFIG`

## Example

```bash
TRS_PORT=8080 TRS_CACHE_MAX_ENTRIES=50000 pnpm start
```
