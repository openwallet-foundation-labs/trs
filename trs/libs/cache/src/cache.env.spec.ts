import { cacheOptionsFromEnv } from './cache.env';

describe('cacheOptionsFromEnv', () => {
  it('returns defaults when unset', () => {
    expect(cacheOptionsFromEnv({})).toEqual({});
  });

  it('reads TRS_CACHE_MAX_ENTRIES', () => {
    expect(cacheOptionsFromEnv({ TRS_CACHE_MAX_ENTRIES: '500' })).toEqual({
      maxEntries: 500,
    });
  });

  it.each(['0', '-5', '1.5', 'many'])('rejects %p', (v) => {
    expect(() => cacheOptionsFromEnv({ TRS_CACHE_MAX_ENTRIES: v })).toThrow(
      'TRS_CACHE_MAX_ENTRIES must be a positive integer',
    );
  });
});
