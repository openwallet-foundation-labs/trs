import { Inject, Injectable, Optional } from '@nestjs/common';

interface Entry {
  value: unknown;
  expires: number;
}

export interface CacheOptions {
  /** Upper bound on stored entries; the least recently used is evicted first. */
  maxEntries?: number;
}

export const CACHE_OPTIONS = Symbol('CACHE_OPTIONS');

export const DEFAULT_MAX_ENTRIES = 10_000;

export const DEFAULT_TTL_MS = 60_000;

/**
 * Minimal in-memory TTL cache (#16). The interface is intentionally the same
 * shape a Redis-backed impl would use later.
 *
 * Bounded LRU: `Map` keeps insertion order, so a hit is re-inserted to mark it
 * most recently used and an overflow drops the first (oldest) key. Expired
 * entries are removed when they are read, and otherwise age out via the bound.
 *
 * Concurrent misses for the same key share one in-flight `fn` call, so a burst
 * of identical queries does the expensive work once.
 */
@Injectable()
export class CacheService {
  private readonly store = new Map<string, Entry>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly maxEntries: number;

  constructor(@Optional() @Inject(CACHE_OPTIONS) opts?: CacheOptions) {
    this.maxEntries = opts?.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  get size(): number {
    return this.store.size;
  }

  /**
   * Return the cached value for `key`, or run `fn` and cache its result.
   * `ttlMs` may be a function of the computed value; a TTL of zero or less
   * means the result is returned but not stored.
   */
  async wrap<T>(
    key: string,
    fn: () => Promise<T>,
    ttlMs: number | ((value: T) => number) = DEFAULT_TTL_MS,
  ): Promise<T> {
    const hit = this.store.get(key);
    if (hit) {
      this.store.delete(key);
      if (hit.expires > Date.now()) {
        this.store.set(key, hit);
        return hit.value as T;
      }
    }
    const pending = this.inflight.get(key);
    if (pending) return pending as Promise<T>;

    const run = (async () => {
      try {
        const value = await fn();
        const ttl = typeof ttlMs === 'function' ? ttlMs(value) : ttlMs;
        if (ttl > 0) this.set(key, value, ttl);
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, run);
    return run;
  }

  private set(key: string, value: unknown, ttlMs: number): void {
    this.store.delete(key);
    this.store.set(key, { value, expires: Date.now() + ttlMs });
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value as string;
      this.store.delete(oldest);
    }
  }
}
