import { Injectable } from '@nestjs/common';

interface Entry {
  value: unknown;
  expires: number;
}

/**
 * Minimal in-memory TTL cache (#16). The interface is intentionally the same
 * shape a Redis-backed impl would use later.
 */
@Injectable()
export class CacheService {
  private readonly store = new Map<string, Entry>();

  async wrap<T>(key: string, fn: () => Promise<T>, ttlMs = 60_000): Promise<T> {
    const now = Date.now();
    const hit = this.store.get(key);
    if (hit && hit.expires > now) return hit.value as T;
    const value = await fn();
    this.store.set(key, { value, expires: now + ttlMs });
    return value;
  }
}
