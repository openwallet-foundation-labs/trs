import { queryCacheKey } from './cache-key';

const base = {
  entity_id: 'did:web:issuer',
  authority_id: 'did:web:root.example',
  action: 'issue',
  resource: 'license',
};

describe('queryCacheKey', () => {
  it('is stable for identical queries', () => {
    expect(queryCacheKey('authz', { ...base })).toBe(
      queryCacheKey('authz', { ...base }),
    );
  });

  it('separates authorization from recognition', () => {
    expect(queryCacheKey('authz', base)).not.toBe(queryCacheKey('recog', base));
  });

  it('does not collide when a value contains the old separator', () => {
    const a = queryCacheKey('authz', {
      ...base,
      entity_id: 'a|b',
      action: 'c',
    });
    const b = queryCacheKey('authz', {
      ...base,
      entity_id: 'a',
      action: 'b|c',
    });
    expect(a).not.toBe(b);
  });

  it('includes context.time and context.locator', () => {
    const plain = queryCacheKey('authz', base);
    const timed = queryCacheKey('authz', {
      ...base,
      context: { time: '2026-01-01T00:00:00Z' },
    });
    const located = queryCacheKey('authz', {
      ...base,
      context: { locator: 'https://registry.example' },
    });
    expect(new Set([plain, timed, located]).size).toBe(3);
  });
});
