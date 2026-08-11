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
  const now = Date.now();
  const hit = this.store.get(key);
  if (hit && hit.expires > now) return hit.value as T;  // HIT: return, fn never runs
  const value = await fn();                              // MISS/expired: do the work
  this.store.set(key, { value, expires: now + ttlMs });
  return value;
}
```

The resolver uses it around the whole route-and-resolve step:

```ts
async authorize(q: AuthorizationQuery): Promise<AuthorizationResponse> {
  const key = `authz|${q.authority_id}|${q.entity_id}|${q.action}|${q.resource}|${q.context?.time ?? ''}`;
  return this.cache.wrap(key, async () => {
    const adapter = await this.registry.select(q.authority_id, q.context);
    const outcome = await adapter.resolveAuthorization(/* … */);
    return /* TRQP response */;
  });
}
```

- **Key** — every query parameter that affects the answer. Identical queries
  share an entry; a different `action`, `entity`, etc. gets its own.
- **Cached value** — the fully-mapped TRQP response. On a hit, neither routing
  (including any well-known probe) nor resolution runs. This is what makes
  probe-based routing cheap: at most one probe per authority.

## Current limitations

The in-memory cache is a starting point. Known gaps (tracked for later work):

- **`freshUntil` is not wired in yet** — adapters can report a natural freshness
  (certificate expiry, trusted-list `nextUpdate`, statement `exp`), but the
  resolver currently uses the fixed default TTL. Feeding `freshUntil` into the
  TTL is a TODO.
- **Errors are not cached** — a thrown error propagates and is not stored, so
  the negative-caching policy is still open.
- **In-memory only** — the cache is per-process; a shared backend (e.g. Redis)
  would come later behind the same interface.
- **No eviction / size bound** and **no in-flight de-duplication** (two
  concurrent misses both run the work).
