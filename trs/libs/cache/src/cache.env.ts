import type { CacheOptions } from './cache.service';

export const CACHE_ENV = {
  maxEntries: 'TRS_CACHE_MAX_ENTRIES',
} as const;

export function cacheOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): CacheOptions {
  const raw = env[CACHE_ENV.maxEntries]?.trim();
  if (!raw) return {};
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(
      `${CACHE_ENV.maxEntries} must be a positive integer, got "${raw}"`,
    );
  }
  return { maxEntries: n };
}
