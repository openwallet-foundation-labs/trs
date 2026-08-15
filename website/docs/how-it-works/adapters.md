---
title: Adapters & routing
sidebar_position: 2
---

# Adapters and routing

The adapter layer is where TRS delivers its core value: a single TRQP query is
routed to exactly one **trust-protocol adapter**, which resolves it against its
protocol and returns a normalized result.

## The adapter interface

Every adapter implements `TrustProtocolAdapter` (in `libs/adapter-kit`):

```ts
export interface TrustProtocolAdapter {
  readonly id: string;
  // routing: is this adapter authoritative for the authority?
  canHandle(authorityId: string, ctx?: TrqpContext): Promise<boolean>;
  resolveAuthorization(input: AuthorizationInput): Promise<AuthorizationOutcome>;
  resolveRecognition(input: RecognitionInput): Promise<RecognitionOutcome>;
}
```

An `AuthorizationOutcome` carries the decision plus optional metadata:

```ts
export interface AuthorizationOutcome {
  authorized: boolean;
  message?: string;
  freshUntil?: Date;   // adapter-known freshness → used as the cache TTL
  evidence?: unknown;  // audit/provenance — logged only, not in the TRQP response
}
```

## Registration — auto-discovery

Adapters are **not** listed in a central array. Each is a provider decorated with
`@TrustAdapter`, and the registry discovers them at startup via Nest's
`DiscoveryService`:

```ts
@TrustAdapter('did:web', { order: 10 })
export class DidWebAdapter implements TrustProtocolAdapter {
  readonly id = 'did:web';
  async canHandle(authorityId: string) {
    return authorityId.startsWith('did:web:');
  }
  // …
}
```

`@TrustAdapter(id, { order })` marks the class (`order` defaults to `100`).
The only wiring a new adapter needs is to be part of a module that the resolver
imports — see [Adding an adapter](../contributing/adding-an-adapter.md).

## Routing — order-based first-match

`AdapterRegistry` sorts adapters by `order` and, for each query, asks them in
order until one says yes. **The first `true` wins** (short-circuit):

```ts
async select(authorityId: string, ctx?: TrqpContext): Promise<TrustProtocolAdapter> {
  let deferredError = false;
  for (const adapter of this.adapters) {         // sorted by order (asc)
    try {
      if (await adapter.canHandle(authorityId, ctx)) return adapter;
    } catch {
      deferredError = true;                       // network etc. → skip, remember
    }
  }
  if (deferredError) throw new RoutingUnavailableError(authorityId); // → 503
  throw new NoAdapterError(authorityId);                            // → 404
}
```

- No match, no errors → `NoAdapterError` (**404**).
- No match, but some `canHandle` threw (e.g. a network failure) →
  `RoutingUnavailableError` (**503**).

Because `order` is load-bearing, put **cheap** matchers first: DID methods match
on a plain prefix with no I/O (`order` ~10), while protocols that require a
network probe come later (`order` ~100). Every `canHandle` should return `false`
before doing any I/O when the scheme obviously doesn't match, so sequential
evaluation stays cheap.

## How an adapter decides "is this mine?"

`authority_id` is an RFC 3986 URI. Different protocol families answer `canHandle`
differently:

| Protocol | How `canHandle` decides |
|----------|-------------------------|
| did:web / did:webvh / did:webs | method prefix, no I/O |
| OpenID Federation | `GET /.well-known/openid-federation` succeeds? (a **probe**) |
| EUDI Trusted List | is the authority a member of the loaded trusted list? |
| PKI (X.509) | does it chain to a configured trust anchor? |

Probing a well-known endpoint is legitimate — those endpoints exist precisely so
an entity can self-describe. And it does **not** add a new SSRF surface: the
resolver already fetches authority-controlled URLs during resolution, so
outbound fetching is guarded once, for all adapters, in a shared HTTP client
(block internal IP ranges, timeouts, no cross-host redirects). The per-authority
routing result is cached (see [Caching](./caching.md)), so a probe runs at most
once per authority.

## Errors

Adapter/routing errors extend `AdapterError`, which carries the HTTP status a
global filter maps to RFC 7807:

| Error | Status |
|-------|--------|
| `NoAdapterError` | 404 |
| `RoutingUnavailableError` | 503 |
| `UnsupportedOperationError` | 501 |
