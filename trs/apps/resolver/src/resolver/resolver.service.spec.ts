import type { AdapterRegistry, TrustProtocolAdapter } from '@app/adapter-kit';
import { CacheService, DEFAULT_TTL_MS } from '@app/cache';
import { ResolverService, ttlFor } from './resolver.service';

const query = {
  entity_id: 'did:web:issuer',
  authority_id: 'did:web:root.example',
  action: 'issue',
  resource: 'license',
};

function setup(freshUntil?: Date) {
  const adapter: TrustProtocolAdapter = {
    id: 'test',
    canHandle: async () => true,
    resolveAuthorization: jest.fn(async () => ({
      authorized: true,
      freshUntil,
    })),
    resolveRecognition: jest.fn(async () => ({
      recognized: true,
      freshUntil,
    })),
  };
  const registry = {
    select: async () => adapter,
  } as unknown as AdapterRegistry;
  return {
    adapter,
    service: new ResolverService(registry, new CacheService()),
  };
}

describe('ttlFor', () => {
  const now = 1_000_000;

  it('uses the default TTL without freshUntil', () => {
    expect(ttlFor(undefined, now)).toBe(DEFAULT_TTL_MS);
  });

  it('shortens the TTL to freshUntil when that is sooner', () => {
    expect(ttlFor(new Date(now + 5_000), now)).toBe(5_000);
  });

  it('caps a distant freshUntil at the default', () => {
    expect(ttlFor(new Date(now + 10 * DEFAULT_TTL_MS), now)).toBe(
      DEFAULT_TTL_MS,
    );
  });

  it('returns a non-positive TTL for an already-stale outcome', () => {
    expect(ttlFor(new Date(now - 1), now)).toBeLessThanOrEqual(0);
  });
});

describe('ResolverService caching', () => {
  it('caches a fresh outcome', async () => {
    const { adapter, service } = setup();
    await service.authorize(query);
    await service.authorize(query);
    expect(adapter.resolveAuthorization).toHaveBeenCalledTimes(1);
  });

  it('does not cache an outcome that is already stale', async () => {
    const { adapter, service } = setup(new Date(Date.now() - 1_000));
    await service.recognize(query);
    await service.recognize(query);
    expect(adapter.resolveRecognition).toHaveBeenCalledTimes(2);
  });
});
