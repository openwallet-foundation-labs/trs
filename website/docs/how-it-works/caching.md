---
title: Caching
sidebar_position: 3
---

# Caching

Routing and resolution can be expensive (well-known probes, chain verification,
trusted-list lookups). The resolver wraps each query in a cache so that repeated,
identical queries are answered without redoing that work.

## `CacheService.wrap`

`CacheService` (in `libs/cache`) is a small cache-aside helper:

```ts
async wrap<T>(key: string, fn: () => Promise<T>, ttlMs = 60_000): Promise<T> {
  const hit = this.store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T; // HIT: fn never runs
  const value = await fn();                                    // MISS/expired: do the work
  this.set(key, value, ttlMs);                                 // store, evicting LRU if full
  return value;
}
```

The resolver uses it around the whole route-and-resolve step:

```ts
async authorize(q: AuthorizationQuery): Promise<AuthorizationResponse> {
  return this.cache.wrap(queryCacheKey('authz', q), async () => {
    const adapter = await this.registry.select(q.authority_id, q.context);
    const outcome = await adapter.resolveAuthorization(/* … */);
    return /* TRQP response */;
  });
}
```

- **Key** — every query parameter that affects the answer (including
  `context.time` and `context.locator`), JSON-encoded so a free-form value such
  as `entity_id` cannot collide with another query. Identical queries share an
  entry; a different `action`, `entity`, etc. gets its own.
- **Cached value** — the fully-mapped TRQP response. On a hit, neither routing
  (including any well-known probe) nor resolution runs. This is what makes
  probe-based routing cheap: at most one probe per authority.

## TTL and `freshUntil`

Entries live for the default TTL (60 s) unless the adapter reports a sooner
natural expiry via `freshUntil` (certificate `NotAfter`, trusted-list
`nextUpdate`, statement `exp`, …). The resolver then uses the shorter of the
two, so a cached decision never outlives the data it was derived from. An
outcome whose `freshUntil` is already in the past is returned but not cached.

## In-flight de-duplication

Concurrent misses for the same key share one in-flight call: the first request
does the work and the rest await its promise. If that call fails, every waiter
gets the error and nothing is cached, so the next request tries again.

## Current limitations

The in-memory cache is a starting point. Known gaps (tracked for later work):

- **Errors are not cached** — a thrown error propagates and is not stored, so
  the negative-caching policy is still open.
- **In-memory only** — the cache is per-process; a shared backend (e.g. Redis)
  would come later behind the same interface.

## Size bound

The store is a bounded LRU (default `10_000` entries). A hit moves the entry to
the most-recently-used end; when a write pushes the store over the limit, the
least recently used entry is dropped. Expired entries are removed when read and
otherwise age out through the same bound. Override the limit by providing
`CACHE_OPTIONS`:

```ts
{ provide: CACHE_OPTIONS, useValue: { maxEntries: 50_000 } }
```
