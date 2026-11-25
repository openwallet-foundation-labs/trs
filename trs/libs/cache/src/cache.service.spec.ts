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

describe('CacheService TTL', () => {
  it('derives the TTL from the computed value', async () => {
    jest.useFakeTimers();
    const cache = new CacheService();
    const fn = jest.fn(async () => ({ ttl: 500 }));
    await cache.wrap('k', fn, (v) => v.ttl);
    jest.advanceTimersByTime(400);
    await cache.wrap('k', fn, (v) => v.ttl);
    expect(fn).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(200);
    await cache.wrap('k', fn, (v) => v.ttl);
    expect(fn).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('does not store a value whose TTL is zero or negative', async () => {
    const cache = new CacheService();
    expect(await cache.wrap('k', () => Promise.resolve('v'), 0)).toBe('v');
    expect(await cache.wrap('j', () => Promise.resolve('v'), -1)).toBe('v');
    expect(cache.size).toBe(0);
  });
});

describe('CacheService in-flight de-duplication', () => {
  function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  it('runs fn once for concurrent misses on the same key', async () => {
    const cache = new CacheService();
    const d = deferred<string>();
    const fn = jest.fn(() => d.promise);
    const calls = [
      cache.wrap('k', fn),
      cache.wrap('k', fn),
      cache.wrap('k', fn),
    ];
    d.resolve('v');
    expect(await Promise.all(calls)).toEqual(['v', 'v', 'v']);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not share work across different keys', async () => {
    const cache = new CacheService();
    const fn = jest.fn(async () => 'v');
    await Promise.all([cache.wrap('a', fn), cache.wrap('b', fn)]);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('propagates a shared rejection and retries on the next call', async () => {
    const cache = new CacheService();
    const d = deferred<string>();
    const failing = jest.fn(() => d.promise);
    const calls = [cache.wrap('k', failing), cache.wrap('k', failing)];
    d.reject(new Error('boom'));
    for (const c of calls) await expect(c).rejects.toThrow('boom');
    expect(failing).toHaveBeenCalledTimes(1);

    expect(await cache.wrap('k', async () => 'ok')).toBe('ok');
  });
});
