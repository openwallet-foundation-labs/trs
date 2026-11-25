import { CacheService } from './cache.service';

describe('CacheService', () => {
  afterEach(() => jest.useRealTimers());

  it('returns the cached value without re-running fn within the TTL', async () => {
    const cache = new CacheService();
    const fn = jest.fn().mockResolvedValue('v');
    await cache.wrap('k', fn, 1_000);
    expect(await cache.wrap('k', fn, 1_000)).toBe('v');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('re-runs fn once the entry has expired', async () => {
    jest.useFakeTimers();
    const cache = new CacheService();
    const fn = jest.fn().mockResolvedValueOnce('a').mockResolvedValueOnce('b');
    await cache.wrap('k', fn, 1_000);
    jest.advanceTimersByTime(1_001);
    expect(await cache.wrap('k', fn, 1_000)).toBe('b');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(cache.size).toBe(1);
  });

  it('does not cache a rejected fn', async () => {
    const cache = new CacheService();
    await expect(
      cache.wrap('k', () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
    expect(cache.size).toBe(0);
  });

  it('evicts the least recently used entry when over maxEntries', async () => {
    const cache = new CacheService({ maxEntries: 2 });
    const val = (v: string) => () => Promise.resolve(v);
    await cache.wrap('a', val('a'));
    await cache.wrap('b', val('b'));
    await cache.wrap('a', val('a')); // touch a, so b is now oldest
    await cache.wrap('c', val('c'));
    expect(cache.size).toBe(2);

    const fn = jest.fn().mockResolvedValue('b2');
    expect(await cache.wrap('b', fn)).toBe('b2');
    expect(fn).toHaveBeenCalledTimes(1);

    const kept = jest.fn().mockResolvedValue('x');
    expect(await cache.wrap('c', kept)).toBe('c');
    expect(kept).not.toHaveBeenCalled();
  });
});
