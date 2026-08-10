import { Injectable, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import type { TrqpContext } from '@trs/trqp-core';
import { TRUST_ADAPTER, TrustAdapterMeta } from './trust-adapter.decorator';
import type { TrustProtocolAdapter } from './adapter.interface';
import { NoAdapterError, RoutingUnavailableError } from './errors';

/**
 * Collects every `@TrustAdapter` provider (via DiscoveryService), keeps them
 * sorted by `order`, and routes by order-based first-match (see #14).
 */
@Injectable()
export class AdapterRegistry implements OnModuleInit {
  private adapters: TrustProtocolAdapter[] = [];

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly reflector: Reflector,
  ) {}

  onModuleInit(): void {
    const found: { order: number; instance: TrustProtocolAdapter }[] = [];
    for (const wrapper of this.discovery.getProviders()) {
      if (!wrapper.metatype || !wrapper.instance) continue;
      const meta = this.reflector.get<TrustAdapterMeta>(TRUST_ADAPTER, wrapper.metatype);
      if (meta) {
        found.push({ order: meta.order, instance: wrapper.instance as TrustProtocolAdapter });
      }
    }
    this.adapters = found.sort((a, b) => a.order - b.order).map((f) => f.instance);
  }

  /** Adapters in evaluation order (for diagnostics/tests). */
  list(): TrustProtocolAdapter[] {
    return this.adapters;
  }

  /**
   * Order-based first-match. The first adapter whose `canHandle` resolves
   * truthy wins (short-circuit). If none match and some `canHandle` threw,
   * routing is unavailable (503); otherwise no adapter is found (404).
   */
  async select(authorityId: string, ctx?: TrqpContext): Promise<TrustProtocolAdapter> {
    let deferredError = false;
    for (const adapter of this.adapters) {
      try {
        if (await adapter.canHandle(authorityId, ctx)) return adapter;
      } catch {
        deferredError = true; // network etc. → skip, remember
      }
    }
    if (deferredError) throw new RoutingUnavailableError(authorityId);
    throw new NoAdapterError(authorityId);
  }
}
