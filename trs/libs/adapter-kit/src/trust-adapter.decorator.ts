import { applyDecorators, Injectable, SetMetadata } from '@nestjs/common';

export const TRUST_ADAPTER = 'TRUST_ADAPTER';

export interface TrustAdapterMeta {
  id: string;
  /** Smaller = checked earlier. did:* ~10 (cheap prefix), https probe/data ~100. */
  order: number;
}

/**
 * Marks a provider as a trust-protocol adapter. The AdapterRegistry
 * auto-discovers every provider carrying this metadata (DiscoveryService).
 */
export const TrustAdapter = (id: string, opts: { order?: number } = {}) =>
  applyDecorators(
    Injectable(),
    SetMetadata(TRUST_ADAPTER, { id, order: opts.order ?? 100 } as TrustAdapterMeta),
  );
